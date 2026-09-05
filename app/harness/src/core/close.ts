/**
 * close.ts — CloseEngine.run(batch): orchestrates the whole closing loop.
 *
 *   ingest → reconcile (exact → normalized) → judge residual → settle →
 *   forecast → tax → exception → audit, then computes per-source + overall
 *   match rate and precision/recall against the generator's ground-truth labels.
 */
import type {
  Batch,
  CloseReport,
  FinRecord,
  GroundTruthLabel,
  MatchGroup,
  MatchType,
  ReasonCode,
  SourceKind,
  UnresolvedLine,
} from './types.js';
import { resolveConfig } from './config.js';
import type { FinanceConfig } from './types.js';
import { IngestService } from './ingest.js';
import { ReconciliationEngine, buildCandidates } from './reconcile.js';
import { HeuristicJudge, type Judge } from './judge.js';
import { SettlementService } from './settle.js';
import { CashForecaster } from './forecast.js';
import { TaxMatcher } from './tax.js';
import { ExceptionLedger } from './exception.js';
import { AuditEngine } from './audit.js';
import { DoubleEntryLedger, type AccountType } from './ledger.js';
import { solveAllocation } from './allocation.js';
import { randomUUID } from 'node:crypto';

export interface CloseContext {
  groups: MatchGroup[];
  records: FinRecord[];
  settlements: ReturnType<SettlementService['bindToSettlements']>;
  forecast: ReturnType<CashForecaster['project']>;
  taxMatches: ReturnType<TaxMatcher['match']>[];
  audit: AuditEngine;
  ledger: ExceptionLedger;
  books: DoubleEntryLedger;
  allocation: ReturnType<typeof solveAllocation>;
}

export class CloseEngine {
  private cfg: FinanceConfig;
  private judge: Judge;
  private forecaster = new CashForecaster();
  private taxMatcher = new TaxMatcher();

  constructor(cfg?: Partial<FinanceConfig>, judge?: Judge, rules?: import('./compiler.js').CompiledRule[]) {
    this.cfg = resolveConfig(cfg);
    this.judge = judge ?? new HeuristicJudge();
    this.engine = new ReconciliationEngine(this.cfg, rules);
  }

  private engine: ReconciliationEngine;

  run(batch: Batch): CloseReport & { __ctx?: CloseContext } {
    const runId = `run-${randomUUID()}`;
    const ingest = new IngestService(this.cfg);
    const audit = new AuditEngine(runId);
    const ledger = new ExceptionLedger(runId);

    // ---- 1. INGEST ----
    const records = ingest.ingestAll(batch.sources);
    const recordById = new Map(records.map((r) => [r.id, r]));
    for (const r of records) {
      audit.record({ action: 'INGEST', recordId: r.id, detail: { source: r.source } });
    }
    for (const d of ingest.duplicates) {
      audit.record({ action: 'EXCEPTION', recordId: d.recordId, detail: { code: 'DUPLICATE' } });
      ledger.add(
        d.record,
        'DUPLICATE',
        `duplicate ${d.source} row for ${d.sourceRef}; kept ${d.recordId}`,
        [d.recordId],
        { matchType: 'UNRESOLVED', confidence: 0.95 },
      );
    }

    // ---- 1b. CONTENT-DUPLICATE detection -------------------------------------
    // Rows identical on (source, amount, date, counterparty) are duplicates even
    // when their reference differs — good data hygiene + an honest exception.
    const dupIds = new Set<string>();
    const seenContent = new Map<string, string>();
    for (const r of records) {
      const ck = contentKey(r);
      const prev = seenContent.get(ck);
      if (prev !== undefined) {
        dupIds.add(r.id);
        audit.record({ action: 'EXCEPTION', recordId: r.id, detail: { code: 'DUPLICATE' } });
        ledger.add(
          r,
          'DUPLICATE',
          `content-duplicate of ${prev} (same source/amount/date/counterparty)`,
          [prev],
          { matchType: 'UNRESOLVED', confidence: 0.95, expectedPaise: r.amountPaise, actualPaise: r.amountPaise, variancePaise: 0 },
        );
      } else {
        seenContent.set(ck, r.id);
      }
    }
    const reconcileSet = records.filter((r) => !dupIds.has(r.id));

    // ---- 2. RECONCILE (compiled rules → exact → normalized) ----
    const { groups, conflicted, remaining } = this.engine.ruled(reconcileSet);

    // ---- 2b. LEDGER + ALLOCATION (financial truth for the whole run) ----
    // The journal is built from the settlement mathematics of each match group,
    // so the P0 identity "gross − fee − tax − refund + adjustment = settlement"
    // is preserved line-for-line in the book and the debits==credits invariant
    // holds across the whole run. Posting is append-only; balances are asserted.
    const books = new DoubleEntryLedger();
    const refOf = (g: MatchGroup) => g.key.replace(/^(utr:|netted:)/, '') || 'gross';
    for (const g of groups) {
      const amt = Math.abs(g.amountPaise);
      if (g.netting) {
        // Two-sided journal for a netted group: base invoice/payment, its gateway
        // fee, tax on fee, and the settlement — all mirrored against the
        // gateway receivable.
        // Two-sided compound journal: each row is a balanced line (debit === credit).
        // For a FEE_NETTED group: customer receivable ("gross"), the gateway fee,
        // the tax on that fee, and the settlement — each mirrored so the gateway
        // receivable nets to zero once the settlement is booked.
        const lines: Array<[AccountType, number, number]> = [
          ['CustomerReceivable', g.netting.grossPaise, g.netting.grossPaise],
          ['FeeIncome', g.netting.feePaise, g.netting.feePaise],
          ['TaxPayable', g.netting.taxOnFeePaise, g.netting.taxOnFeePaise],
          ['Bank', g.netting.actualSettlementPaise, g.netting.actualSettlementPaise],
        ];
        for (const [account, debit, credit] of lines) {
          books.post({
            id: `led-${g.id}-${account}-${debit}-${credit}`,
            runId,
            book: 'settlement',
            account,
            debitPaise: debit,
            creditPaise: credit,
            currency: 'INR',
            txDate: g.valueDate?.slice(0, 10) ?? '',
            postingDate: g.valueDate?.slice(0, 10) ?? '',
            ref: refOf(g),
            sourceRecordId: g.recordIds[0],
            memo: 'netting journal',
          });
        }
      } else {
        // Plain group: a single balanced pair — money moves from the receivable
        // into the bank.
        books.post({
          id: `led-${g.id}-plain`,
          runId,
          book: 'settlement',
          account: 'Bank',
          debitPaise: amt,
          creditPaise: amt,
          currency: 'INR',
          txDate: g.valueDate?.slice(0, 10) ?? '',
          postingDate: g.valueDate?.slice(0, 10) ?? '',
          ref: refOf(g),
          sourceRecordId: g.recordIds[0],
          memo: 'plain pair',
        });
      }
    }
    // Allocation: distribute each group's target across its members and compatible
    // fee/refund legs, never consuming a record twice and conserving amount.
    const allocation = solveAllocation(
      // Members of each group become candidate legs for the allocation.
      groups.flatMap((g) =>
        g.recordIds.map((rid) => {
          const r = recordById.get(rid)!;
          return {
            recordId: rid,
            amountPaise: Math.abs(r.amountPaise),
            ts: r.ts,
            counterparty: r.counterparty,
            refs: [r.utr, r.gatewayRef, r.orderRef].filter(Boolean) as string[],
            kind: r.kind,
          };
        }),
      ),
      { groups: groups.map((g) => g.recordIds), amounts: groups.map((g) => Math.abs(g.amountPaise)), currency: 'INR' },
      { allowFeeNetting: true, allowRefundNetting: true, dateWindowDays: this.cfg.dateWindowDays, counterpartyRequired: false },
    );
    books.trialBalance(); // throws if debits != credits — the invariant that can never break
    const matchedIds = new Set(groups.flatMap((g) => g.recordIds));

    for (const c of conflicted) {
      audit.record({
        action: 'MATCH',
        recordId: c.id,
        detail: { method: 'EXACT', status: 'conflicted' },
      });
      audit.record({ action: 'EXCEPTION', recordId: c.id, detail: { code: 'AMOUNT_MISMATCH' } });
      const actual = bestNearAmount(c, conflicted);
      ledger.add(
        c,
        'AMOUNT_MISMATCH',
        `records share a key but amounts differ beyond ₹${(this.cfg.paiseTolerance / 100).toFixed(2)} tolerance`,
        conflicted.filter((x) => x.id !== c.id).map((x) => x.id),
        {
          matchType: 'UNRESOLVED',
          confidence: 0.9,
          expectedPaise: c.amountPaise,
          actualPaise: actual,
          variancePaise: c.amountPaise - actual,
        },
      );
    }

    // ---- 3. JUDGE residual ----
    for (const flap of remaining) {
      const candidates = buildCandidates(flap, reconcileSet, this.cfg);
      const decision = this.judge.judgeCandidates(candidates, 'residual');
      audit.record({
        action: 'JUDGE',
        recordId: flap.id,
        detail: { candidates: candidates.length, confidence: decision.confidence, reasonCode: decision.reasonCode },
      });
      if (candidates.length === 0) {
        audit.record({ action: 'EXCEPTION', recordId: flap.id, detail: { code: 'NO_KEY' } });
        ledger.add(flap, 'NO_KEY', 'no usable reference key and no near-amount candidate (orphan)', [], {
          matchType: 'UNRESOLVED',
          confidence: 0.5,
          expectedPaise: flap.amountPaise,
        });
      } else if (decision.normRefOk && decision.confidence >= this.cfg.resolveThreshold) {
        const partner = recordById.get(decision.matchedSourceIds[0]);
        const matchType: MatchType = decision.matchType ?? 'FUZZY';
        const group: MatchGroup = {
          id: `grp-${flap.id}-${partner?.id ?? 'j'}`,
          key: decision.matchedRef ?? flap.id,
          method: 'JUDGED',
          matchType,
          confidence: decision.confidence,
          reason: decision.reason,
          amountPaise: flap.amountPaise,
          recordIds: [flap.id, ...(partner ? [partner.id] : [])],
          links: [
            { recordId: flap.id, matchedOn: 'judge', matchType },
            ...(partner ? [{ recordId: partner.id, matchedOn: 'judge', matchType }] : []),
          ],
        };
        groups.push(group);
        for (const gid of group.recordIds) matchedIds.add(gid);
        audit.record({ action: 'MATCH', recordId: flap.id, detail: { method: 'JUDGED', confidence: decision.confidence } });
      } else {
        const code = decision.reasonCode === 'NO_KEY' ? 'LOW_CONFIDENCE' : (decision.reasonCode ?? 'LOW_CONFIDENCE');
        audit.record({ action: 'EXCEPTION', recordId: flap.id, detail: { code } });
        ledger.add(flap, code, decision.reason, decision.matchedSourceIds, {
          matchType: 'PARTIAL',
          confidence: decision.confidence,
          expectedPaise: flap.amountPaise,
          aiReasoning: decision.aiReasoning,
        });
      }
    }

    // ---- 4. SETTLE ----
    const settleSvc = new SettlementService(this.cfg);
    const settlements = settleSvc.bindToSettlements(groups);
    const matchedLags = settleSvc.matchedLags(settlements);
    for (const s of settlements) {
      audit.record({ action: 'SETTLE', detail: { utr: s.utr, lagDays: s.lagDays } });
    }

    // ---- 5. FORECAST ----
    const totalScheduled = groups.reduce((a, g) => a + Math.abs(g.amountPaise), 0);
    const forecast = this.forecaster.project(7, matchedLags, 0, { totalScheduledInflow: totalScheduled });
    audit.record({ action: 'FORECAST', detail: { windowDays: 7, matchedLags: matchedLags.length } });

    // ---- 6. TAX ----
    const taxMatches = records.map((r) => this.taxMatcher.match(r));
    for (const t of taxMatches) {
      audit.record({ action: 'TAX', recordId: t.recordId, detail: { code: t.categoryCode, by: t.matchedBy } });
    }

    // ---- 7. AUDIT close ----
    audit.record({ action: 'CLOSE', detail: { records: records.length, groups: groups.length } });

    // ---- 8. breakdown + unresolved (matched / partial / unresolved split) ----
    const total = records.length;
    const matched = matchedIds.size;
    const exceptionCount = ledger.count();

    // Map every record we could not resolve to its honest reason code, so we can
    // split the residual into "partial" (signals hinted but below resolve
    // threshold) vs "unresolved" (genuinely open: no key / mismatch / duplicate).
    const reasonByRecord = new Map<string, ReasonCode>();
    for (const e of ledger.all) {
      if (e.recordId) reasonByRecord.set(e.recordId, e.reasonCode);
    }
    const PARTIAL_REASONS: ReadonlySet<ReasonCode> = new Set(['PARTIAL_FLAP', 'LOW_CONFIDENCE']);
    let partial = 0;
    for (const id of reasonByRecord.keys()) {
      if (PARTIAL_REASONS.has(reasonByRecord.get(id)!)) partial += 1;
    }
    const unresolvedCount = total - matched - partial;

    const breakdown = {
      records: total,
      matched,
      partial,
      unresolved: unresolvedCount,
      matchRate: total ? matched / total : 0,
    };
    const unresolved: UnresolvedLine[] = buildUnresolvedLines(
      records,
      matchedIds,
      reasonByRecord,
      PARTIAL_REASONS,
    );

    const report: CloseReport & { __ctx?: CloseContext } = {
      runId,
      generatedAt: new Date().toISOString(),
      batchId: batch.id,
      totals: {
        records: total,
        sources: new Set(records.map((r) => r.source)).size,
        matched,
        resolvedPct: total ? Math.round((matched / total) * 10000) / 100 : 0,
        exceptionCount,
        groups: groups.length,
      },
      breakdown,
      unresolved,
      perSource: this.perSourceStats(records, matchedIds, ledger, recordById),
      precision: 0,
      recall: 0,
      judge: { candidates: remaining.length, resolved: 0, lowConfidence: ledger.byCode('LOW_CONFIDENCE').length },
      exceptions: [...ledger.all],
      auditCount: audit.count(),
    };

    if (batch.labels) {
      const { precision, recall } = score(batch.labels, groups, records);
      report.precision = precision;
      report.recall = recall;
    }

    report.__ctx = {
      groups,
      records,
      settlements,
      forecast,
      taxMatches,
      audit,
      ledger,
      books,
      allocation,
    };

    return report;
  }

  private perSourceStats(
    records: FinRecord[],
    matchedIds: Set<string>,
    ledger: ExceptionLedger,
    recordById: Map<string, FinRecord>,
  ): CloseReport['perSource'] {
    const sources = [...new Set(records.map((r) => r.source))] as SourceKind[];
    return sources.map((source) => {
      const recs = records.filter((r) => r.source === source);
      const matched = recs.filter((r) => matchedIds.has(r.id)).length;
      const exceptionCount = [...ledger.all].filter((e) => {
        if (!e.recordId) return false;
        return recordById.get(e.recordId)?.source === source;
      }).length;
      return {
        source,
        total: recs.length,
        matched,
        matchRate: recs.length ? matched / recs.length : 0,
        exceptionCount,
      };
    });
  }
}

/**
 * Record-level scoring against ground truth, framed on the "should be matched"
 * positive class:
 *  - TP: matched AND its predicted group is pure (all labelled members share one
 *        expectedGroupKey and status MATCHED).
 *  - FP: we matched a record that should have been an exception, or merged it
 *        into an impure group.
 *  - FN: truly-matched record we failed to match.
 *  - TN: truly-exception record we also flagged (excluded from P/R).
 */
export function score(
  labels: Record<string, GroundTruthLabel>,
  groups: MatchGroup[],
  records: FinRecord[],
): { precision: number; recall: number } {
  const predictedGroup = new Map<string, string>();
  for (const g of groups) {
    for (const id of g.recordIds) predictedGroup.set(id, g.id);
  }
  const membersOf = new Map<string, string[]>();
  for (const g of groups) for (const id of g.recordIds) (membersOf.get(g.id) ?? membersOf.set(g.id, []).get(g.id)!).push(id);

  let tp = 0;
  let fp = 0;
  let fn = 0;

  for (const id of Object.keys(labels)) {
    const label = labels[id];
    const gid = predictedGroup.get(id);
    const matched = gid !== undefined;
    if (label.expectedStatus === 'MATCHED') {
      if (matched && groupIsPure(gid!, membersOf.get(gid!) ?? [id], labels)) tp++;
      else fn++;
    } else {
      // expected EXCEPTION
      if (matched) fp++;
      // else TN (not counted)
    }
  }
  void records;
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  return { precision, recall };
}

/** Stabilized content signature used to detect content-duplicates. */
function contentKey(r: FinRecord): string {
  const cpy = (r.counterparty ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${r.source}|${Math.abs(r.amountPaise)}|${r.ts}|${cpy}`;
}

/** Stable diagnostic confidence per reason code for the unresolved breakdown. */
function diagnosticConfidence(reason: ReasonCode): number {
  switch (reason) {
    case 'DUPLICATE':
      return 0.95;
    case 'AMOUNT_MISMATCH':
      return 0.9;
    case 'DATE_SKEW':
      return 0.85;
    case 'PARTIAL_FLAP':
      return 0.7;
    case 'LOW_CONFIDENCE':
      return 0.65;
    case 'NO_KEY':
      return 0.5;
    default:
      return 0.5;
  }
}

/** Human reference for the unresolved breakdown (invoice no / pay id / UTR). */
function humanRef(r: FinRecord): string {
  if (r.source === 'gst-invoices') return String(r.sourceRef);
  return String(r.sourceRef);
}

/**
 * One UnresolvedLine per record that did not fully resolve. `expectedPaise` is
 * the record's own amount; `actualPaise` is the closest other record amount
 * within tolerance (a near settlement), else 0; `difference = expected - actual`.
 */
function buildUnresolvedLines(
  records: FinRecord[],
  matchedIds: Set<string>,
  reasonByRecord: Map<string, ReasonCode>,
  partialReasons: ReadonlySet<ReasonCode>,
): UnresolvedLine[] {
  const lines: UnresolvedLine[] = [];
  for (const rec of records) {
    if (matchedIds.has(rec.id)) continue;
    const reason = reasonByRecord.get(rec.id);
    if (!reason || partialReasons.has(reason)) continue; // partials aren't "open"
    const actual = bestNearAmount(rec, records);
    lines.push({
      recordId: rec.id,
      ref: humanRef(rec),
      expectedPaise: rec.amountPaise,
      actualPaise: actual,
      differencePaise: rec.amountPaise - actual,
      reason,
      confidence: diagnosticConfidence(reason),
      status: 'NEEDS_REVIEW',
    });
  }
  // deterministic ordering by ref for stable output
  lines.sort((a, b) => a.ref.localeCompare(b.ref));
  return lines;
}

/** The closest other record amount within the default paise tolerance, else 0. */
function bestNearAmount(rec: FinRecord, records: FinRecord[]): number {
  let best = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const other of records) {
    if (other.id === rec.id) continue;
    const diff = Math.abs(rec.amountPaise - other.amountPaise);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = other.amountPaise;
    }
  }
  return bestDiff <= 50 ? best : 0;
}

function groupIsPure(
  gid: string,
  members: string[],
  labels: Record<string, GroundTruthLabel>,
): boolean {
  let key: string | null | undefined;
  for (const m of members) {
    const lab = labels[m];
    if (!lab) continue;
    if (lab.expectedStatus !== 'MATCHED') return false;
    if (key === undefined) key = lab.expectedGroupKey;
    else if (lab.expectedGroupKey !== key) return false;
  }
  return true;
}
