/**
 * honesty.test.ts — Phase 5 hardening: the exception "honesty drill".
 *
 * Spec/BUILD_PLAN Phase 5: *force a LOW_CONFIDENCE record in the batch and assert
 * it appears in the exception list (never hidden).*
 *
 * The engine is deterministic-first: exact/normalized keys resolve first, and the
 * HeuristicJudge arbitrates only the residual. This test proves the two sides of
 * the honesty contract headlessly:
 *   1. When two records look alike but share NO identifier, the judge does not
 *      guess a match — both are surfaced as exceptions (PARTIAL_FLAP), never
 *      merged into a group, never dropped.
 *   2. Forcing a record to sub-threshold confidence (the drill) still surfaces it:
 *      it lands in the exception list marked forced-low, and is never pushed into
 *      a match group.
 */
import { describe, it, expect } from 'vitest';
import type { Batch, SourceKind } from '../src/core/types.js';
import { CloseEngine } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';

const GATEWAY_ID = 'rec:razorpay-gateway:pay_G';
const BANK_ID = 'rec:bank-utr:UTR_B';

/** Two near-amount, near-date records that share NO identifier key. */
function ambiguousBatch(): Batch {
  const gateway: Record<string, unknown> = {
    paymentId: 'pay_G',
    orderId: 'ORD_G',
    utr: 'UTR_G',
    amount: 100,
    date: '2026-08-14',
    customer: 'Acme Retail Pvt Ltd',
    method: 'card',
    description: 'Acme Retail Pvt Ltd',
  };
  const bank: Record<string, unknown> = {
    utr: 'UTR_B',
    amount: 100,
    date: '2026-08-14',
    counterparty: 'Acme Retail Pvt Ltd',
    narration: 'settlement UTR_B',
  };
  return {
    id: 'batch-drill',
    sources: [
      { source: 'razorpay-gateway' as SourceKind, rows: [gateway] },
      { source: 'bank-utr' as SourceKind, rows: [bank] },
    ],
  };
}

function runWith(judge: HeuristicJudge) {
  const report = new CloseEngine(undefined, judge).run(ambiguousBatch());
  const ctx = report.__ctx!;
  const matchedIds = new Set<string>(ctx.groups.flatMap((g) => g.recordIds));
  const exceptionIds = new Set<string>();
  for (const e of report.exceptions) if (e.recordId) exceptionIds.add(e.recordId);
  return { report, ctx, matchedIds, exceptionIds };
}

describe('honesty drill (LOW_CONFIDENCE is surfaced, never hidden)', () => {
  it('baseline: ambiguous near-amount records are NOT force-matched', () => {
    const { report, matchedIds, exceptionIds } = runWith(new HeuristicJudge());
    // never guessed into a group
    expect(matchedIds.size).toBe(0);
    // both surfaced as exceptions, never dropped
    expect(exceptionIds.has(GATEWAY_ID)).toBe(true);
    expect(exceptionIds.has(BANK_ID)).toBe(true);
    // no JUDGED method groups were asserted on pure fuzzy text
    expect(report.__ctx!.groups.every((g) => g.method !== 'JUDGED')).toBe(true);
  });

  it('drill: forcing a record low-confidence still surfaces it, not hidden', () => {
    const judge = new HeuristicJudge();
    judge.forceLowConfidence([GATEWAY_ID]); // the drill
    const { report, matchedIds, exceptionIds } = runWith(judge);

    // the forced record is NOT resolved into any group
    expect(matchedIds.has(GATEWAY_ID)).toBe(false);
    // and it IS surfaced in the exception list
    expect(exceptionIds.has(GATEWAY_ID)).toBe(true);

    const exc = report.exceptions.find((e) => e.recordId === GATEWAY_ID)!;
    expect(exc).toBeTruthy();
    // payload preserved; reason marks it forced-low (the force took effect)
    expect(exc.recordJson.amountPaise).toBe(10000);
    expect(exc.rationale).toMatch(/forced-low/);
    expect(matchedIds.size).toBe(0); // neither ambiguous record was matched
  });

  it('the partner record stays an exception too (no asymmetric hiding)', () => {
    const judge = new HeuristicJudge();
    judge.forceLowConfidence([GATEWAY_ID]);
    const { exceptionIds } = runWith(judge);
    expect(exceptionIds.has(BANK_ID)).toBe(true);
  });
});
