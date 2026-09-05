/**
 * adversarial.test.ts — adversarial false-positive tests. These PROVE the
 * reconciliation engine does NOT wrongly merge two distinct financial records.
 *
 * Six guards, each running the full CloseEngine over a purpose-built batch:
 *   1. no cross-match of two same-amount movements for different customers;
 *   2. no fee-coincidence netting unless a FEE record is genuinely co-located;
 *   3. a partial payment is never a clean resolved group (unresolved / PARTIAL);
 *   4. a duplicate payment is detected (DUPLICATE), never double-matched;
 *   5. one invoice is consumed by at most one settlement group (integrity);
 *   6. zero false auto-match: no group merges records without a shared
 *      identifier or a balanced netting identity.
 */
import { describe, it, expect } from 'vitest';
import { CloseEngine } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { DEFAULTS } from '../src/core/config.js';
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

/** Wrap raw export rows into a Batch for CloseEngine.run (full ingest path). */
function batch(rows: RowMap): Batch {
  const sources: SourceData[] = (
    ['razorpay-gateway', 'bank-utr', 'erp-orders', 'gst-invoices'] as SourceKind[]
  )
    .filter((s) => rows[s])
    .map((s) => ({ source: s, rows: rows[s]! }));
  return { id: `adversarial-${Math.random()}`, sources };
}

function run(b: Batch): ReturnType<CloseEngine['run']> {
  return new CloseEngine(undefined, new HeuristicJudge()).run(b);
}

/** True when any two records share a canonical cross-reference identifier. */
function shareCanonical(recs: FinRecord[]): boolean {
  const key = (r: FinRecord): string[] => {
    const k: string[] = [];
    if (r.utr) k.push(`utr:${r.utr}`);
    if (r.gatewayRef) k.push(`gateway:${r.gatewayRef}`);
    if (r.orderRef) k.push(`order:${r.orderRef}`);
    if (r.source === 'gst-invoices') k.push(`inv:${r.sourceRef}`);
    return k;
  };
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const a = key(recs[i]);
      const b = key(recs[j]);
      if (a.some((x) => b.includes(x))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scenario batches (constructed once; each specific test + the global
// no-false-auto-match invariant both run them).
// ---------------------------------------------------------------------------

/** 1. Two INR 10,000 movements, distinct customers / UTRs / orders / invoices. */
const batchDiffCust = batch({
  'razorpay-gateway': [
    { paymentId: 'payA', orderId: 'ORD-A', utr: 'UTRA', amount: 10000, date: VD, customer: 'Acme Retail', description: 'Acme Retail' },
    { paymentId: 'payB', orderId: 'ORD-B', utr: 'UTRB', amount: 10000, date: VD, customer: 'Brightway Traders', description: 'Brightway Traders' },
  ],
  'bank-utr': [
    { utr: 'UTRA', amount: 10000, date: VD, counterparty: 'Acme Retail', narration: 'settlement A' },
    { utr: 'UTRB', amount: 10000, date: VD, counterparty: 'Brightway Traders', narration: 'settlement B' },
  ],
  'gst-invoices': [
    { invoiceNo: 'INV-A', orderId: 'ORD-A', amount: 10000, date: VD, buyer: 'Acme Retail', description: 'inv A' },
    { invoiceNo: 'INV-B', orderId: 'ORD-B', amount: 10000, date: VD, buyer: 'Brightway Traders', description: 'inv B' },
  ],
});

/** 2. Fee-coincidence trap + one genuine co-located-fee net. */
const batchFeeCoincidence = batch({
  'razorpay-gateway': [
    // Alleged fee-coincidence: gross ₹10,000 vs settlement ₹9,800 (₹200 hole) with NO fee co-located.
    { paymentId: 'payF', orderId: 'ORD-F', utr: 'UTRF', amount: 10000, date: VD, customer: 'FeeCo', description: 'FeeCo' },
    // An unrelated genuine fee group where the fee IS co-located.
    { paymentId: 'payU', orderId: 'ORD-U', utr: 'UTRU', amount: 5000, date: VD, customer: 'UniCo', description: 'UniCo' },
    { kind: 'FEE', feeRef: 'feeU', paymentId: 'payU', orderId: 'ORD-U', utr: 'UTRU', amount: -200, date: VD, customer: 'UniCo', method: 'tdr', description: 'gateway fee' },
  ],
  'bank-utr': [
    { utr: 'UTRF', amount: 9800, date: VD, counterparty: 'FeeCo', narration: 'settlement F' },
    { utr: 'UTRU', amount: 4800, date: VD, counterparty: 'UniCo', narration: 'net settlement U' },
  ],
});

/** 3a. Partial payment: invoice ₹50,000, payment ₹30,000, shared order. */
const batchPartialSharedKey = batch({
  'razorpay-gateway': [
    { paymentId: 'payP', orderId: 'ORD-P', utr: 'UTRP', amount: 30000, date: VD, customer: 'PayerCo', description: 'PayerCo' },
  ],
  'bank-utr': [
    { utr: 'UTRP', amount: 30000, date: VD, counterparty: 'PayerCo', narration: 'settlement P' },
  ],
  'gst-invoices': [
    { invoiceNo: 'INV-P', orderId: 'ORD-P', amount: 50000, date: VD, buyer: 'PayerCo', description: 'invoice P' },
  ],
});

/** 3b. Sub-threshold partial: same amount + counterparty but no identifier. */
const batchPartialFlap = batch({
  'razorpay-gateway': [
    { paymentId: 'payPF2', amount: 10000, date: VD, customer: 'FlapCo', description: 'FlapCo' },
  ],
  'bank-utr': [
    { utr: 'UTRPF', amount: 10000, date: VD, counterparty: 'FlapCo', narration: 'near payment' },
  ],
});

/** 4. Two identical ₹10,000 payments for one invoice. */
const batchDuplicatePay = batch({
  'razorpay-gateway': [
    { paymentId: 'payD1', orderId: 'ORD-DUP', utr: 'UTRD1', amount: 10000, date: VD, customer: 'DupCo', description: 'DupCo' },
    { paymentId: 'payD2', orderId: 'ORD-DUP2', utr: 'UTRD2', amount: 10000, date: VD, customer: 'DupCo', description: 'DupCo' },
  ],
  'bank-utr': [
    { utr: 'UTRD1', amount: 10000, date: VD, counterparty: 'DupCo', narration: 'settlement D' },
  ],
  'gst-invoices': [
    { invoiceNo: 'INV-DUP', orderId: 'ORD-DUP', amount: 10000, date: VD, buyer: 'DupCo', description: 'invoice DUP' },
  ],
});

/** 5. Integrity: one invoice + a competing second settlement. */
const batchOneGroupIntegrity = batch({
  'razorpay-gateway': [
    { paymentId: 'payB', orderId: 'ORD-B', utr: 'UTRB', amount: 10000, date: VD, customer: 'Acme', description: 'Acme' },
  ],
  'bank-utr': [
    { utr: 'UTRB', amount: 10000, date: VD, counterparty: 'Acme', narration: 'settlement 1' },
    { utr: 'UTRB2', amount: 10000, date: '2026-08-15', counterparty: 'Acme', narration: 'competing settlement' },
  ],
  'gst-invoices': [
    { invoiceNo: 'INV-B', orderId: 'ORD-B', amount: 10000, date: VD, buyer: 'Acme', description: 'invoice B' },
  ],
});

const ALL_SCENARIOS = [
  batchDiffCust,
  batchFeeCoincidence,
  batchPartialSharedKey,
  batchPartialFlap,
  batchDuplicatePay,
  batchOneGroupIntegrity,
];

// ---------------------------------------------------------------------------

describe('adversarial: same amount, different customer', () => {
  it('does not cross-match two INR 10,000 movements with distinct customers/refs', () => {
    const rep = run(batchDiffCust);
    const ctx = rep.__ctx!;
    const find = (id: string) => ctx.records.find((r) => r.id === id)!;

    // exactly two groups, one per movement
    expect(ctx.groups).toHaveLength(2);

    // every group is pure to a single customer
    for (const g of ctx.groups) {
      const custs = g.recordIds.map((id) => find(id).counterparty);
      expect(new Set(custs).size).toBe(1);
    }

    const aIds = ['rec:razorpay-gateway:payA', 'rec:bank-utr:UTRA', 'rec:gst-invoices:INV-A'];
    const bIds = ['rec:razorpay-gateway:payB', 'rec:bank-utr:UTRB', 'rec:gst-invoices:INV-B'];

    // correct pairs do match
    const aGroup = ctx.groups.find((g) => g.recordIds.includes(aIds[0]))!;
    const bGroup = ctx.groups.find((g) => g.recordIds.includes(bIds[0]))!;
    expect(aGroup).toBeTruthy();
    expect(bGroup).toBeTruthy();
    expect(aGroup).not.toBe(bGroup);
    expect(aGroup.recordIds).toEqual(expect.arrayContaining(aIds));
    expect(bGroup.recordIds).toEqual(expect.arrayContaining(bIds));

    // no group ever mixes A and B records
    for (const g of ctx.groups) {
      const hasA = aIds.some((id) => g.recordIds.includes(id));
      const hasB = bIds.some((id) => g.recordIds.includes(id));
      expect(hasA && hasB).toBe(false);
    }

    // no false residues either
    expect(ctx.ledger.count()).toBe(0);
  });
});

describe('adversarial: fee-coincidence false positive', () => {
  it('does not net-match a settlement equal to gross minus an unrelated fee', () => {
    const rep = run(batchFeeCoincidence);
    const ctx = rep.__ctx!;

    // exactly ONE netted group and it is the genuine co-located-fee group
    const netted = ctx.groups.filter((g) => g.method === 'NETTED');
    expect(netted).toHaveLength(1);
    expect(netted[0].matchType).toBe('FEE_NETTED');
    expect(netted[0].recordIds).toEqual(
      expect.arrayContaining(['rec:razorpay-gateway:payU', 'rec:razorpay-gateway:feeU']),
    );
    expect(Math.abs(netted[0].netting!.variancePaise)).toBeLessThanOrEqual(TOL);

    // the coincidence pair (₹10,000 gross / ₹9,800 settlement, no fee) is NOT netted
    const pair = ['rec:razorpay-gateway:payF', 'rec:bank-utr:UTRF'];
    expect(ctx.groups.every((g) => !pair.some((id) => g.recordIds.includes(id)))).toBe(true);

    // instead they surface honestly as AMOUNT_MISMATCH exceptions — never a guess
    const exc = ctx.ledger.all.filter((e) => pair.includes(e.recordId!));
    expect(exc).toHaveLength(2);
    expect(exc.every((e) => e.reasonCode === 'AMOUNT_MISMATCH')).toBe(true);
    expect(exc.every((e) => e.matchType === 'UNRESOLVED')).toBe(true);
  });
});

describe('adversarial: partial payment', () => {
  it('invoice ₹50,000 paid ₹30,000 sharing an order is never a clean resolved group', () => {
    const rep = run(batchPartialSharedKey);
    const ctx = rep.__ctx!;
    const inv = 'rec:gst-invoices:INV-P';
    const all = ['rec:gst-invoices:INV-P', 'rec:razorpay-gateway:payP', 'rec:bank-utr:UTRP'];

    // invoice is in NO group (not fully matched), nothing netted
    expect(ctx.groups.every((g) => !g.recordIds.includes(inv))).toBe(true);
    expect(ctx.groups.every((g) => g.method !== 'NETTED')).toBe(true);

    // all three legs are honest unresolved AMOUNT_MISMATCH exceptions
    const exc = ctx.ledger.all.filter((e) => all.includes(e.recordId!));
    expect(exc).toHaveLength(3);
    expect(exc.every((e) => e.reasonCode === 'AMOUNT_MISMATCH' && e.matchType === 'UNRESOLVED')).toBe(true);
  });

  it('sub-threshold partial (same amount+counterparty, no identifier) -> PARTIAL, not resolved', () => {
    const rep = run(batchPartialFlap);
    const ctx = rep.__ctx!;
    const pay = 'rec:razorpay-gateway:payPF2';

    // no clean group consumed it
    expect(ctx.groups.every((g) => !g.recordIds.includes(pay))).toBe(true);

    // it surfaces as a PARTIAL_FLAP exception, left OPEN for review
    const e = ctx.ledger.all.find((x) => x.recordId === pay);
    expect(e).toBeTruthy();
    expect(e!.reasonCode).toBe('PARTIAL_FLAP');
    expect(e!.status).toBe('OPEN');
    expect(e!.matchType).toBe('PARTIAL');
    expect(rep.breakdown.partial).toBeGreaterThanOrEqual(1);
  });
});

describe('adversarial: duplicate payment', () => {
  it('detects the duplicate rather than matching both payments to the invoice', () => {
    const rep = run(batchDuplicatePay);
    const ctx = rep.__ctx!;
    const inv = 'rec:gst-invoices:INV-DUP';
    const dup = 'rec:razorpay-gateway:payD2';

    const group = ctx.groups.find((g) => g.recordIds.includes(inv));
    expect(group).toBeTruthy();

    // exactly one payment reconciled to the invoice — the duplicate is excluded
    expect(group!.recordIds).toContain('rec:razorpay-gateway:payD1');
    expect(group!.recordIds).not.toContain(dup);

    // the duplicate appears in no group and is flagged DUPLICATE
    expect(ctx.groups.every((g) => !g.recordIds.includes(dup))).toBe(true);
    const e = ctx.ledger.all.find((x) => x.recordId === dup);
    expect(e).toBeTruthy();
    expect(e!.reasonCode).toBe('DUPLICATE');
    expect(e!.status).toBe('OPEN');
  });
});

describe('adversarial: one invoice, at most one settlement group (integrity)', () => {
  it('consumes an invoice by exactly one group and never double-counts a competing settlement', () => {
    const rep = run(batchOneGroupIntegrity);
    const ctx = rep.__ctx!;
    const inv = 'rec:gst-invoices:INV-B';
    const comp = 'rec:bank-utr:UTRB2';

    // invoice appears in exactly one group, exactly once
    const containing = ctx.groups.filter((g) => g.recordIds.includes(inv));
    expect(containing).toHaveLength(1);
    const occurrences = ctx.groups.reduce((a, g) => a + g.recordIds.filter((id) => id === inv).length, 0);
    expect(occurrences).toBe(1);

    // the competing second settlement is not folded into that group
    expect(containing[0].recordIds).not.toContain(comp);
    expect(ctx.groups.every((g) => !g.recordIds.includes(comp))).toBe(true);

    // and it is surfaced honestly (unresolved), never silently merged
    const e = ctx.ledger.all.find((x) => x.recordId === comp);
    expect(e).toBeTruthy();
    expect(e!.status).toBe('OPEN');
  });
});

describe('adversarial: zero false auto-match', () => {
  it('no group across all scenarios merges records without an identifier or a balanced netting identity', () => {
    for (const b of ALL_SCENARIOS) {
      const rep = run(b);
      const ctx = rep.__ctx!;
      const recById = new Map(ctx.records.map((r) => [r.id, r]));

      for (const g of ctx.groups) {
        if (g.method === 'NETTED') {
          // netted groups must be balanced by a real netting breakdown
          expect(g.netting).toBeTruthy();
          expect(Math.abs(g.netting!.variancePaise)).toBeLessThanOrEqual(TOL);
          continue;
        }
        if (g.method === 'JUDGED') {
          // judged groups must carry an identifier-backed link (never pure text)
          expect(g.links.some((l) => l.matchedOn !== 'amountWindow')).toBe(true);
          continue;
        }
        // EXACT / NORMALIZED: members must share a canonical identifier
        expect(shareCanonical(g.recordIds.map((id) => recById.get(id)!))).toBe(true);
      }
    }
  });
});
