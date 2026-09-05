import { AlertTriangle, CheckCircle2, HandCoins, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchBreakdown } from "@/lib/close/types";

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  icon: typeof CheckCircle2;
  tone: "good" | "warn" | "neutral";
}) {
  return (
    <Card className="gap-4 overflow-hidden rounded-none border-0 border-foreground/10 ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="font-normal text-muted-foreground text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="text-2xl leading-none tracking-tight">{value}</div>
          <p className="text-muted-foreground text-xs">{sub}</p>
        </div>
        {tone === "good" && (
          <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">ok</Badge>
        )}
        {tone === "warn" && <Badge variant="destructive">review</Badge>}
      </CardContent>
    </Card>
  );
}

/**
 * Explicit reconciliation-outcome KPIs (matched / partial / unresolved / match rate),
 * driven by `CloseReport.breakdown`. Renders graceful placeholders when the breakdown
 * is not yet available on the report artifact.
 */
export function OutcomeKpis({ breakdown }: { breakdown?: MatchBreakdown }) {
  const available = breakdown != null;
  const count = (n?: number) => (available ? `${n ?? 0}` : "—");
  const rate = available ? `${((breakdown?.matchRate ?? 0) * 100).toFixed(1)}%` : "—";

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="grid grid-cols-2 gap-px bg-foreground/10 lg:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          label="Matched"
          value={count(breakdown?.matched)}
          sub={available ? "linked cleanly" : "not yet available"}
          tone="good"
        />
        <StatTile
          icon={HandCoins}
          label="Partial"
          value={count(breakdown?.partial)}
          sub={available ? "near-match, held open" : "not yet available"}
          tone="neutral"
        />
        <StatTile
          icon={AlertTriangle}
          label="Unresolved"
          value={count(breakdown?.unresolved)}
          sub={available ? "filed as exceptions" : "not yet available"}
          tone={available && (breakdown?.unresolved ?? 0) > 0 ? "warn" : "neutral"}
        />
        <StatTile
          icon={Target}
          label="Match rate"
          value={rate}
          sub={available ? "of records resolved" : "not yet available"}
          tone="neutral"
        />
      </div>
    </div>
  );
}
