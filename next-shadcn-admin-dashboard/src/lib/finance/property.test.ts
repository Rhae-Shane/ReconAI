import { array, assert, constant, constantFrom, integer, property, record } from "fast-check";
import { describe, expect, it } from "vitest";

import { ageBuckets } from "@/lib/finance/aging";
import { type GstB2bRow, reconcileGst2BByInvoice } from "@/lib/finance/gst";

/**
 * Property tests (fast-check) for the deterministic finance primitives in `src/lib/finance`.
 *
 * Both properties are invariants that must hold for ANY input, not just hand-picked fixtures:
 *   - GST 2B reconciliation consumes every row exactly once (conservation of rows).
 *   - Aging buckets conserve total paise (nothing dropped, nothing fabricated) and counts are sane.
 */

/** Bounded petite amounts (paise) - money stays integer, small enough to avoid float surprises. */
const PAISE = integer({ min: -1_000_000, max: 1_000_000 });

/** Build a string arbitrary from a bounded char alphabet (no `stringOf` in this fast-check version). */
const strArb = (chars: string[], minLength: number, maxLength: number) =>
  array(constantFrom(...chars), { minLength, maxLength }).map((cs) => cs.join(""));

const GSTIN = strArb(["A", "B", "C"], 1, 6);
const INVOICE_NO = strArb(["1", "2", "3", "4", "5"], 1, 4);

function rowArb(source: GstB2bRow["source"]) {
  return record<GstB2bRow>({
    supplierGstin: GSTIN,
    invoiceNo: INVOICE_NO,
    invoiceDate: constant("2024-04-01"),
    taxablePaise: PAISE,
    taxPaise: PAISE,
    totalPaise: PAISE,
    source: constant(source),
  });
}

function key(r: GstB2bRow): string {
  return `${r.supplierGstin.trim().toLowerCase()}|${r.invoiceNo.trim().toLowerCase()}`;
}

/** An arbitrarily long row array with no duplicate (supplierGstin, invoiceNo) keys within it. */
const uniqueKeyRows = (source: GstB2bRow["source"]) =>
  array(rowArb(source), { minLength: 0, maxLength: 20 }).map((rows) => {
    const seen = new Set<string>();
    const unique: GstB2bRow[] = [];
    for (const r of rows) {
      const k = key(r);
      if (!seen.has(k)) {
        seen.add(k);
        unique.push(r);
      }
    }
    return unique;
  });

describe("reconcileGst2BByInvoice (property)", () => {
  it("accounts for every unique row exactly once, with a bounded match rate", async () => {
    await assert(
      property(uniqueKeyRows("gstr2b"), uniqueKeyRows("internal"), (gstr2b, internal) => {
        const result = reconcileGst2BByInvoice(gstr2b, internal);
        const uniqueKeys = new Set<string>([...gstr2b, ...internal].map(key));

        // Every unique (gstin, invoiceNo) across both ledgers ends up in exactly one of
        // matched / unmatched - nothing dropped, nothing double-counted.
        expect(result.matched.length + result.unmatched.length).toBe(uniqueKeys.size);

        // A match rate is a fraction of gstr2b rows; always within [0, 1].
        expect(result.matchRate).toBeGreaterThanOrEqual(0);
        expect(result.matchRate).toBeLessThanOrEqual(1);
        return true;
      }),
    );
  });
});

describe("ageBuckets (property)", () => {
  it("conserves total paise and never produces a negative bucket count", async () => {
    const rows = array(record({ dateIso: constant("2024-01-15"), amountPaise: PAISE }), {
      minLength: 0,
      maxLength: 50,
    });
    const asOf = constant("2024-01-31");
    const labels = array(constantFrom<"a" | "b" | "c" | "d">("a", "b", "c", "d"), { minLength: 1, maxLength: 8 });

    await assert(
      property(rows, asOf, labels, (rowSet, asOfIso, bucketLabels) => {
        const buckets = ageBuckets(rowSet, asOfIso, bucketLabels);

        const sumBuckets = buckets.reduce((sum, b) => sum + b.amountPaise, 0);
        const sumInput = rowSet.reduce((sum, r) => sum + r.amountPaise, 0);
        expect(sumBuckets).toBe(sumInput);

        for (const b of buckets) expect(b.count).toBeGreaterThanOrEqual(0);
        return true;
      }),
    );
  });
});
