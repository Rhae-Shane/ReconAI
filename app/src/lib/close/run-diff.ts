/**
 * Diff close run N vs N−1: match rate, exceptions, unmatched refs.
 */

import type { CloseReport, CloseRunMeta } from "@/lib/close/types";

export interface RunDiff {
  a: { id: string; startedAt: string };
  b: { id: string; startedAt: string };
  matchRateDelta: number;
  matchedDelta: number;
  exceptionDelta: number;
  unresolvedDelta: number;
  recordsDelta: number;
  addedUnresolved: string[];
  clearedUnresolved: string[];
}

function unresolvedRefs(report: CloseReport | null | undefined): Set<string> {
  return new Set((report?.unresolved ?? []).map((u) => u.ref || u.recordId));
}

export function diffReports(
  a: { meta: CloseRunMeta; report: CloseReport | null },
  b: { meta: CloseRunMeta; report: CloseReport | null },
): RunDiff {
  const aRate = a.report?.breakdown.matchRate ?? a.meta.totals.resolvedPct / 100;
  const bRate = b.report?.breakdown.matchRate ?? b.meta.totals.resolvedPct / 100;
  const aUnres = unresolvedRefs(a.report);
  const bUnres = unresolvedRefs(b.report);
  return {
    a: { id: a.meta.id, startedAt: a.meta.startedAt },
    b: { id: b.meta.id, startedAt: b.meta.startedAt },
    matchRateDelta: aRate - bRate,
    matchedDelta: (a.meta.totals.matched ?? 0) - (b.meta.totals.matched ?? 0),
    exceptionDelta: (a.meta.totals.exceptions ?? 0) - (b.meta.totals.exceptions ?? 0),
    unresolvedDelta: (a.report?.unresolved.length ?? 0) - (b.report?.unresolved.length ?? 0),
    recordsDelta: (a.meta.totals.records ?? 0) - (b.meta.totals.records ?? 0),
    addedUnresolved: [...aUnres].filter((r) => !bUnres.has(r)),
    clearedUnresolved: [...bUnres].filter((r) => !aUnres.has(r)),
  };
}

export function pickPrevRun(runs: CloseRunMeta[], currentId: string): CloseRunMeta | null {
  const ordered = [...runs].sort((x, y) => new Date(y.startedAt).getTime() - new Date(x.startedAt).getTime());
  const idx = ordered.findIndex((r) => r.id === currentId);
  if (idx >= 0 && idx + 1 < ordered.length) return ordered[idx + 1];
  return ordered.find((r) => r.id !== currentId && r.id !== "run_today") ?? null;
}
