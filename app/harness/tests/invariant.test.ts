/**
 * invariant.test.ts — Conservation & integrity laws that must hold across ANY
 * close run (the new netting data model), independent of the specific batch.
 *
 *  1. Partition law: matched + partial + unresolved === total records.
 *  2. Netting identity: netExpected = gross − fee − taxOnFee − refund + adjustment,
 *     and netExpected ≡ actualSettlement within paiseTolerance (balanced net).
 *  3. A record is consumed by at most one MatchGroup (groups are disjoint).
 *  4. Every resolved/reviewed exception traces to an EXCEPTION audit event.
 *  5. No group is formed from bare fuzzy text alone — every non-netted group is
 *     identifier-backed (a shared normalized key), guaranteed structurally by
 *     HeuristicJudge.NO_REF_CAP < resolveThreshold.
 */
import { describe, it, expect } from 'vitest';
import { generateBatch } from '../src/cli/generate-batch.js';
import { CloseEngine } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { resolveConfig } from '../src/core/config.js';
import { normalizedKeys } from '../src/core/reconcile.js';
import type { MatchGroup, ExceptionRecord, FinRecord } from '../src/core/types.js';

const batch = generateBatch();
const cfg = resolveConfig();
// One canonical run whose __ctx (groups/records/audit/ledger) the invariants read.
const report = new CloseEngine(undefined, new HeuristicJudge()).run(batch);
const ctx = report.__ctx!;

describe('invariant 1: partition law (conservation of records)', () => {
  it('matched + partial + unresolved === total records for the breakdown', () => {
    const b = report.breakdown;
    expect(b.matched + b.partial + b.unresolved).toBe(b.records);
    expect(b.records).toBe(report.totals.records);
  });
  it('the count of grouped records equals breakdown.matched', () => {
    const grouped = new Set(ctx.groups.flatMap((g) => g.recordIds)).size;
    expect(grouped).toBe(report.breakdown.matched);
  });
});

describe('invariant 2: netting identity (financial conservation)', () => {
  const netted: MatchGroup[] = ctx.groups.filter((g) => g.netting);

  it('every netted group carries a full NettingBreakdown', () => {
    expect(netted.length).toBeGreaterThan(0);
    for (const g of netted) {
      const n = g.netting!;
      for (const k of [
        'grossPaise',
        'feePaise',
        'taxOnFeePaise',
        'refundPaise',
        'adjustmentPaise',
        'netExpectedPaise',
        'actualSettlementPaise',
        'variancePaise',
      ] as const) {
        expect(typeof n[k], `${g.id}.${k}`).toBe('number');
        expect(Number.isFinite(n[k]), `${g.id}.${k}`).toBe(true);
      }
      // magnitudes: fees/tax/refund are non-negative; adjustment is signed
      expect(n.feePaise).toBeGreaterThanOrEqual(0);
      expect(n.taxOnFeePaise).toBeGreaterThanOrEqual(0);
      expect(n.refundPaise).toBeGreaterThanOrEqual(0);
    }
  });

  it('netExpected === gross − fee − taxOnFee − refund + adjustment (exact)', () => {
    for (const g of netted) {
      const n = g.netting!;
      const recomputed =
        n.grossPaise - n.feePaise - n.taxOnFeePaise - n.refundPaise + n.adjustmentPaise;
      expect(recomputed).toBe(n.netExpectedPaise);
      expect(n.variancePaise).toBe(n.actualSettlementPaise - n.netExpectedPaise);
    }
  });

  it('netExpected ≡ actualSettlement within paiseTolerance (balanced net)', () => {
    for (const g of netted) {
      const n = g.netting!;
      expect(Math.abs(n.actualSettlementPaise - n.netExpectedPaise)).toBeLessThanOrEqual(
        cfg.paiseTolerance,
      );
      expect(Math.abs(n.variancePaise)).toBeLessThanOrEqual(cfg.paiseTolerance);
    }
  });

  it('taxOnFee originates only from FEE records carrying a feeTax', () => {
    const byId = new Map(ctx.records.map((r) => [r.id, r]));
    for (const g of netted) {
      const feeTax = g.recordIds
        .map((id) => byId.get(id))
        .filter((r) => r && r.kind === 'FEE')
        .reduce((a, r) => a + Math.abs(r!.feeTaxPaise ?? 0), 0);
      expect(feeTax).toBe(g.netting!.taxOnFeePaise);
    }
  });
});

describe('invariant 3: no record consumed by more than one group (disjointness)', () => {
  it('recordIds and link recordIds are pairwise disjoint across groups', () => {
    const seen = new Map<string, string>();
    for (const g of ctx.groups) {
      for (const id of g.recordIds) {
        expect(seen.has(id), `record ${id} in both ${seen.get(id)} and ${g.id}`).toBe(false);
        seen.set(id, g.id);
      }
      // links always reference a member of recordIds, and never repeat it
      const linkIds = g.links.map((l) => l.recordId);
      expect(new Set(linkIds).size).toBe(linkIds.length);
      for (const l of g.links) expect(g.recordIds).toContain(l.recordId);
    }
  });
});

describe('invariant 4: resolved/reviewed exceptions always have an EXCEPTION audit trail', () => {
  it('every exception is backed by an EXCEPTION audit event for its recordId', () => {
    const exceptAudit = new Set(
      ctx.audit.all.filter((a) => a.action === 'EXCEPTION').map((a) => a.recordId),
    );
    const exceptions = [...ctx.ledger.all].filter((e) => e.recordId);
    expect(exceptions.length).toBe(report.totals.exceptionCount);
    for (const e of exceptions) {
      expect(exceptAudit.has(e.recordId!), `no EXCEPTION audit for ${e.recordId}`).toBe(true);
    }
  });

  it('marking exceptions RESOLVED (review) still leaves them covered by their audit trail', () => {
    // Simulate the close-control resolution step on a copy of the run's state:
    // resolve every exception; the conservation law is that the underlying
    // EXCEPTION audit event was already written at creation time, so no resolved
    // record is ever left without provenance.
    const resolved: ExceptionRecord[] = ctx.ledger.all.map((e) => ({
      ...e,
      status: 'RESOLVED',
      reviewerDecision: 'RESOLVE_AUTO',
    }));
    const exceptAudit = new Set(
      ctx.audit.all.filter((a) => a.action === 'EXCEPTION').map((a) => a.recordId),
    );
    for (const e of resolved) {
      if (e.status === 'RESOLVED' || e.reviewerDecision) {
        if (e.recordId) expect(exceptAudit.has(e.recordId!)).toBe(true);
      }
    }
  });
});

describe('invariant 5: no group formed on bare fuzzy text alone', () => {
  it('every non-netted group is identifier-backed (share a normalized key)', () => {
    const byId = new Map(ctx.records.map((r) => [r.id, r]));
    let judged = 0;
    for (const g of ctx.groups) {
      if (g.netting) continue; // netting identity is its own justification
      if (g.method === 'JUDGED') judged++;
      const recs = g.recordIds
        .map((id) => byId.get(id))
        .filter((r): r is FinRecord => r !== undefined);
      let sharedKey = false;
      for (let i = 0; i < recs.length && !sharedKey; i++) {
        const keys = new Set(normalizedKeys(recs[i]));
        for (let j = i + 1; j < recs.length; j++) {
          if (normalizedKeys(recs[j]).some((k) => keys.has(k))) {
            sharedKey = true;
            break;
          }
        }
      }
      expect(sharedKey, `${g.id} (${g.method}) merged without a normalized ref or netting`).toBe(
        true,
      );
    }
    void judged;
  });

  it('second-order guard: NO_REF_CAP < resolveThreshold forbids text-only resolution', () => {
    // HeuristicJudge caps confidence at NO_REF_CAP when there is no identifier-
    // backed (normalized ref) match. Because that cap sits strictly below the
    // engine's resolveThreshold, the judge can never promote a mere fuzzy-text
    // candidate into a MATCHED/JUDGED group.
    expect(HeuristicJudge.NO_REF_CAP).toBeLessThan(cfg.resolveThreshold);
  });
});
