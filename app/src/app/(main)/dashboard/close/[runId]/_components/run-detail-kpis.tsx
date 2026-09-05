import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchBreakdown, RunDetail } from "@/lib/close/types";

import { OutcomeKpis } from "../../_components/outcome-kpis";

export function RunDetailKpis({ run, breakdown }: { run: RunDetail; breakdown?: MatchBreakdown }) {
  const t = run.meta.totals;
  const kpis = [
    { label: "Records", value: `${t.records}`, sub: "across 4 sources" },
    { label: "Resolved", value: `${t.resolvedPct.toFixed(1)}%`, sub: `${t.matched} matched` },
    { label: "Match groups", value: `${t.groups}`, sub: `${t.judged} judged` },
    { label: "Exceptions", value: `${t.exceptions}`, sub: "honest list" },
    { label: "Precision", value: t.precision != null ? `${t.precision.toFixed(2)}` : "—", sub: "on judged subset" },
    { label: "Recall", value: t.recall != null ? `${t.recall.toFixed(2)}` : "—", sub: "vs ground truth" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-2 gap-px bg-foreground/10 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <Card key={kpi.label} className="gap-4 overflow-hidden rounded-none border-0 ring-0">
              <CardHeader>
                <CardTitle className="font-normal">{kpi.label}</CardTitle>
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
