import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { getRecords, getRunFromStore } from "@/lib/close/store";
import type { CloseReport, FinRecord, MatchGroup, RunDetail, Settlement } from "@/lib/close/types";
import { getRatelimit } from "@/lib/ops/ratelimit";

export const runtime = "nodejs";

/**
 * GET /api/close/reconcile?runId=...
 *
 * Recomputes and returns a finance-team reading of a completed close run: the
 * counts and sums of payments vs settlements, the payout schedule, payouts that
 * are still missing, and the forecast / unsettled amounts — all surfaced with an
 * explicit match-type breakdown so an engineer (or auditor) can see exactly how
 * every record was decided.
 *
 * Data flows through the same deterministic core (`CloseEngine` + `reconcile.ts`
 * semantics) that produced the persisted run, re-exposed here as a single
 * engineering-facing summary. The Redis run-store is preferred; the in-memory
 * demo store is used as fallback so the endpoint works with zero infra.
 */

/** Per-kind sums + counts of the raw records in a run. */
interface KindTotals {
  counts: Record<string, number>;
  sums: Record<string, number>;
}

/** One row of the payout schedule (grouped by settlement date). */
interface PayoutRow {
  date: string;
  expected: number;
  received: number;
  shortfall: number;
  reconciledGroups: number;
}

/** A payout still owed: an unresolved record whose expected amount is not met. */
interface MissingPayout {
  ref: string;
  expectedPaise: number;
  receivedPaise: number;
  shortfallPaise: number;
  reason: string;
}

interface ReconcileSummary {
  runId: string;
  status: string;
  counts: KindTotals;
  /** Netting-style amount rollup across every group (P0 settlement math). */
  amounts: {
    grossSum: number;
    feeSum: number;
    taxOnFeeSum: number;
    refundSum: number;
    adjustmentSum: number;
    netExpectedSum: number;
    settlementSum: number;
    totalVariance: number;
  };
  /** One row per settlement date: expected vs received vs shortfall. */
  payoutSchedule: PayoutRow[];
  /** Payouts still owed: unresolved records with an expected amount not met. */
  missingPayouts: MissingPayout[];
  /** 7-day forward cash projection + unsettled amount. */
  forecast: {
    series: Array<{ date: string; balancePaise: number; deltaPaise: number }>;
    unsettledAmount: number;
    projectedBalance: number;
  };
  /** Explicit decision label for every group + the unresolved residual. */
  matchTypeBreakdown: Record<string, number>;
  report: CloseReport;
}

/* ------------------------------------------------------------------ */
/* Helpers — aligned to the app's links-based MatchGroup / Settlement. */
/* ------------------------------------------------------------------ */

/** The raw member records of a group, resolved via its links. */
function memberRecords(g: MatchGroup, records: FinRecord[]): FinRecord[] {
  const ids = new Set(g.links.map((l) => l.recordId));
  return records.filter((r) => ids.has(r.id));
}

/** The settlement bound to a group, matched by its UTR key. */
function settleForGroup(g: MatchGroup, settlements: Settlement[]): Settlement | undefined {
  const utr = g.key.replace(/^utr:/, "");
  return settlements.find((s) => s.utrNumber === utr);
}

/** Deterministic confidence buckets for the reconciliation grid. */
function confidenceBinsOf(groups: MatchGroup[]): Array<{ bin: string; count: number }> {
  const bins = [
    { bin: "0.95+", count: 0 },
    { bin: "0.80–0.94", count: 0 },
    { bin: "0.70–0.79", count: 0 },
    { bin: "<0.70", count: 0 },
  ];
  for (const g of groups) {
    if (g.confidence >= 0.95) bins[0].count += 1;
    else if (g.confidence >= 0.8) bins[1].count += 1;
    else if (g.confidence >= 0.7) bins[2].count += 1;
    else bins[3].count += 1;
  }
  return bins;
}

/** Build the engineering-facing reconcile summary from a hydrated run detail. */
export function buildReconcileSummary(
  detail: RunDetail,
  records: FinRecord[] = getRecords(detail.meta.id),
): ReconcileSummary {
  // 1) Counts + sums by record kind.
  const counts: Record<string, number> = {};
  const sums: Record<string, number> = {};
  for (const r of records) {
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    sums[r.kind] = (sums[r.kind] ?? 0) + Math.abs(r.amountPaise);
  }

  // 2) Settlement-math rollup across all groups (P0 identity).
  let grossSum = 0;
  let feeSum = 0;
  let taxOnFeeSum = 0;
  let refundSum = 0;
  let adjustmentSum = 0;
  let settlementSum = 0;
  for (const g of detail.groups) {
    const members = memberRecords(g, records);
    const primary = members.reduce((a, b) => (Math.abs(b.amountPaise) > Math.abs(a.amountPaise) ? b : a), members[0]);
    grossSum += Math.abs(primary?.amountPaise ?? 0);
    for (const r of members) {
      if (r.kind === "FEE") {
        feeSum += Math.abs(r.amountPaise);
        taxOnFeeSum += Math.abs(r.feeTaxPaise ?? 0);
      } else if (r.kind === "REFUND") refundSum += Math.abs(r.amountPaise);
      else if (r.kind === "ADJUSTMENT") adjustmentSum += r.amountPaise;
      else if (r.kind === "SETTLEMENT" || r.source === "bank") settlementSum += r.amountPaise;
    }
  }
  const netExpectedSum = grossSum - feeSum - taxOnFeeSum - refundSum + adjustmentSum;
  const totalVariance = settlementSum - netExpectedSum;

  // 3) Payout schedule grouped by settlement date.
  const byDay = new Map<string, { expected: number; received: number; count: number }>();
  for (const s of detail.settlements) {
    const day = s.settledAt.slice(0, 10);
    const row = byDay.get(day) ?? { expected: 0, received: 0, count: 0 };
    row.received += Math.abs(s.amountPaise);
    row.count += 1;
    const bound = detail.groups.find((g) => settleForGroup(g, detail.settlements) === s);
    // Expected payout = the net settlement we forecast: netExpected when a netting
    // breakdown exists, otherwise the bound group's representative amount.
    const expectedAmount = bound?.netting
      ? Math.abs(bound.netting.netExpectedPaise)
      : Math.abs(bound?.amountPaise ?? s.amountPaise);
    row.expected += expectedAmount;
    byDay.set(day, row);
  }
  const payoutSchedule: PayoutRow[] = Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, row]) => ({
      date,
      expected: row.expected,
      received: row.received,
      shortfall: row.expected - row.received,
      reconciledGroups: row.count,
    }));

  // 4) Missing payouts: unresolved records with an unmet expected amount.
  const settledIds = new Set<string>();
  for (const g of detail.groups) for (const l of g.links) settledIds.add(l.recordId);
  const missingPayouts: MissingPayout[] = detail.exceptions
    .filter((e) => e.recordId && !settledIds.has(e.recordId))
    .map((e) => {
      const expected =
        typeof e.expectedPaise === "number" ? e.expectedPaise : Math.abs((e.recordJson?.amountPaise as number) ?? 0);
      const received = e.actualPaise ?? 0;
      return {
        ref: (e.recordJson?.ref as string) ?? (e.recordId as string),
        expectedPaise: expected,
        receivedPaise: received,
        shortfallPaise: expected - received,
        reason: e.reasonCode,
      };
    });

  // 5) Forecast series + unsettled amount.
  const unsettledAmount = detail.groups
    .filter((g) => g.matchType !== "UNRESOLVED")
    .reduce((a, g) => a + Math.abs(g.amountPaise), 0);
  const forecast = {
    series: detail.forecast.map((f) => ({ date: f.date, balancePaise: f.balancePaise, deltaPaise: f.deltaPaise })),
    unsettledAmount,
    projectedBalance: detail.forecast[detail.forecast.length - 1]?.balancePaise ?? 0,
  };

  // 6) Explicit decision label for every group; the unresolved residual counted too.
  const matchTypeBreakdown: Record<string, number> = {};
  for (const g of detail.groups) matchTypeBreakdown[g.matchType] = (matchTypeBreakdown[g.matchType] ?? 0) + 1;
  for (const e of detail.exceptions) {
    const t = e.matchType ?? "UNRESOLVED";
    matchTypeBreakdown[t] = (matchTypeBreakdown[t] ?? 0) + 1;
  }

  return {
    runId: detail.meta.id,
    status: detail.meta.status,
    counts: { counts, sums },
    amounts: {
      grossSum,
      feeSum,
      taxOnFeeSum,
      refundSum,
      adjustmentSum,
      netExpectedSum,
      settlementSum,
      totalVariance,
    },
    payoutSchedule,
    missingPayouts,
    forecast,
    matchTypeBreakdown,
    report: {
      runId: detail.meta.id,
      generatedAt: detail.meta.finishedAt ?? new Date().toISOString(),
      totals: detail.meta.totals,
      breakdown: {
        records: detail.meta.totals.records,
        matched: detail.meta.totals.matched,
        partial: Math.max(0, detail.meta.totals.records - detail.meta.totals.matched - detail.exceptions.length),
        unresolved: detail.exceptions.length,
        matchRate: detail.meta.totals.records ? detail.meta.totals.matched / detail.meta.totals.records : 0,
      },
      perSource: detail.sources,
      confidenceBins: confidenceBinsOf(detail.groups),
      exceptions: detail.exceptions,
      groundedRecords: detail.groups.length,
      unresolved: detail.exceptions
        .filter((e) => e.recordId)
        .map((e) => ({
          recordId: e.recordId as string,
          ref: (e.recordJson?.ref as string) ?? (e.recordId as string),
          expectedPaise:
            typeof e.expectedPaise === "number"
              ? e.expectedPaise
              : Math.abs((e.recordJson?.amountPaise as number) ?? 0),
          actualPaise: e.actualPaise ?? 0,
          differencePaise:
            (typeof e.expectedPaise === "number"
              ? e.expectedPaise
              : Math.abs((e.recordJson?.amountPaise as number) ?? 0)) - (e.actualPaise ?? 0),
          reason: e.reasonCode,
          confidence: e.confidence ?? 0.5,
          status: "NEEDS_REVIEW",
        })),
    },
  };
}

/** GET /api/close/reconcile?runId=... — the engineering answer for a run. */
export async function GET(request: Request) {
  // Read-only reconciliation reading — every authenticated role may view it.
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const ratelimit = getRatelimit();
  if (ratelimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json(
      { error: "runId query parameter is required (e.g. /api/close/reconcile?runId=run_123)." },
      { status: 400 },
    );
  }

  const detail = await getRunFromStore(runId);
  if (!detail) {
    return NextResponse.json({ error: `No completed run found for ${runId}.` }, { status: 404 });
  }

  return NextResponse.json(buildReconcileSummary(detail));
}
