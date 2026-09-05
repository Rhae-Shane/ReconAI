import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReport } from "@/lib/close/store";
import type { CloseRunMeta } from "@/lib/close/types";

import { KpiHint } from "./kpi-hint";
import { OutcomeKpis } from "./outcome-kpis";

export function RunSummaryKpis({ runs }: { runs: CloseRunMeta[] }) {
  const done = runs.filter((r) => r.status === "DONE");
  const latest = done[0];
  const breakdown = latest ? getReport(latest.id)?.breakdown : undefined;
  const records = done.reduce((sum, r) => sum + r.totals.records, 0);
  const matched = done.reduce((sum, r) => sum + r.totals.matched, 0);
  const exceptions = done.reduce((sum, r) => sum + r.totals.exceptions, 0);

  const kpis = [
    {
      label: "Close runs",
      hint: "How many close jobs are in the system. The subtitle counts how many finished successfully.",
      value: `${runs.length}`,
      sub: `${done.length} completed`,
      tone: "neutral" as const,
    },
    {
      label: "Records processed",
      hint: "Total gateway, bank, ERP, and GST lines fed into completed runs — and how many linked across those four sources.",
      value: `${records}`,
      sub: `${matched} matched across 4 sources`,
      tone: "neutral" as const,
    },
    {
      label: "Latest resolved",
      hint: "Share of records that matched or settled on the most recent completed run.",
      value: `${(latest?.totals.resolvedPct ?? 0).toFixed(1)}%`,
      sub: latest ? `run ${latest.id}` : "no completed run",
      tone: "good" as const,
    },
    {
      label: "Open exceptions",
      hint: "Unmatched or ambiguous lines held for human review. Nothing is silently dropped.",
      value: `${exceptions}`,
      sub: "honest, never dropped",
      tone: exceptions > 0 ? ("warn" as const) : ("good" as const),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <Card
              key={kpi.label}
              className="gap-4 overflow-hidden rounded-none border-0 border-foreground/10 ring-0 xl:[&:not(:last-child)]:border-r sm:[&:nth-child(odd)]:border-r"
            >
              <CardHeader>
                <CardTitle className="font-normal">
                  <KpiHint hint={kpi.hint}>{kpi.label}</KpiHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-end justify-between">
                <div className="space-y-1">
                  <div className="text-3xl leading-none tracking-tight">{kpi.value}</div>
                  <p className="text-muted-foreground text-xs">{kpi.sub}</p>
                </div>
                {kpi.tone === "good" && (
                  <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">ok</Badge>
                )}
                {kpi.tone === "warn" && <Badge variant="destructive">needs review</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <OutcomeKpis breakdown={breakdown} />
    </div>
  );
}
