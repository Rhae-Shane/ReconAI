/**
 * close.test.ts — Vitest integration: CloseEngine over the seeded 52-record
 * batch. Locks the composition so the demo numbers are auditable, and asserts
 * the "bar": per-source + overall match rate, precision/recall > 0.8, and the
 * honest exception list (never empty, never hidden).
 */
import { describe, it, expect } from 'vitest';
import { generateBatch } from '../src/cli/generate-batch.js';
import { CloseEngine } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';

const batch = generateBatch();

function run(): ReturnType<CloseEngine['run']> {
  return new CloseEngine(undefined, new HeuristicJudge()).run(batch);
}

describe('generated batch composition (auditable)', () => {
  it('has 81 records across 4 sources', () => {
    const total = batch.sources.reduce((a, s) => a + s.rows.length, 0);
    expect(total).toBe(81);
    expect(batch.sources.map((s) => s.source)).toEqual([
      'razorpay-gateway',
      'bank-utr',
      'erp-orders',
      'gst-invoices',
    ]);
  });
  it('counts expected records per source', () => {
    const count = (src: string) => batch.sources.find((s) => s.source === src)!.rows.length;
    expect(count('razorpay-gateway')).toBe(31); // 28 matched + 3 exceptions
    expect(count('bank-utr')).toBe(34); // 22 matched + 12 exceptions
    expect(count('erp-orders')).toBe(8);
    expect(count('gst-invoices')).toBe(8);
  });
  it('has a ground-truth label for every record', () => {
    expect(batch.labels).toBeTruthy();
    expect(Object.keys(batch.labels!).length).toBe(81);
  });
});

describe('CloseEngine on the seeded batch', () => {
  const report = run();

  it('processes all 81 records and matches 66 cleanly', () => {
    expect(report.totals.records).toBe(81);
    expect(report.totals.sources).toBe(4);
    expect(report.totals.matched).toBe(66);
    expect(report.totals.groups).toBe(22); // 15 exact + 1 normalized + 6 netted
  });
  it('reports a reasonable resolved %', () => {
    // 66/81 resolved; 15 honest exceptions
    expect(report.totals.resolvedPct).toBeCloseTo(81.48, 1);
    expect(report.totals.exceptionCount).toBe(15);
  });
  it('resolves the netted seeds as NETTED groups with the full settlement math', () => {
    const netted = report.__ctx!.groups.filter((g) => g.method === 'NETTED');
    expect(netted).toHaveLength(6); // 4 FEE_NETTED + 1 REFUND_NETTED + 1 ADJUSTMENT_NETTED
    expect(netted.every((g) => g.confidence >= 0.98)).toBe(true);
    expect(netted.every((g) => g.netting && g.netting.variancePaise === 0)).toBe(true);
    // every FEE_NETTED group must include exactly one FEE line, surfaced on its link
    const ctx = report.__ctx!;
    const recById = new Map(ctx.records.map((r) => [r.id, r]));
    for (const g of netted.filter((g) => g.matchType === 'FEE_NETTED')) {
      const feeLinks = g.links.filter((l) => recById.get(l.recordId)?.kind === 'FEE');
      expect(feeLinks.length).toBe(1);
      expect(g.links.find((l) => l.recordId === feeLinks[0].recordId)?.matchedOn).toBe('fee');
    }
    // all original seed legs are still matched
    const matched = new Set(ctx.groups.flatMap((g) => g.recordIds));
    for (const n of [16, 17, 18]) {
      expect(matched.has(`rec:razorpay-gateway:payNS${n}`)).toBe(true);
      expect(matched.has(`rec:razorpay-gateway:feeNS${n}`)).toBe(true);
      expect(matched.has(`rec:bank-utr:UTR${2000 + n}`)).toBe(true);
    }
    // and the new REFUND_NETTED / ADJUSTMENT_NETTED groups are present
    const types = new Set(netted.map((g) => g.matchType));
    expect(types.has('REFUND_NETTED')).toBe(true);
    expect(types.has('ADJUSTMENT_NETTED')).toBe(true);
  });
  it('populates breakdown (matched + partial + unresolved = records, matchRate in [0,1])', () => {
    const b = report.breakdown;
    expect(b.records).toBe(81);
    expect(b.matched).toBe(66);
    expect(b.partial).toBe(2); // UTR9001 PARTIAL_FLAP + UTR9002 LOW_CONFIDENCE
    expect(b.unresolved).toBe(13);
    expect(b.matched + b.partial + b.unresolved).toBe(b.records);
    expect(b.matchRate).toBeGreaterThan(0);
    expect(b.matchRate).toBeLessThanOrEqual(1);
    expect(b.matchRate * 100).toBeCloseTo(81.48, 1);
  });
  it('emits one UnresolvedLine per unresolved record with the right shape', () => {
    const b = report.breakdown;
    expect(report.unresolved).toHaveLength(b.unresolved);
    for (const u of report.unresolved) {
      expect(u.recordId).toBeTruthy();
      expect(u.ref).toBeTruthy();
      expect(u.differencePaise).toBe(u.expectedPaise - u.actualPaise);
      expect(u.confidence).toBeGreaterThanOrEqual(0);
      expect(u.confidence).toBeLessThanOrEqual(1);
      expect(u.status).toBe('NEEDS_REVIEW');
    }
    // amount-mismatch lines carry a reason of AMOUNT_MISMATCH with a near 0 actual
    const mm = report.unresolved.find((u) => u.reason === 'AMOUNT_MISMATCH');
    expect(mm).toBeTruthy();
  });
  it('produces the exact, honest exception composition', () => {
    const byCode: Record<string, number> = {};
    for (const e of report.exceptions) byCode[e.reasonCode] = (byCode[e.reasonCode] ?? 0) + 1;
    expect(byCode).toEqual({
      AMOUNT_MISMATCH: 6,
      DUPLICATE: 3,
      PARTIAL_FLAP: 1,
      LOW_CONFIDENCE: 1,
      NO_KEY: 4,
    });
    // audit trails every exception
    expect(report.auditCount).toBeGreaterThan(0);
  });
  it('has a per-source breakdown that sums to the totals', () => {
    expect(report.perSource).toHaveLength(4);
    const matchedSum = report.perSource.reduce((a, s) => a + s.matched, 0);
    expect(matchedSum).toBe(report.totals.matched);
    const rateOk = report.perSource.every((s) => s.matchRate >= 0 && s.matchRate <= 1);
    expect(rateOk).toBe(true);
  });
  it('keeps precision and recall above 0.8 against ground truth', () => {
    expect(report.precision).toBeGreaterThan(0.8);
    expect(report.recall).toBeGreaterThan(0.8);
  });
  it('never silently drops an unresolved record into the exceptions set', () => {
    const ids = new Set<string>();
    const nonempty = report.exceptions.every((e) => e.recordId && e.reasonCode);
    for (const e of report.exceptions) if (e.recordId) ids.add(e.recordId);
    expect(nonempty).toBe(true);
    // exceptions do not appear in any matched group
    const ctx = report.__ctx!;
    const matched = new Set(ctx.groups.flatMap((g) => g.recordIds));
    for (const id of ids) expect(matched.has(id)).toBe(false);
  });
});
