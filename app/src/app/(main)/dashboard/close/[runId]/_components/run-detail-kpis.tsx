import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchBreakdown, RunDetail } from "@/lib/close/types";

import { KpiHint } from "../../_components/kpi-hint";
import { OutcomeKpis } from "../../_components/outcome-kpis";

export function RunDetailKpis({ run, breakdown }: { run: RunDetail; breakdown?: MatchBreakdown }) {
  const t = run.meta.totals;
  const kpis = [
    {
      label: "Records",
      hint: "Total lines ingested for this run across gateway, bank, ERP, and GST.",
      value: `${t.records}`,
      sub: "across 4 sources",
    },
    {
      label: "Resolved",
      hint: "Share of this run’s records that matched or settled successfully.",
      value: `${t.resolvedPct.toFixed(1)}%`,
      sub: `${t.matched} matched`,
    },
    {
      label: "Match groups",
      hint: "Clusters of linked records. Judged count is residual cases that needed AI or review.",
      value: `${t.groups}`,
      sub: `${t.judged} judged`,
    },
    {
      label: "Exceptions",
      hint: "Honest list of lines that still need a human — never hidden or auto-closed.",
      value: `${t.exceptions}`,
      sub: "honest list",
    },
    {
      label: "Precision",
      hint: "Of judged matches, how many were correct against ground truth.",
      value: t.precision != null ? `${t.precision.toFixed(2)}` : "—",
      sub: "on judged subset",
    },
    {
      label: "Recall",
      hint: "Of true matches in ground truth, how many the engine found.",
      value: t.recall != null ? `${t.recall.toFixed(2)}` : "—",
      sub: "vs ground truth",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-2 gap-px bg-foreground/10 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="gap-4 overflow-hidden rounded-none border-0 ring-0">
              <CardHeader>
                <CardTitle className="font-normal">
                  <KpiHint hint={kpi.hint}>{kpi.label}</KpiHint>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-end justify-between">
                <div>
                  <div className="text-2xl leading-none tracking-tight">{kpi.value}</div>
                  <p className="mt-1 text-muted-foreground text-xs">{kpi.sub}</p>
                </div>
                {kpi.label === "Exceptions" && kpi.value !== "0" && <Badge variant="destructive">review</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      <OutcomeKpis breakdown={breakdown} />
    </div>
  );
}
