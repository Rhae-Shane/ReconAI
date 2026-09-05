/**
 * adversarial-suite.test.ts — property, mutation, and chaos suites built on
 * core/adversarial.ts, wired to the real deterministic engine (CloseEngine).
 */
import { describe, it, expect } from 'vitest';
import { CloseEngine } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { DEFAULTS } from '../src/core/config.js';
import { buildCandidates, dateDelta } from '../src/core/reconcile.js';
import {
  mulberry32,
  randInt,
  generateValidSettlement,
  generateCorruptSettlement,
  assertBalanced,
  isBalanced,
  netIdentityOf,
  mutateAmount,
  mutateDate,
  mutateReference,
  duplicateRecord,
  removeFees,
  insertRefund,
  ThrowingProvider,
  FlakyProvider,
  EffectSink,
  applyEffectsIdempotently,
} from '../src/core/adversarial.js';
import type {
  Batch,
  FinRecord,
  RawRow,
  SourceData,
  SourceKind,
} from '../src/core/types.js';

const VD = '2026-08-14';
const TOL = DEFAULTS.paiseTolerance;

type RowMap = Partial<Record<SourceKind, RawRow[]>>;

function batch(rows: RowMap): Batch {
  const sources: SourceData[] = (
    ['razorpay-gateway', 'bank-utr', 'erp-orders', 'gst-invoices'] as SourceKind[]
  )
    .filter((s) => rows[s])
    .map((s) => ({ source: s, rows: rows[s]! }));
  return { id: `adv-suite-${Math.random()}`, sources };
}

function run(b: Batch): ReturnType<CloseEngine['run']> {
  return new CloseEngine(undefined, new HeuristicJudge()).run(b);
}

/** A genuine co-located-fee net that the engine SHOULD accept as FEE_NETTED. */
function feeNetRows(): RowMap {
  return {
    'razorpay-gateway': [
      { paymentId: 'payU', orderId: 'ORD-U', utr: 'UTRU', amount: 5000, date: VD, customer: 'UniCo', description: 'UniCo' },
      { kind: 'FEE', feeRef: 'feeU', paymentId: 'payU', orderId: 'ORD-U', utr: 'UTRU', amount: -200, date: VD, customer: 'UniCo', method: 'tdr', description: 'gateway fee' },
    ],
    'bank-utr': [
      { utr: 'UTRU', amount: 4800, date: VD, counterparty: 'UniCo', narration: 'net settlement U' },
    ],
  };
}

// ---------------------------------------------------------------------------

describe('property: netting conservation over seeded random settlements', () => {
  it(`asserts gross - fee - tax - refund + adjustment === net for ~2000 valid cases`, () => {
    const rand = mulberry32(0x5eed);
    let checked = 0;
    for (let i = 0; i < 2000; i++) {
      const m = generateValidSettlement(rand);
      expect(netIdentityOf(m)).toBe(
        m.grossPaise - m.feePaise - m.taxOnFeePaise - m.refundPaise + m.adjustmentPaise,
      );
      expect(isBalanced(m)).toBe(true);
      assertBalanced(m); // throws on violation
      checked++;
    }
    expect(checked).toBe(2000);
  });

  it('every corrupt case violates the invariant (mutation is caught)', () => {
    const rand = mulberry32(0xdead);
    let corrupt = 0;
    for (let i = 0; i < 2000; i++) {
      const m = generateCorruptSettlement(rand);
      expect(isBalanced(m)).toBe(false);
      corrupt++;
    }
    expect(corrupt).toBe(2000);
  });

  it('the PRNG is deterministic: same seed -> same cases', () => {
    expect(mulberry32(7)()).toBe(mulberry32(7)());
    const a = randInt(mulberry32(9), 0, 1000);
    const b = randInt(mulberry32(9), 0, 1000);
    expect(a).toBe(b);
  });
});

describe('mutation: the engine detects amount / fee / refund mutations', () => {
  it('baseline: the genuine fee net IS accepted as FEE_NETTED', () => {
    const ctx = run(batch(feeNetRows())).__ctx!;
    const netted = ctx.groups.filter((g) => g.method === 'NETTED');
    expect(netted).toHaveLength(1);
    expect(netted[0].matchType).toBe('FEE_NETTED');
    expect(Math.abs(netted[0].netting!.variancePaise)).toBeLessThanOrEqual(TOL);
  });

  it('mutating the fee amount breaks the net -> honest AMOUNT_MISMATCH, no FEE_NETTED', () => {
    const rows = feeNetRows();
    rows['razorpay-gateway']![1].amount = -300; // was -200
    const ctx = run(batch(rows)).__ctx!;
    expect(ctx.groups.some((g) => g.method === 'NETTED')).toBe(false);
    const exc = ctx.ledger.all.filter((e) => e.reasonCode === 'AMOUNT_MISMATCH');
    expect(exc.length).toBeGreaterThan(0);
  });

  it('removing the fee undoes the net -> AMOUNT_MISMATCH, never a guess', () => {
    const rows = feeNetRows();
    const gate = (rows['razorpay-gateway'] as RawRow[]).filter(
      (r) => r.kind !== 'FEE',
    );
    rows['razorpay-gateway'] = gate;
    const ctx = run(batch(rows)).__ctx!;
    expect(ctx.groups.some((g) => g.method === 'NETTED')).toBe(false);
    expect(
      ctx.ledger.all.some((e) => e.reasonCode === 'AMOUNT_MISMATCH'),
    ).toBe(true);
  });

  it('inserting an un-quantified refund shifts the net -> no REFUND_NETTED', () => {
    const rows = feeNetRows();
    (rows['razorpay-gateway'] as RawRow[]).push({
      kind: 'REFUND',
      paymentId: 'refU', // distinct sourceRef so ingest keeps it as its own record
      utr: 'UTRU',
      amount: -500,
      date: VD,
      customer: 'UniCo',
      description: 'refund U',
    });
    const ctx = run(batch(rows)).__ctx!;
    expect(ctx.groups.some((g) => g.method === 'NETTED')).toBe(false);
    expect(
      ctx.ledger.all.some((e) => e.reasonCode === 'AMOUNT_MISMATCH'),
    ).toBe(true);
  });
});

describe('mutation: duplicate / reference / date mutations are detected', () => {
  it('a duplicated record triggers the DUPLICATE honesty exception', () => {
    const rows = feeNetRows();
    (rows['bank-utr'] as RawRow[]).push({
      utr: 'UTRU',
      amount: 4800,
      date: VD,
      counterparty: 'UniCo',
      narration: 'duplicated settlement',
    });
    const ctx = run(batch(rows)).__ctx!;
    const dup = ctx.ledger.all.find((e) => e.reasonCode === 'DUPLICATE');
    expect(dup).toBeTruthy();
    expect(dup!.status).toBe('OPEN');
  });

  it('a broken reference (mutateReference) loses the key -> NO_KEY orphan', () => {
    const rows = feeNetRows();
    (rows['bank-utr'] as RawRow[])[0].utr = 'UTRU-MUTATED'; // no longer shares UTRU
    const ctx = run(batch(rows)).__ctx!;
    // the settlement lost its link to the payment, which now has no key or candidate
    expect(
      ctx.ledger.all.some((e) => e.reasonCode === 'NO_KEY'),
    ).toBe(true);
  });

  it('mutateDate pushes the value date out of window (dateDelta > window)', () => {
    const recA: FinRecord = {
      id: 'a',
      source: 'razorpay-gateway',
      kind: 'PAYMENT',
      sourceRef: 'A1',
      ts: VD,
      amountPaise: 1000,
      currency: 'INR',
    };
    const shifted = mutateDate(recA, '2026-08-20');
    expect(dateDelta(recA.ts, shifted.ts)).toBeGreaterThan(DEFAULTS.dateWindowDays);
  });

  it('mutation helpers preserve identity of the untouched fields', () => {
    const rec: FinRecord = {
      id: 'x',
      source: 'bank-utr',
      kind: 'SETTLEMENT',
      sourceRef: 'UTR-1',
      ts: VD,
      amountPaise: -12345,
      currency: 'INR',
      utr: 'UTR-1',
    };
    const amt = mutateAmount(rec, 5);
    expect(amt.amountPaise).toBe(-12340);
    expect(amt.id).toBe('x'); // only amount changed
    const dup = duplicateRecord(rec);
    expect(dup.id).not.toBe(rec.id);
    expect(dup.sourceRef).toBe(rec.sourceRef);
  });
});

describe('chaos: throwing providers never double-book financial effects', () => {
  it('ThrowingProvider always rejects a completion', async () => {
    const p = new ThrowingProvider();
    await expect(p.complete([])).rejects.toThrow();
  });

  it('FlakyProvider fails deterministically for a fixed seed/failRate', async () => {
    const p = new FlakyProvider(mulberry32(1), 1); // failRate 1 -> always throw
    await expect(p.complete([])).rejects.toThrow();
    const ok = new FlakyProvider(mulberry32(1), 0); // never throw
    await expect(ok.complete([])).resolves.toBe('ok');
  });

  it('EffectSink refuses duplicate applications (no double money movement)', () => {
    const sink = new EffectSink();
    expect(sink.apply('settle-1', -4800)).toBe(true);
    expect(sink.apply('settle-1', -4800)).toBe(false); // duplicate refused
    expect(sink.count()).toBe(1);
    expect(sink.sumPaise()).toBe(-4800);
  });

  it('applyEffectsIdempotently leaves failed effects un-applied, never twice', async () => {
    const effects = [
      { id: 'e1', amountPaise: 1000 },
      { id: 'e2', amountPaise: -200 },
      { id: 'e3', amountPaise: 500 },
    ];
    const seen: string[] = [];
    const res = await applyEffectsIdempotently(
      effects,
      async (e) => {
        seen.push(e.id); // each effect's execution happens at most once
      },
      (e) => e.id === 'e2', // e2 "fails" (provider threw before applying)
    );
    expect(res.applied).toEqual(['e1', 'e3']);
    expect(res.failed).toEqual(['e2']);
    expect(res.totalPaise).toBe(1500);
    expect(seen).toEqual(['e1', 'e3']); // e2 never executed
  });

  it('applyEffectsIdempotently swallows executor throws, still no double-apply', async () => {
    const effects = [
      { id: 'a', amountPaise: 10 },
      { id: 'b', amountPaise: 20 },
    ];
    const res = await applyEffectsIdempotently(effects, async (e) => {
      if (e.id === 'b') throw new Error('downstream failed');
    });
    expect(res.applied).toEqual(['a']);
    expect(res.failed).toEqual(['b']);
    expect(res.totalPaise).toBe(10);
  });
});
