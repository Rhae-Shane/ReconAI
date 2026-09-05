/**
 * core.test.ts — Vitest unit tests for the accuracy-critical core:
 * matching rules, tolerance, date window, judge confidence, exceptions,
 * forecast arithmetic, tax rules, ingest idempotency, settlement lags.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Candidate,
  FinanceConfig,
  FinRecord,
  SourceKind,
} from '../src/core/types.js';
import { IngestService, recordId } from '../src/core/ingest.js';
import {
  ReconciliationEngine,
  normalizeRef,
  dateDelta,
  buildCandidates,
  amountSpan,
} from '../src/core/reconcile.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { CashForecaster } from '../src/core/forecast.js';
import { TaxMatcher } from '../src/core/tax.js';
import { ExceptionLedger } from '../src/core/exception.js';
import { SettlementService } from '../src/core/settle.js';
import { DEFAULTS } from '../src/core/config.js';

function rec(partial: Partial<FinRecord> & { id: string; source: SourceKind; sourceRef: string }): FinRecord {
  return {
    id: partial.id,
    source: partial.source,
    kind: partial.kind ?? 'PAYMENT',
    sourceRef: partial.sourceRef,
    ts: partial.ts ?? '2026-08-14',
    amountPaise: partial.amountPaise ?? 0,
    currency: partial.currency ?? 'INR',
    counterparty: partial.counterparty,
    description: partial.description,
    utr: partial.utr,
    gatewayRef: partial.gatewayRef,
    orderRef: partial.orderRef,
  };
}

const cfg: FinanceConfig = DEFAULTS;

describe('normalizeRef (case/space/zero-padding)', () => {
  it('collapses leading zeros in digit runs', () => {
    expect(normalizeRef('UTR00123')).toBe('UTR123');
    expect(normalizeRef('UTR0000123')).toBe('UTR123');
    expect(normalizeRef('UTR123')).toBe('UTR123');
  });
  it('strips case, spaces and punctuation', () => {
    expect(normalizeRef('utr 123')).toBe('UTR123');
    expect(normalizeRef('gateway:pay_0007')).toBe('GATEWAY:PAY7');
  });
});

describe('date window', () => {
  it('computes day deltas', () => {
    expect(dateDelta('2026-08-14', '2026-08-14')).toBe(0);
    expect(dateDelta('2026-08-14', '2026-08-16')).toBe(2);
  });
  it('candidate.dateOk respects DATE_WINDOW_DAYS', () => {
    const gw = rec({ id: 'g', source: 'razorpay-gateway', sourceRef: 'pay_1', amountPaise: 1000, ts: '2026-08-14' });
    const far = rec({ id: 'b', source: 'bank-utr', sourceRef: 'U1', amountPaise: 1000, ts: '2026-08-17' });
    const [c] = buildCandidates(far, [gw], cfg);
    expect(c).toBeTruthy();
    expect(c!.dateOk).toBe(false);
  });
});

describe('ReconciliationEngine tolerance boundary', () => {
  it('merges same-key rows when amount diff is within tolerance', () => {
    const a = rec({ id: 'g1', source: 'razorpay-gateway', sourceRef: 'pay_1', utr: 'UTR1', amountPaise: 10000, ts: '2026-08-14' });
    const b = rec({ id: 'b1', source: 'bank-utr', sourceRef: 'UTR1', utr: 'UTR1', amountPaise: 10000 - 30, ts: '2026-08-14' });
    const { groups, conflicted } = new ReconciliationEngine().link([a, b]);
    expect(groups).toHaveLength(1);
    expect(conflicted).toHaveLength(0);
    expect(groups[0].method).toBe('EXACT');
  });
  it('does NOT merge same-key rows when amount diff exceeds tolerance', () => {
    const a = rec({ id: 'g1', source: 'razorpay-gateway', sourceRef: 'pay_1', utr: 'UTR9', amountPaise: 10000, ts: '2026-08-14' });
    const b = rec({ id: 'b1', source: 'bank-utr', sourceRef: 'UTR9', utr: 'UTR9', amountPaise: 10000 - 500, ts: '2026-08-14' });
    const { groups, conflicted } = new ReconciliationEngine().link([a, b]);
    expect(groups).toHaveLength(0);
    expect(conflicted).toHaveLength(2);
  });
  it('amountSpan reports the signed spread', () => {
    expect(amountSpan([rec({ id: 'a', source: 'bank-utr', sourceRef: 'u', amountPaise: 100 }),
      rec({ id: 'b', source: 'bank-utr', sourceRef: 'v', amountPaise: 140 })])).toBe(40);
  });
});

describe('HeuristicJudge confidence', () => {
  let judge: HeuristicJudge;
  beforeEach(() => {
    judge = new HeuristicJudge();
    judge.resetForced();
  });
  const cand = (o: Partial<Candidate>): Candidate => ({
    flapId: 'f',
    matchRecordId: 'm',
    amountDiff: 10,
    dateOk: true,
    counterpartyOk: true,
    normRefOk: false,
    ...o,
  });

  it('caps confidence below resolve threshold without an identifier ref', () => {
    const res = judge.judgeCandidates([cand({})]);
    expect(res.confidence).toBeLessThan(0.7);
    expect(res.reasonCode).toBe('PARTIAL_FLAP');
  });
  it('assigns higher confidence when a normalized ref matches', () => {
    const res = judge.judgeCandidates([cand({ normRefOk: true })]);
    expect(res.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it('returns NO_KEY for an empty candidate list', () => {
    const res = judge.judgeCandidates([]);
    expect(res.confidence).toBe(0);
    expect(res.reasonCode).toBe('NO_KEY');
  });
  it('forceLowConfidence forces a sub-threshold score (honesty drill)', () => {
    judge.forceLowConfidence(['f']);
    const res = judge.judgeCandidates([cand({ normRefOk: true })]);
    expect(res.confidence).toBeLessThan(0.7);
    expect(res.reason).toContain('forced-low');
  });
});

describe('ExceptionLedger', () => {
  it('is append-only and never drops a record', () => {
    const ledger = new ExceptionLedger('run-1');
    const r = rec({ id: 'rec1', source: 'bank-utr', sourceRef: 'U1', amountPaise: 100 });
    ledger.add(r, 'NO_KEY', 'no key found', []);
    ledger.add(r, 'LOW_CONFIDENCE', 'judge uncertain', ['cand1']);
    expect(ledger.count()).toBe(2);
    expect(ledger.byCode('NO_KEY')).toHaveLength(1);
    // authenticity: record payload preserved
    expect(ledger.all[0].recordJson.sourceRef).toBe('U1');
  });
});

describe('CashForecaster arithmetic', () => {
  it('projects balance with reconciled inflow spread evenly', () => {
    const f = new CashForecaster().project(3, [1, 1, 2], 1_000_000, {
      totalScheduledInflow: 3000,
      startDate: '2026-08-14',
    });
    expect(f).toHaveLength(3);
    // 3000/3 = 1000/day
    expect(f[0].deltaPaise).toBe(1000);
    expect(f[0].balancePaise).toBe(1_001_000);
    expect(f[1].balancePaise).toBe(1_002_000);
    expect(f[2].balancePaise).toBe(1_003_000);
    expect(f[0].reconciledIn).toBe(true);
    expect(f[0].confidence).toBeGreaterThan(0.5);
  });
  it('drops to low confidence when no matched lags exist', () => {
    const f = new CashForecaster().project(2, [], 500, { startDate: '2026-08-14' });
    expect(f.every((d) => d.reconciledIn === false)).toBe(true);
    expect(f.every((d) => d.deltaPaise === 0)).toBe(true);
  });
});

describe('TaxMatcher rules', () => {
  it('maps subscription/saas descriptions by rule', () => {
    const t = new TaxMatcher().match(rec({ id: 'r', source: 'erp-orders', sourceRef: 'O1', description: 'Saas Subscription license' }));
    expect(t.matchedBy).toBe('RULE');
    expect(t.categoryCode).toBe('998313');
  });
  it('maps hardware keywords', () => {
    const t = new TaxMatcher().match(rec({ id: 'r', source: 'gst-invoices', sourceRef: 'I1', description: 'Purchase of laptop' }));
    expect(t.categoryCode).toBe('998212');
  });
  it('returns null category (low confidence) for ambiguous lines', () => {
    const t = new TaxMatcher().match(rec({ id: 'r', source: 'bank-utr', sourceRef: 'U1', description: 'ZZZ random' }));
    expect(t.categoryCode).toBeNull();
    expect(t.confidence).toBeLessThan(0.7);
  });
});

describe('IngestService idempotency', () => {
  it('returns the same record and records a duplicate hit on repeat', () => {
    const svc = new IngestService();
    const row = { paymentId: 'pay_1', amount: 100.0, date: '2026-08-14', customer: 'Acme', utr: 'UTR1' };
    const first = svc.normalize(row, 'razorpay-gateway');
    const second = svc.normalize({ ...row }, 'razorpay-gateway');
    expect(second.id).toBe(first.id);
    expect(svc.duplicates).toHaveLength(1);
    expect(recordId('razorpay-gateway', 'pay_1')).toBe(first.id);
  });
  it('assigns deterministic per-source ids', () => {
    const r = new IngestService().normalize({ utr: 'UTR9', amount: 50, date: '2026-08-14' }, 'bank-utr');
    expect(r.sourceRef).toBe('UTR9');
    expect(r.amountPaise).toBe(5000);
  });
});

describe('SettlementService', () => {
  it('computes lag stats from bound settlements', () => {
    const svc = new SettlementService();
    const groups = [
      { id: 'g1', key: 'utr:U1', method: 'EXACT' as const, matchType: 'EXACT' as const, confidence: 1, reason: 'x', amountPaise: 100, recordIds: ['a'], links: [] },
      { id: 'g2', key: 'utr:U2', method: 'EXACT' as const, matchType: 'EXACT' as const, confidence: 1, reason: 'x', amountPaise: 100, recordIds: ['b'], links: [] },
    ];
    const s = svc.bindToSettlements(groups, { lagDays: 2 });
    expect(s).toHaveLength(2);
    expect(svc.lagStats(s).avgLagDays).toBe(2);
  });
});
