import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchType, RunDetail } from "@/lib/close/types";

/**
 * Determinism KPIs for a close run.
 *
 * The product differentiator: how much of the run was resolved DETERMINISTICALLY (a rule /
 * netting identity decided it, no LLM needed) versus how many AI / ambiguous / unresolved
 * decisions remain. `aiCallsAvoided` == the count of deterministic decisions — one saved
 * LLM call per decision a coded rule already resolved.
 *
 * The per-type tally mirrors the reconcile endpoint's `matchTypeBreakdown`: every `MatchGroup`
 * is counted by its `matchType`, and every exception not already resolved on a group is counted
 * as `UNRESOLVED` (its `matchType`, when present, overrides that default).
 */
export function DeterminismKpis({ run }: { run: RunDetail }) {
  const breakdown = tallyMatchTypes(run);

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);

  // Everything resolved by a coded rule (no LLM call).
  const deterministicResolved =
    (breakdown.EXACT ?? 0) +
    (breakdown.NORMALIZED ?? 0) +
    (breakdown.FEE_NETTED ?? 0) +
    (breakdown.REFUND_NETTED ?? 0) +
    (breakdown.ADJUSTMENT_NETTED ?? 0);

  // Decisions that needed (or were punted to) the model, or never resolved.
  const aiResolved = breakdown.AI_RESOLVED ?? 0;
  const ambiguous = (breakdown.FUZZY ?? 0) + (breakdown.PARTIAL ?? 0);
  const unresolved = breakdown.UNRESOLVED ?? 0;

  // "Total matched": every decision with a disposition — deterministic or otherwise.
  const totalMatched = total - unresolved;
  const determinismPct = totalMatched > 0 ? (deterministicResolved / totalMatched) * 100 : 0;
  const aiCallsAvoided = deterministicResolved;

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-normal">Determinism</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          No decisions recorded for this run yet. Determinism KPIs appear once the run resolves a batch.
        </CardContent>
      </Card>
    );
  }

  const segments: Array<{ matchType: MatchType; count: number }> = (Object.keys(breakdown) as MatchType[])
    .filter((t) => (breakdown[t] ?? 0) > 0)
    .map((t) => ({ matchType: t, count: breakdown[t] ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">Determinism</CardTitle>
        <CardDescription>How much of this run was settled by rules &amp; netting — no LLM call needed</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground text-xs">Deterministic resolution</p>
            <p className="mt-1 text-3xl leading-none tracking-tight">{determinismPct.toFixed(1)}%</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {deterministicResolved} of {totalMatched} decisions resolved in code
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-muted-foreground text-xs">LLM calls avoided</p>
            <p className="mt-1 text-3xl leading-none tracking-tight">{aiCallsAvoided}</p>
            <p className="mt-1 text-muted-foreground text-xs">decisions a coded rule resolved instead of the model</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
            {segments.map((s) => (
              <div
                key={s.matchType}
                className="h-full"
                style={{ width: `${(s.count / total) * 100}%`, background: colorFor(s.matchType) }}
                title={`${s.matchType}: ${s.count}`}
              />
            ))}
          </div>

          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
            {segments.map((s) => (
              <li key={s.matchType} className="flex items-center gap-1.5 text-xs">
                <span className="size-2.5 rounded-sm" style={{ background: colorFor(s.matchType) }} aria-hidden />
                <span className="text-muted-foreground">{labelFor(s.matchType)}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {s.count}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        {(aiResolved > 0 || ambiguous > 0 || unresolved > 0) && (
          <p className="text-muted-foreground text-xs">
            {aiResolved > 0 && `${aiResolved} AI-resolved`}
            {aiResolved > 0 && (ambiguous > 0 || unresolved > 0) && " · "}
            {ambiguous > 0 && `${ambiguous} ambiguous/fuzzy`}
            {ambiguous > 0 && unresolved > 0 && " · "}
            {unresolved > 0 && `${unresolved} unresolved`}
            {" — surfaced as exceptions for review."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Deterministic rule-resolved match types (green) — everything else is model / open. */
const DETERMINISTIC_TYPES: ReadonlySet<MatchType> = new Set<MatchType>([
  "EXACT",
  "NORMALIZED",
  "FEE_NETTED",
  "REFUND_NETTED",
  "ADJUSTMENT_NETTED",
]);

/** Mirror the reconcile route: groups by matchType + exceptions defaulting to UNRESOLVED. */
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

function colorFor(t: MatchType): string {
  if (DETERMINISTIC_TYPES.has(t)) return "#16a34a";
  if (t === "AI_RESOLVED") return "#7c3aed";
  if (t === "FUZZY" || t === "PARTIAL") return "#d97706";
  return "#dc2626";
}

function labelFor(t: MatchType): string {
  switch (t) {
    case "EXACT":
      return "Exact";
    case "NORMALIZED":
      return "Normalized";
    case "FEE_NETTED":
      return "Fee netted";
    case "REFUND_NETTED":
      return "Refund netted";
    case "ADJUSTMENT_NETTED":
      return "Adjustment netted";
    case "PARTIAL":
      return "Partial";
    case "FUZZY":
      return "Fuzzy";
    case "AI_RESOLVED":
      return "AI-resolved";
    case "UNRESOLVED":
      return "Unresolved";
  }
}
