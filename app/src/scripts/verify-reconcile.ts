/**
 * verify-reconcile.ts — smoke test for the /api/close/reconcile engineering summary.
 *
 * Builds a minimal RunDetail that mirrors the review's P0 netting identity
 * (gross ₹10,000 − fee ₹150 − tax ₹27 + adjustment ₹0 = net ₹9,823 = settlement),
 * then asserts buildReconcileSummary returns the expected counts, sums, payout
 * schedule and match-type breakdown. Run: `npm run verify:reconcile` (or tsx).
 */
import { buildReconcileSummary } from "@/lib/close/reconcile-summary";
import type {
  CloseRunMeta,
  ExceptionRecord,
  FinRecord,
  ForecastDatum,
  MatchGroup,
  Settlement,
  SourceStat,
} from "@/lib/close/types";

function rec(
  id: string,
  kind: FinRecord["kind"],
  amountPaise: number,
  source: SourceStat["source"],
  extra: Partial<FinRecord> = {},
): FinRecord {
  return {
    id,
    source,
    sourceName: source,
    kind,
    sourceRef: id,
    ts: "2026-08-14",
    amountPaise,
    currency: "INR",
    ...extra,
  };
}

function meta(): CloseRunMeta {
  return {
    id: "run_verify",
    status: "DONE",
    startedAt: "2026-08-14T00:00:00.000Z",
    finishedAt: "2026-08-14T00:00:00.000Z",
    totals: { records: 3, matched: 3, exceptions: 1, resolvedPct: 100, groups: 1, judged: 0 },
  };
}

const INV = rec("INV-1", "INVOICE", 1000000, "gst", { counterparty: "Acme" });
const FEE = rec("FEE-1", "FEE", -15000, "gateway", { feeTaxPaise: 2700, counterparty: "Acme" });
const STL = rec("STL-1", "SETTLEMENT", 982300, "bank", { counterparty: "Acme" });
const records: FinRecord[] = [INV, FEE, STL];

const nettedGroup: MatchGroup = {
  id: "grp_0",
  runId: "run_verify",
  key: "UTR9",
  method: "NETTED",
  matchType: "FEE_NETTED",
  confidence: 0.98,
  reason: "netted: gross 1000000 - fee 15000 - tax 2700 - refund 0 + adjustment 0 = expected 982300 = settled 982300",
  amountPaise: 1000000,
  ts: "2026-08-14",
  links: [
    { recordId: INV.id, matchedOn: "gross", matchType: "FEE_NETTED" },
    { recordId: FEE.id, matchedOn: "fee", matchType: "FEE_NETTED" },
    { recordId: STL.id, matchedOn: "utr", matchType: "FEE_NETTED" },
  ],
  netting: {
    grossPaise: 1000000,
    feePaise: 17700, // 15000 + 2700 tax-on-fee
    taxOnFeePaise: 2700,
    refundPaise: 0,
    adjustmentPaise: 0,
    netExpectedPaise: 982300,
    actualSettlementPaise: 982300,
    variancePaise: 0,
  },
};

const ORPHAN = rec("ORD-9", "PAYMENT", 500000, "erp");
const orphanException: ExceptionRecord = {
  id: "exc_0",
  runId: "run_verify",
  recordId: ORPHAN.id,
  recordJson: { amountPaise: 500000, ref: "ORD-9" },
  reasonCode: "NO_KEY",
  rationale: "no usable reference key and no near-amount candidate (orphan)",
  candidateIds: [],
  status: "OPEN",
  createdAt: "2026-08-14",
  matchType: "UNRESOLVED",
  confidence: 0.5,
  expectedPaise: 500000,
  actualPaise: 0,
  variancePaise: 500000,
};

const settlements: Settlement[] = [
  {
    id: "stl_0",
    runId: "run_verify",
    settledAt: "2026-08-14T14:00:00.000Z",
    amountPaise: 982300,
    utrNumber: "UTR9",
    status: "RECEIVED",
    lagDays: 0,
  },
];

const forecast: ForecastDatum[] = [
  {
    id: "f_0",
    runId: "run_verify",
    date: "2026-08-15",
    balancePaise: 982300,
    deltaPaise: 982300,
    confidence: 0.9,
    reconciledIn: true,
  },
];

const sources: SourceStat[] = [{ source: "bank", sourceName: "Bank UTR", records: 1, matched: 1, matchRate: 1 }];

const detail = {
  meta: meta(),
  sources,
  groups: [nettedGroup],
  flaps: [],
  exceptions: [orphanException],
  settlements,
  forecast,
  taxMatches: [],
  audit: [],
};

const summary = buildReconcileSummary(detail, records);

// P0 identity holds: net expected === actual settlement.
if (summary.amounts.netExpectedSum !== summary.amounts.settlementSum) {
  throw new Error(`netting identity broken: ${summary.amounts.netExpectedSum} !== ${summary.amounts.settlementSum}`);
}
if (summary.amounts.totalVariance !== 0) {
  throw new Error(`variance should be 0, got ${summary.amounts.totalVariance}`);
}
// Counts: 1 invoice, 1 fee, 1 settlement.
if (summary.counts.counts.INVOICE !== 1 || summary.counts.counts.FEE !== 1 || summary.counts.counts.SETTLEMENT !== 1) {
  throw new Error(`unexpected counts: ${JSON.stringify(summary.counts.counts)}`);
}
// Payout schedule: one row, fully reconciled, zero shortfall.
if (summary.payoutSchedule.length !== 1 || summary.payoutSchedule[0].shortfall !== 0) {
  throw new Error(`unexpected payout schedule: ${JSON.stringify(summary.payoutSchedule)}`);
}
// Match-type breakdown includes FEE_NETTED (group) + UNRESOLVED (orphan).
if (summary.matchTypeBreakdown.FEE_NETTED !== 1 || summary.matchTypeBreakdown.UNRESOLVED !== 1) {
  throw new Error(`unexpected matchTypeBreakdown: ${JSON.stringify(summary.matchTypeBreakdown)}`);
}
// Missing payouts includes the orphan with the full expected amount.
if (summary.missingPayouts.length !== 1 || summary.missingPayouts[0]?.shortfallPaise !== 500000) {
  throw new Error(`unexpected missingPayouts: ${JSON.stringify(summary.missingPayouts)}`);
}

console.log("PASS: /api/close/reconcile engineering summary is correct.");
console.log(JSON.stringify(summary, null, 2));
