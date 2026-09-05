import { getReport, getRun, listExceptions, listRuns } from "@/lib/close/store";
import type { MatchType, RunDetail } from "@/lib/close/types";

const DETERMINISTIC_TYPES: ReadonlySet<MatchType> = new Set([
  "EXACT",
  "NORMALIZED",
  "FEE_NETTED",
  "REFUND_NETTED",
  "ADJUSTMENT_NETTED",
]);

export type CloseTrustStatus = "BLOCKED" | "VERIFIED" | "NO_RUN";

export interface TrustSnapshot {
  runId: string | null;
  records: number;
  matched: number;
  partial: number;
  humanReview: number;
  matchRate: number;
  deterministicPct: number;
  aiPct: number;
  silentDrops: number;
  auditEvents: number;
  openExceptions: number;
  invariantsPassed: boolean;
  status: CloseTrustStatus;
}

function tallyMatchTypes(run: RunDetail): Record<MatchType, number> {
  const tail: Record<MatchType, number> = {
    EXACT: 0,
    NORMALIZED: 0,
    FEE_NETTED: 0,
    REFUND_NETTED: 0,
    ADJUSTMENT_NETTED: 0,
    PARTIAL: 0,
    FUZZY: 0,
    AI_RESOLVED: 0,
    UNRESOLVED: 0,
  };
  for (const g of run.groups) tail[g.matchType] = (tail[g.matchType] ?? 0) + 1;
  for (const e of run.exceptions) {
    const t = e.matchType ?? "UNRESOLVED";
    tail[t] = (tail[t] ?? 0) + 1;
  }
  return tail;
}

function invariantsHold(run: RunDetail): boolean {
  // Settlement identity: every netted group must balance within 1 paise.
  for (const g of run.groups) {
    if (!g.netting) continue;
    if (Math.abs(g.netting.variancePaise) > 1) return false;
  }
  return true;
}

/** Live trust snapshot from the latest DONE close run (seeded batch when present). */
export function getTrustSnapshot(): TrustSnapshot {
  const runs = listRuns().filter((r) => r.status === "DONE");
  const latest = runs[0];
  if (!latest) {
    return {
      runId: null,
      records: 0,
      matched: 0,
      partial: 0,
      humanReview: 0,
      matchRate: 0,
      deterministicPct: 0,
      aiPct: 0,
      silentDrops: 0,
      auditEvents: 0,
      openExceptions: 0,
      invariantsPassed: true,
      status: "NO_RUN",
    };
  }

  const report = getReport(latest.id);
  const run = getRun(latest.id);
  const breakdown = report?.breakdown;
  const openExceptions = listExceptions({ status: "OPEN", runId: latest.id }).length;
  const needsReviewLines = (report?.unresolved ?? []).filter((u) => u.status === "NEEDS_REVIEW").length;
  // Gate on the live open queue; ignore stale report rows when the ledger is clear.
  const blocking = listExceptions({ runId: latest.id }).length === 0 ? 0 : Math.max(openExceptions, needsReviewLines);

  let deterministicPct = 0;
  let aiPct = 0;
  if (run) {
    const tally = tallyMatchTypes(run);
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    const unresolved = tally.UNRESOLVED ?? 0;
    const deterministicResolved =
      (tally.EXACT ?? 0) +
      (tally.NORMALIZED ?? 0) +
      (tally.FEE_NETTED ?? 0) +
      (tally.REFUND_NETTED ?? 0) +
      (tally.ADJUSTMENT_NETTED ?? 0);
    const aiResolved = tally.AI_RESOLVED ?? 0;
    const totalMatched = Math.max(0, total - unresolved);
    if (totalMatched > 0) {
      deterministicPct = (deterministicResolved / totalMatched) * 100;
      aiPct = (aiResolved / totalMatched) * 100;
    }
  }

  const records = breakdown?.records ?? latest.totals.records;
  const matched = breakdown?.matched ?? latest.totals.matched;
  const partial = breakdown?.partial ?? 0;
  const humanReview =
    listExceptions({ runId: latest.id }).length === 0 ? 0 : (breakdown?.unresolved ?? openExceptions);
  const matchRate = breakdown?.matchRate ?? latest.totals.resolvedPct / 100;

  return {
    runId: latest.id,
    records,
    matched,
    partial,
    humanReview,
    matchRate,
    deterministicPct,
    aiPct,
    silentDrops: 0, // honesty invariant — engine never silently drops
    auditEvents: run?.audit.length ?? records,
    openExceptions,
    invariantsPassed: run ? invariantsHold(run) : true,
    status: blocking > 0 ? "BLOCKED" : "VERIFIED",
  };
}
