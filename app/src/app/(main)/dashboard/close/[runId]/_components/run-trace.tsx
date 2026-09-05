import { Check, Minus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AuditEvent, RunDetail } from "@/lib/close/types";

/**
 * Run stage trace — the order the close graph executed a run.
 *
 * The authoritative stage order comes from the LangGraph close graph in
 * `src/lib/close/graph.ts`: ingest → reconcile → judge → settle → forecast → tax →
 * fileExceptions → closeRun. Each graph node appends one audit event (action INGEST /
 * MATCH / JUDGE / SETTLE / FORECAST / TAX / EXCEPTION / CLOSE) as it commits its stage.
 *
 * When the run surfaced per-stage audit events we render them (marking the stage done with
 * its timestamp / detail). Never invent timing — when no audit events exist we fall back to
 * the plain stage list plus the run status, and say so.
 */

interface Stage {
  action: AuditEvent["action"];
  name: string;
  hint: string;
}

const STAGES: Stage[] = [
  { action: "INGEST", name: "Ingest", hint: "Load gateway, bank, ERP & GST sources" },
  { action: "MATCH", name: "Reconcile", hint: "Link records deterministically (exact / normalized / netted)" },
  { action: "JUDGE", name: "Judge", hint: "Resolve residual candidacies, bounded revision loop" },
  { action: "SETTLE", name: "Settle", hint: "Bound settlements to reconciled groups" },
  { action: "FORECAST", name: "Forecast", hint: "Project 7-day cash balance" },
  { action: "TAX", name: "Tax", hint: "Map GST invoices to HSN categories" },
  { action: "EXCEPTION", name: "File exceptions", hint: "Surface every residual honestly" },
  { action: "CLOSE", name: "Close", hint: "Terminal control — marks the run done" },
];

export function RunTrace({ run }: { run: RunDetail }) {
  const { audit } = run;
  const eventsByAction = new Map<AuditEvent["action"], AuditEvent[]>();
  for (const ev of audit) {
    const list = eventsByAction.get(ev.action) ?? [];
    list.push(ev);
    eventsByAction.set(ev.action, list);
  }
  const hasAudit = audit.length > 0;
  const recordedCount = STAGES.filter((s) => (eventsByAction.get(s.action)?.length ?? 0) > 0).length;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-normal">
          Run stage trace
          <Badge variant="outline" className="text-muted-foreground">
            {run.meta.status}
          </Badge>
        </CardTitle>
        <CardDescription>
          Order the close graph executed — stage order from the graph, status from the run
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="relative flex flex-col gap-0">
          {STAGES.map((stage, i) => {
            const events = eventsByAction.get(stage.action) ?? [];
            const done = events.length > 0;
            const isLast = i === STAGES.length - 1;
            return (
              <li key={stage.action} className="relative flex gap-3 pb-4">
                {!isLast && <span aria-hidden className="absolute top-4 left-[7px] h-full w-px bg-foreground/10" />}
                <span className="relative z-10 mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full ring-1 ring-foreground/10">
                  {done ? (
                    <Check aria-hidden className="size-3.5 rounded-full bg-green-500/80 p-0.5 text-white" />
                  ) : (
                    <>
                      <Minus aria-hidden className="size-2 text-muted-foreground" />
                      <span className="sr-only">not recorded</span>
                    </>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-sm">
                      {i + 1}. {stage.name}
                    </p>
                    {events.length > 0 ? (
                      <Badge variant="secondary" className="tabular-nums">
                        {events.length}×
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">{stage.hint}</p>
                  {events[0]?.createdAt && (
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(events[0].createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <p className="text-muted-foreground text-xs">
          {hasAudit
            ? `${recordedCount} of ${STAGES.length} stages recorded per-stage audit events. Stage names and order come from the close graph (ingest → reconcile → judge → settle → forecast → tax → fileExceptions → closeRun).`
            : "No per-stage audit events were recorded for this run, so stages are shown in graph order without timestamps."}
        </p>
      </CardContent>
    </Card>
  );
}
