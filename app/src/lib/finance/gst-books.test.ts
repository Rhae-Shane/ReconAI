import { describe, expect, it } from "vitest";

import { RAZORPAY_GSTIN } from "@/lib/close/org";
import type { FinRecord } from "@/lib/close/types";
import { gstr2bFromRecords, internalPurchaseRows, outwardSupplies, pickGstin } from "@/lib/finance/gst-books";

function rec(partial: Partial<FinRecord> & Pick<FinRecord, "id" | "kind" | "sourceRef" | "amountPaise">): FinRecord {
  return {
    source: "gateway",
    sourceName: "Razorpay Gateway",
    ts: "2026-09-01T10:00:00.000Z",
    currency: "INR",
    ...partial,
  };
}

describe("gst-books", () => {
  it("reads GSTIN from raw, never invents a hash GSTIN", () => {
    expect(pickGstin({ gstin: "29AAGCR4375J1ZU" })).toBe("29AAGCR4375J1ZU");
    expect(pickGstin({ gstin: "not-a-gstin" })).toBeUndefined();
    expect(pickGstin({})).toBeUndefined();
  });

  it("books Razorpay fee tax invoices against Razorpay GSTIN", () => {
    const records = [
      rec({
        id: "fee1",
        kind: "FEE",
        sourceRef: "fee_pay_1",
        amountPaise: -2360,
        raw: { paymentId: "pay_1", feePaise: 2360, feeTaxPaise: 360, gstin: RAZORPAY_GSTIN },
      }),
    ];
    const internal = internalPurchaseRows(records);
    const twoB = gstr2bFromRecords(records);
    expect(internal).toHaveLength(1);
    expect(internal[0].supplierGstin).toBe(RAZORPAY_GSTIN);
    expect(internal[0].invoiceNo).toBe("RZP-FEE-pay_1");
    expect(twoB[0].supplierGstin).toBe(RAZORPAY_GSTIN);
    expect(twoB[0].source).toBe("gstr2b");
  });

  it("builds GSTR-1 outward supplies from captured payments", () => {
    const supplies = outwardSupplies([
      rec({ id: "p1", kind: "PAYMENT", sourceRef: "pay_1", amountPaise: 118000, raw: { gstin: "27AABCR0001R1Z5" } }),
    ]);
    expect(supplies).toHaveLength(1);
    expect(supplies[0].invoiceNo).toBe("pay_1");
    expect(supplies[0].gstin).toBe("27AABCR0001R1Z5");
  });
});
