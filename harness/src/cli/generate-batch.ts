/**
 * generate-batch.ts — deterministically builds the N=81 synthetic batch across
 * 4 sources with a fixed seed and a ground-truth label set. It covers the FULL
 * settlement mathematics (gross − fee − tax − refund + adjustment) and every
 * match type P0/P1 asked for.
 *
 * Composition (locked by tests/close.test.ts + labels.test.ts):
 *   - clean multi-source matches (M1..M10)        -> 34 records, 10 groups
 *   - pass-tolerance matches (M11..M13)           -> 6 records, 3 groups
 *   - fee-netted matches (MN16..MN18)             -> 9 records, 3 FEE_NETTED groups
 *     (gateway payment = ₹10,000 · fee = ₹177 · settlement = ₹9,823)
 *   - FEE+GST netted match (MGST)                 -> 3 records, 1 FEE_NETTED group
 *     (gross = ₹10,000 · fee+TDR-GST = ₹177 (fee ₹150 + tax ₹27) · settle ₹9,823)
 *   - REFUND_NETTED match (MREFN)                 -> 3 records, 1 REFUND_NETTED group
 *     (gross ₹10,000 − refund ₹2,000 = settlement ₹8,000)
 *   - ADJUSTMENT_NETTED match (MADJN)             -> 3 records, 1 ADJUSTMENT_NETTED group
 *     (gross ₹10,000 + adjustment ₹2,000 = settlement ₹12,000)
 *   - cross-match guard (MFA / MFB)               -> 6 records, 2 groups
 *     (INV-A ₹100 / INV-B ₹100, different customers, must NOT cross-match)
 *   - duplicate-payment guard (MDUP)              -> 3 records, 1 group + 1 DUPLICATE
 *     (two identical payments for one invoice)
 *   - above-tolerance mismatches (M14..M15)       -> AMOUNT_MISMATCH (4)
 *   - partial-payment guard (payPART/UTRPART)     -> AMOUNT_MISMATCH (2)
 *     (invoice only partially settled -> must NOT be a full match)
 *   - content-duplicate bank rows (of M1,M2)      -> DUPLICATE (2)
 *   - duplicate bank row (of UTRDUP)              -> DUPLICATE (1)
 *   - near-duplicate bank rows (amt+date+cpy)     -> LOW_CONFIDENCE (2)
 *   - orphan bank rows                            -> NO_KEY (4)
 *
 *   Total: 66 expected MATCHED · 15 expected EXCEPTION = 81 records, 22 groups
 *   (6 NETTED: 4 FEE_NETTED + 1 REFUND_NETTED + 1 ADJUSTMENT_NETTED).
 *   Writes `data/batch.json` (Batch with sources + labels).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Batch, GroundTruthLabel, RawRow, SourceKind } from '../core/types.js';
import {
  intInclusive, mulberry32, rupeeAmount, netExpected, GST_NET,
  CUSTOMERS, SEED, VALUE_DATE,
} from '../core/dataset.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const OUT = resolve(DATA_DIR, 'batch.json');

export const BATCH_ID = `batch-${SEED}-81`;

type RowSink = Record<SourceKind, RawRow[]>;

function sink(): RowSink {
  return { 'razorpay-gateway': [], 'bank-utr': [], 'erp-orders': [], 'gst-invoices': [] };
}

/** Ingest-compatible recordId (must equal ingest.recordId). */
export function rid(source: SourceKind, sourceRef: string): string {
  return `rec:${source}:${sourceRef}`;
}

export function generateBatch(): Batch {
  const rng = mulberry32(SEED);
  const rows = sink();
  const labels: Record<string, GroundTruthLabel> = {};
  const cleanAmount: Record<number, number> = {}; // paise, per clean movement

  const match = (id: string, key: string) => {
    labels[id] = { expectedGroupKey: key, expectedStatus: 'MATCHED' };
  };
  const except = (id: string) => {
    labels[id] = { expectedGroupKey: null, expectedStatus: 'EXCEPTION' };
  };
  const cust = (i: number) => CUSTOMERS[i % CUSTOMERS.length];

  // ---- clean movements 1..10 -------------------------------------------------
  for (let n = 1; n <= 10; n++) {
    const amount = intInclusive(rng, 100_000, 5_000_000);
    cleanAmount[n] = amount;
    const date = n % 4 === 0 ? '2026-08-13' : n % 5 === 0 ? '2026-08-15' : VALUE_DATE;
    const pay = `pay_${n}`;
    const utr = `UTR${1000 + n}`;
    const order = `ORD-${n}`;
    const inv = `INV-${n}`;
    const customer = cust(n);

    rows['razorpay-gateway'].push({
      paymentId: pay, orderId: order, utr, amount: rupeeAmount(amount),
      date, customer, method: 'card', description: customer,
    });
    rows['bank-utr'].push({
      utr, amount: rupeeAmount(amount), date, counterparty: customer,
      narration: `settlement ${utr}`,
    });
    if (n <= 8) {
      rows['erp-orders'].push({
        orderId: order, paymentId: pay, amount: rupeeAmount(amount),
        date, customer, item: 'Sale of goods',
      });
    }
    if (n <= 6) {
      rows['gst-invoices'].push({
        invoiceNo: inv, orderId: order, amount: rupeeAmount(amount),
        date, buyer: customer, hsn: '998212', description: 'Hardware: laptop & peripherals',
      });
    }

    match(rid('razorpay-gateway', pay), `M${n}`);
    match(rid('bank-utr', utr), `M${n}`);
    if (n <= 8) match(rid('erp-orders', order), `M${n}`);
    if (n <= 6) match(rid('gst-invoices', inv), `M${n}`);
  }

  // ---- pass-tolerance matches 11..13 (amount skew ≤ ₹0.50) --------------------
  for (let n = 11; n <= 13; n++) {
    const amount = intInclusive(rng, 200_000, 4_000_000);
    const pay = `pay_${n}`;
    const order = `ORD-${n}`;
    const customer = cust(n);
    // mov11: gateway UTR has a zero-padded variant of the bank UTR -> NORMALIZED.
    if (n === 11) {
      rows['razorpay-gateway'].push({
        paymentId: pay, orderId: order, utr: 'UTR001011', amount: rupeeAmount(amount),
        date: VALUE_DATE, customer, method: 'upi', description: customer,
      });
      rows['bank-utr'].push({
        utr: 'UTR1011', amount: rupeeAmount(amount - 30), date: VALUE_DATE,
        counterparty: customer, narration: 'settlement UTR1011',
      });
      match(rid('razorpay-gateway', pay), 'M11');
      match(rid('bank-utr', 'UTR1011'), 'M11');
      continue;
    }
    const utr = `UTR${1000 + n}`;
    rows['razorpay-gateway'].push({
      paymentId: pay, orderId: order, utr, amount: rupeeAmount(amount),
      date: VALUE_DATE, customer, method: 'card', description: customer,
    });
    rows['bank-utr'].push({
      utr, amount: rupeeAmount(amount - 30), date: VALUE_DATE,
      counterparty: customer, narration: `settlement ${utr}`,
    });
    match(rid('razorpay-gateway', pay), `M${n}`);
    match(rid('bank-utr', utr), `M${n}`);
  }

  // ---- fee-netted movements 16..18 (gross = settlement + fee) ------------------
  // A gateway payment of ₹10,000, a linked gateway fee of ₹177, and a settlement
  // of ₹9,823 reconcile as a NETTED group: gross === settlement + fee, within
  // paiseTolerance. The fee line is RecordKind 'FEE' and shares the movement's
  // utr + order id so the exact pass unions all three legs, then netting rescues
  // the above-tolerance component instead of flagging AMOUNT_MISMATCH.
  for (const n of [16, 17, 18]) {
    const feeRupees = n === 18 ? 250 : 177; // ₹1.77 / ₹2.50 gateway TDR
    const grossRupees = 10_000; // ₹1,00,000: gross invoice amount
    const gross = rupeeAmount(grossRupees); // 1_000_000 paise
    const fee = rupeeAmount(feeRupees); // 17_700 / 25_000 paise (outflow, -)
    const settled = grossRupees - feeRupees; // 9,823 / 9,750
    const utr = `UTR${2000 + n}`;
    const order = `ORD-NS${n}`;
    const pay = `payNS${n}`;
    const customer = cust(10 + n);

    rows['razorpay-gateway'].push({
      paymentId: pay, orderId: order, utr, amount: gross,
      date: VALUE_DATE, customer, method: 'card', description: customer,
    });
    rows['razorpay-gateway'].push({
      kind: 'FEE',
      feeRef: `feeNS${n}`,
      paymentId: pay, orderId: order, utr,
      amount: -fee, // outflow
      date: VALUE_DATE, customer, method: 'tdr', description: `gateway fee on ${pay}`,
    });
    rows['bank-utr'].push({
      utr, orderId: order, amount: rupeeAmount(settled), date: VALUE_DATE,
      counterparty: customer, narration: `net settlement ${utr}`,
    });

    match(rid('razorpay-gateway', pay), `MN${n}`);
    match(rid('razorpay-gateway', `feeNS${n}`), `MN${n}`);
    match(rid('bank-utr', utr), `MN${n}`);
  }

  // ---- above-tolerance mismatches 14..15 (amount skew > ₹0.50) ----------------
  for (let n = 14; n <= 15; n++) {
    const amount = intInclusive(rng, 300_000, 3_000_000);
    const pay = `pay_${n}`;
    const utr = `UTR${1000 + n}`;
    const customer = cust(n);
    rows['razorpay-gateway'].push({
      paymentId: pay, orderId: `ORD-${n}`, utr, amount: rupeeAmount(amount),
      date: VALUE_DATE, customer, method: 'card', description: customer,
    });
    rows['bank-utr'].push({
      utr, amount: rupeeAmount(amount - 200), date: VALUE_DATE,
      counterparty: customer, narration: `settlement ${utr}`,
    });
    except(rid('razorpay-gateway', pay));
    except(rid('bank-utr', utr));
  }

  // ---- content duplicates (copy m1, m2 bank rows; distinct UTR) ---------------
  for (const src of [1, 2]) {
    const amount = cleanAmount[src];
    const customer = cust(src);
    const dupUtr = `UTR${1000 + src}DUP`;
    rows['bank-utr'].push({
      utr: dupUtr, amount: rupeeAmount(amount), date: VALUE_DATE,
      counterparty: customer, narration: 'duplicate settlement row',
    });
    except(rid('bank-utr', dupUtr));
  }

  // ---- near-duplicates (amount vs m9, but no shared identifier) ---------------
  rows['bank-utr'].push({
    utr: 'UTR9001', amount: rupeeAmount(cleanAmount[9]), date: '2026-08-13',
    counterparty: cust(9), narration: 'near-duplicate A',
  });
  rows['bank-utr'].push({
    utr: 'UTR9002', amount: rupeeAmount(cleanAmount[9] - 20), date: VALUE_DATE,
    counterparty: 'Unrelated Ventures', narration: 'near-duplicate B',
  });
  except(rid('bank-utr', 'UTR9001'));
  except(rid('bank-utr', 'UTR9002'));

  // ---- orphan bank rows (distinct small amounts, no key/candidate) ------------
  const orphanAmts = [12345, 67890, 111222, 345678];
  const orphanUtrs = ['UTR8001', 'UTR8002', 'UTR8003', 'UTR8004'];
  for (let k = 0; k < orphanAmts.length; k++) {
    rows['bank-utr'].push({
      utr: orphanUtrs[k], amount: rupeeAmount(orphanAmts[k]),
      date: '2026-08-13', counterparty: cust(20 + k), narration: 'unmatched collection',
    });
    except(rid('bank-utr', orphanUtrs[k]));
  }

  // ===========================================================================
  //  P0/P1 EXTENSIONS — exercise the full settlement mathematics and the new
  //  match types. Every scenario is emitted so the engine outcome equals its
  //  ground-truth label, keeping precision = recall = 1.0.
  // ===========================================================================

  // ---- 1. FEE+GST netting (MGST) ---------------------------------------------
  // gross ₹10,000 − (gateway fee ₹150 + GST-on-fee ₹27) = settlement ₹9,823.
  // netExpected(gross, fee, tax) === settlement, so the seeded arithmetic
  // balances to variance 0 (nettedGroup). The FEE row carries the fee amount
  // (−₹150) and the GST-on-fee as `feeTaxPaise` (₹27) so the engine's
  // NettingBreakdown surfaces taxOnFeePaise = ₹27 explicitly.
  {
    const { grossPaise, feePaise, taxOnFeePaise, settlementPaise } = GST_NET;
    if (netExpected(grossPaise, feePaise, taxOnFeePaise) !== settlementPaise) {
      throw new Error('GST_NET identity does not balance');
    }
    const feeEmitted = -feePaise; // ₹ -150 (fee only; GST carried in feeTaxPaise)
    rows['razorpay-gateway'].push({
      paymentId: 'payGST', orderId: 'ORD-GST', utr: 'UTRGST',
      amount: rupeeAmount(grossPaise), date: VALUE_DATE, customer: cust(30),
      method: 'card', description: cust(30),
    });
    rows['razorpay-gateway'].push({
      kind: 'FEE', feeRef: 'feeGST', paymentId: 'payGST', orderId: 'ORD-GST', utr: 'UTRGST',
      amount: rupeeAmount(feeEmitted), // ₹ -150 (gateway TDR, outflow)
      feeTaxPaise: taxOnFeePaise, // ₹27 GST charged ON the gateway fee
      date: VALUE_DATE, customer: cust(30), method: 'tdr', description: 'gateway fee + GST on payGST',
    });
    rows['bank-utr'].push({
      utr: 'UTRGST', orderId: 'ORD-GST', amount: rupeeAmount(settlementPaise),
      date: VALUE_DATE, counterparty: cust(30), narration: 'net settlement UTRGST',
    });
    match(rid('razorpay-gateway', 'payGST'), 'MGST');
    match(rid('razorpay-gateway', 'feeGST'), 'MGST');
    match(rid('bank-utr', 'UTRGST'), 'MGST');
  }

  // ---- 2a. REFUND_NETTED match (MREFN) ----------------------------------------
  // Full refund settlement math: a ₹10,000 payment that carries a ₹2,000 refund
  // (kind REFUND, outflow) nets to an ₹8,000 settlement. All three legs share
  // UTRREFN, but their amounts differ BEYOND paiseTolerance, so the component
  // cannot merge exactly — the netting pass rescues it as a REFUND_NETTED group
  // (gross − refund ≡ settlement) with the refund leg visible, instead of a
  // blind AMOUNT_MISMATCH. Exercises the REFUND_NETTED match type.
  {
    rows['razorpay-gateway'].push({
      paymentId: 'payREFN', orderId: 'ORD-REF-NET', utr: 'UTRREFN',
      amount: 10_000.0, date: VALUE_DATE, customer: cust(31), method: 'card',
      description: cust(31),
    });
    rows['razorpay-gateway'].push({
      kind: 'REFUND', paymentId: 'payREFN_R', orderId: 'ORD-REF-NET', utr: 'UTRREFN',
      amount: -2_000.0, date: VALUE_DATE, customer: cust(31), method: 'refund',
      description: 'refund on ORD-REF-NET',
    });
    rows['bank-utr'].push({
      utr: 'UTRREFN', amount: 8_000.0, date: VALUE_DATE, counterparty: cust(31),
      narration: 'net settlement UTRREFN (gross − refund)',
    });
    match(rid('razorpay-gateway', 'payREFN'), 'MREFN');
    match(rid('razorpay-gateway', 'payREFN_R'), 'MREFN');
    match(rid('bank-utr', 'UTRREFN'), 'MREFN');
  }

  // ---- 2b. ADJUSTMENT_NETTED match (MADJN) ------------------------------------
  // Full adjustment settlement math: a ₹10,000 payment plus a ₹2,000 adjustment
  // (kind ADJUSTMENT, inflow, e.g. late-fee recovery) nets to a ₹12,000
  // settlement. All three legs share UTRADJN but their amounts fall beyond
  // paiseTolerance, so netting rescues it as an ADJUSTMENT_NETTED group
  // (gross + adjustment ≡ settlement). Exercises the ADJUSTMENT_NETTED match
  // type using an ADJUSTMENT-kind record.
  {
    rows['razorpay-gateway'].push({
      paymentId: 'payADJN', orderId: 'ORD-ADJ-NET', utr: 'UTRADJN',
      amount: 10_000.0, date: VALUE_DATE, customer: cust(32), method: 'card',
      description: cust(32),
    });
    rows['razorpay-gateway'].push({
      kind: 'ADJUSTMENT', paymentId: 'payADJN_A', orderId: 'ORD-ADJ-NET', utr: 'UTRADJN',
      amount: 2_000.0, date: VALUE_DATE, customer: cust(32), method: 'adjustment',
      description: 'late-fee adjustment on ORD-ADJ-NET',
    });
    rows['bank-utr'].push({
      utr: 'UTRADJN', amount: 12_000.0, date: VALUE_DATE, counterparty: cust(32),
      narration: 'net settlement UTRADJN (gross + adjustment)',
    });
    match(rid('razorpay-gateway', 'payADJN'), 'MADJN');
    match(rid('razorpay-gateway', 'payADJN_A'), 'MADJN');
    match(rid('bank-utr', 'UTRADJN'), 'MADJN');
  }

  // ---- 3. PARTIAL-payment guard (EXCEPTION) -----------------------------------
  // An invoice (₹10,000) that is only partially settled (₹6,000) shares the UTR
  // but is ₹4,000 short — beyond tolerance, so it is NOT a full match and MUST
  // surface as AMOUNT_MISMATCH, never a clean EXACT group.
  {
    rows['razorpay-gateway'].push({
      paymentId: 'payPART', orderId: 'ORD-PART', utr: 'UTRPART',
      amount: 10_000.0, date: VALUE_DATE, customer: cust(33), method: 'card',
      description: cust(33),
    });
    rows['bank-utr'].push({
      utr: 'UTRPART', amount: 6_000.0, date: VALUE_DATE, counterparty: cust(33),
      narration: 'partial settlement UTRPART',
    });
    except(rid('razorpay-gateway', 'payPART'));
    except(rid('bank-utr', 'UTRPART'));
  }

  // ---- 4. Duplicate-payment guard (MDUP + DUPLICATE) ---------------------------
  // Two identical payments for one invoice: payDUP ⇄ bank UTRDUP match cleanly
  // (MDUP), while a second bank row UTRDUPB with identical content is flagged as
  // a content-DUPLICATE and never double-counted.
  {
    rows['razorpay-gateway'].push({
      paymentId: 'payDUP', orderId: 'ORD-DUP', utr: 'UTRDUP',
      amount: 5_000.0, date: VALUE_DATE, customer: cust(34), method: 'card',
      description: cust(34),
    });
    rows['bank-utr'].push({
      utr: 'UTRDUP', amount: 5_000.0, date: VALUE_DATE, counterparty: cust(34),
      narration: 'settlement UTRDUP',
    });
    rows['bank-utr'].push({
      utr: 'UTRDUPB', amount: 5_000.0, date: VALUE_DATE, counterparty: cust(34),
      narration: 'duplicate settlement row',
    });
    match(rid('razorpay-gateway', 'payDUP'), 'MDUP');
    match(rid('bank-utr', 'UTRDUP'), 'MDUP');
    except(rid('bank-utr', 'UTRDUPB'));
  }

  // ---- 5. Cross-match guard (MFA / MFB) ----------------------------------------
  // INV-A (₹100) for customer A and INV-B (₹100) for customer B have the SAME
  // amount but different customers / UTRs / orders — each must reconcile to its
  // OWN group and never cross-match into the other movement.
  {
    const cross = [
      { pay: 'payXA', order: 'ORD-XA', utr: 'UTRXA', inv: 'INV-XA', buyer: 'CrossAlpha Retail' },
      { pay: 'payXB', order: 'ORD-XB', utr: 'UTRXB', inv: 'INV-XB', buyer: 'CrossBeta Traders' },
    ] as const;
    for (const [idx, m] of cross.entries()) {
      const key = idx === 0 ? 'MFA' : 'MFB';
      rows['razorpay-gateway'].push({
        paymentId: m.pay, orderId: m.order, utr: m.utr, amount: 10_000.0,
        date: VALUE_DATE, customer: m.buyer, method: 'card', description: m.buyer,
      });
      rows['bank-utr'].push({
        utr: m.utr, amount: 10_000.0, date: VALUE_DATE, counterparty: m.buyer,
        narration: `settlement ${m.utr}`,
      });
      rows['gst-invoices'].push({
        invoiceNo: m.inv, orderId: m.order, amount: 10_000.0, date: VALUE_DATE,
        buyer: m.buyer, hsn: '998212', description: 'Hardware: laptop & peripherals',
      });
      match(rid('razorpay-gateway', m.pay), key);
      match(rid('bank-utr', m.utr), key);
      match(rid('gst-invoices', m.inv), key);
    }
  }

  const sources: Batch['sources'] = [
    { source: 'razorpay-gateway', rows: rows['razorpay-gateway'] },
    { source: 'bank-utr', rows: rows['bank-utr'] },
    { source: 'erp-orders', rows: rows['erp-orders'] },
    { source: 'gst-invoices', rows: rows['gst-invoices'] },
  ];
  return { id: BATCH_ID, sources, labels };
}

/**
 * generateScaledBatch — build a large synthetic batch of exactly `n` records with
 * a deterministic mix of clean matches, fee-netted matches, partials (near-dup
 * pairs), orphans and content-duplicates. Uses its own ref namespace so generated
 * ids never collide with the 81-record audit batch. Deterministic for a fixed
 * seed; O(n).
 *
 * Composition (records add up to exactly `n`):
 *   - clean (2 rec / group)  ~60% records  -> MATCHED (EXACT)
 *   - netted (3 rec / group) ~12% records  -> MATCHED (NETTED: gross = settle+fee)
 *   - partial (2 rec / pair) ~10% records  -> EXCEPTION (LOW_CONFIDENCE)
 *   - orphans (1 rec)        ~10% records  -> EXCEPTION (NO_KEY)
 *   - duplicates (1 rec)     ~8% records   -> EXCEPTION (DUPLICATE)
 */
export function generateScaledBatch(n: number, seed: number = SEED + 77): Batch {
  const rng = mulberry32(seed);
  const rows = sink();
  const labels: Record<string, GroundTruthLabel> = {};

  const C = Math.floor((n * 30) / 100); // clean groups
  const NT = Math.floor((n * 4) / 100); // netted groups
  const P = Math.floor((n * 5) / 100); // partial pairs
  const O = Math.floor((n * 10) / 100); // orphans
  const D = n - (2 * C + 3 * NT + 2 * P + O); // leftover = duplicates
  const match = (id: string, key: string) => {
    labels[id] = { expectedGroupKey: key, expectedStatus: 'MATCHED' };
  };
  const except = (id: string) => {
    labels[id] = { expectedGroupKey: null, expectedStatus: 'EXCEPTION' };
  };
  // NOTE: counterparties are made unique per scaled entity so fixed amounts
  // (netted gross/​settlement and clean) never collide into content-duplicates
  // purely from repeating the 10-name CUSTOMERS pool.

  const cleanAmt = new Array<number>(Math.max(1, C));
  for (const i of Array.from({ length: C }, (_, k) => k)) {
    const amt = intInclusive(rng, 200_000, 8_000_000);
    cleanAmt[i] = amt;
    const pay = `payc${i}`;
    const utr = `UTRC${i}`;
    const order = `ORDC${i}`;
    const cpy = `CleanCust ${i}`;
    rows['razorpay-gateway'].push({
      paymentId: pay, orderId: order, utr, amount: rupeeAmount(amt),
      date: VALUE_DATE, customer: cpy, method: 'card', description: cpy,
    });
    rows['bank-utr'].push({
      utr, amount: rupeeAmount(amt), date: VALUE_DATE, counterparty: cpy,
      narration: `settlement ${utr}`,
    });
    match(rid('razorpay-gateway', pay), `MC${i}`);
    match(rid('bank-utr', utr), `MC${i}`);
  }

  for (const j of Array.from({ length: NT }, (_, k) => k)) {
    const gross = 1_000_000;
    const feeAmt = 17_700;
    const settled = gross - feeAmt;
    const pay = `payn${j}`;
    const utr = `UTRN${j}`;
    const order = `ORDN${j}`;
    const cpy = `NettedCust ${j}`;
    rows['razorpay-gateway'].push({
      paymentId: pay, orderId: order, utr, amount: rupeeAmount(gross),
      date: VALUE_DATE, customer: cpy, method: 'card', description: cpy,
    });
    rows['razorpay-gateway'].push({
      kind: 'FEE', feeRef: `feen${j}`, paymentId: pay, orderId: order, utr,
      amount: -rupeeAmount(feeAmt), date: VALUE_DATE, customer: cpy,
      method: 'tdr', description: `gateway fee on ${pay}`,
    });
    rows['bank-utr'].push({
      utr, orderId: order, amount: rupeeAmount(settled), date: VALUE_DATE,
      counterparty: cpy, narration: `net settlement ${utr}`,
    });
    match(rid('razorpay-gateway', pay), `MNS${j}`);
    match(rid('razorpay-gateway', `feen${j}`), `MNS${j}`);
    match(rid('bank-utr', utr), `MNS${j}`);
  }

  for (const k of Array.from({ length: P }, (_, m) => m)) {
    const amt = intInclusive(rng, 50_000, 500_000);
    const cpy = `PartialCust ${k}`;
    rows['bank-utr'].push({
      utr: `UTRP${k}A`, amount: rupeeAmount(amt), date: VALUE_DATE,
      counterparty: cpy, narration: 'near-dup A',
    });
    rows['bank-utr'].push({
      utr: `UTRP${k}B`, amount: rupeeAmount(amt - 20), date: VALUE_DATE,
      counterparty: `UnrelatedCust ${k}`, narration: 'near-dup B',
    });
    except(rid('bank-utr', `UTRP${k}A`));
    except(rid('bank-utr', `UTRP${k}B`));
  }

  for (const o of Array.from({ length: O }, (_, k) => k)) {
    const amt = intInclusive(rng, 1000, 80_000);
    rows['bank-utr'].push({
      utr: `UTRO${o}`, amount: rupeeAmount(amt), date: '2026-08-13',
      counterparty: `OrphanCust ${o}`, narration: 'unmatched collection',
    });
    except(rid('bank-utr', `UTRO${o}`));
  }

  for (const d of Array.from({ length: D }, (_, k) => k)) {
    const i = d % Math.max(1, C);
    const cpy = `CleanCust ${i}`;
    rows['bank-utr'].push({
      utr: `UTRD${d}`, amount: rupeeAmount(cleanAmt[i]), date: VALUE_DATE,
      counterparty: cpy, narration: 'duplicate settlement row',
    });
    except(rid('bank-utr', `UTRD${d}`));
  }

  const sources: Batch['sources'] = [
    { source: 'razorpay-gateway', rows: rows['razorpay-gateway'] },
    { source: 'bank-utr', rows: rows['bank-utr'] },
    { source: 'erp-orders', rows: rows['erp-orders'] },
    { source: 'gst-invoices', rows: rows['gst-invoices'] },
  ];
  return { id: `batch-scale-${n}-${seed}`, sources, labels };
}

function main(): void {
  const batch = generateBatch();
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUT, JSON.stringify(batch, null, 2), 'utf8');
  const total = batch.sources.reduce((a, s) => a + s.rows.length, 0);
  const bySource = Object.fromEntries(batch.sources.map((s) => [s.source, s.rows.length]));
  console.log(`wrote batch ${BATCH_ID}: records=${total} labels=${batch.labels ? Object.keys(batch.labels).length : 0}`);
  console.log(`  source counts: ${JSON.stringify(bySource)}`);
}

if (process.argv[1]?.endsWith('generate-batch.ts')) {
  main();
}
