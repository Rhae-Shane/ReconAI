import { describe, expect, it } from "vitest";

import { buildMatchExplanation } from "@/lib/close/explain";
import type { FinRecord, MatchGroup } from "@/lib/close/types";

const INV: FinRecord = {
  id: "INV-1",
  source: "gst",
  sourceName: "GST",
  kind: "INVOICE",
  sourceRef: "INV-10001",
  ts: "2026-08-14",
  amountPaise: 1_000_000,
  currency: "INR",
  counterparty: "Acme",
};
const FEE: FinRecord = {
  id: "FEE-1",
  source: "gateway",
  sourceName: "Gateway",
  kind: "FEE",
  sourceRef: "fee_1",
  ts: "2026-08-14",
  amountPaise: -15_000,
  feeTaxPaise: 2_700,
  currency: "INR",
  counterparty: "Acme",
};
const STL: FinRecord = {
  id: "STL-1",
  source: "bank",
  sourceName: "Bank",
  kind: "SETTLEMENT",
  sourceRef: "UTR9",
  ts: "2026-08-14",
  amountPaise: 982_300,
  currency: "INR",
  counterparty: "Acme",
};

const feeNetted: MatchGroup = {
  id: "grp_0",
  runId: "run_test",
  key: "UTR9",
  method: "NETTED",
  matchType: "FEE_NETTED",
  confidence: 0.99,
  reason: "netted:fee",
  amountPaise: 1_000_000,
  ts: "2026-08-14",
  links: [
    { recordId: INV.id, matchedOn: "gross", matchType: "FEE_NETTED" },
    { recordId: FEE.id, matchedOn: "fee", matchType: "FEE_NETTED" },
    { recordId: STL.id, matchedOn: "utr", matchType: "FEE_NETTED" },
  ],
  netting: {
    grossPaise: 1_000_000,
    feePaise: 15_000,
    taxOnFeePaise: 2_700,
    refundPaise: 0,
    adjustmentPaise: 0,
    netExpectedPaise: 982_300,
    actualSettlementPaise: 982_300,
    variancePaise: 0,
  },
};

describe("buildMatchExplanation", () => {
  it("explains FEE_NETTED with gross/fee/GST/expected/settlement", () => {
    const expl = buildMatchExplanation(feeNetted, [INV, FEE, STL]);
    expect(expl.kind).toBe("deterministic");
    expect(expl.method).toBe("FEE_NETTING");
    expect(expl.aiUsed).toBe(false);
    expect(expl.invoiceRef).toBe("INV-10001");
    expect(expl.grossPaise).toBe(1_000_000);
    expect(expl.feePaise).toBe(15_000);
    expect(expl.taxOnFeePaise).toBe(2_700);
    expect(expl.expectedPaise).toBe(982_300);
    expect(expl.settlementPaise).toBe(982_300);
    expect(expl.differencePaise).toBe(0);
    expect(expl.confidence).toBe(0.99);
  });
});
