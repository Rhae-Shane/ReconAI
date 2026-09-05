"use client";

import { Check, Loader2, Minus, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const PIPELINE_STAGES = [
  { id: "ingest", label: "Ingest", hint: "Load CSV / gateway / bank / GST rows" },
  { id: "reconcile", label: "Reconcile", hint: "Exact → normalized → fee netting" },
  { id: "judge", label: "AI Judge", hint: "Resolve residual flaps with the model" },
  { id: "settle", label: "Settle", hint: "Bind settlements to matched groups" },
  { id: "forecast", label: "Forecast", hint: "Project 7-day cash balance" },
  { id: "tax", label: "Tax", hint: "Map fee lines to HSN categories" },
  { id: "fileExceptions", label: "Exceptions", hint: "File every residual honestly" },
  { id: "closeRun", label: "Close", hint: "Terminal control — mark the run done" },
] as const;

export type PipelinePhase = "idle" | "running" | "done" | "error";

export interface PipelineLiveProps {
  phase: PipelinePhase;
  /** Index of the stage currently active while running (0-based). */
  activeIndex: number;
  /** Completed graph node ids from the server (e.g. ingest, reconcile, judge…). */
  completedNodes?: string[];
  runId?: string | null;
  aiJudgments?: number;
  matchRate?: number | null;
  error?: string | null;
}

export function PipelineLive({
  phase,
  activeIndex,
  completedNodes = [],
  runId,
  aiJudgments = 0,
  matchRate,
  error,
}: PipelineLiveProps) {
  if (phase === "idle") return null;

  const completed = new Set(completedNodes);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 font-normal">
          {phase === "running" ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : phase === "done" ? (
            <Check className="size-4 text-emerald-600" />
          ) : (
            <Minus className="size-4 text-destructive" />
          )}
          Full close pipeline
          <Badge variant="outline" className="tabular-nums">
            {phase === "running" ? "running" : phase === "done" ? "done" : "failed"}
          </Badge>
          {aiJudgments > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="size-3" />
              {aiJudgments} AI judgment{aiJudgments === 1 ? "" : "s"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {phase === "running"
            ? "CSV ingested — walking ingest → reconcile → AI judge → settle → forecast → tax → exceptions → close."
            : phase === "done"
              ? `Pipeline finished${runId ? ` · ${runId}` : ""}${
                  matchRate != null ? ` · match rate ${Math.round(matchRate * 1000) / 10}%` : ""
                }.`
              : (error ?? "Pipeline failed.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {PIPELINE_STAGES.map((stage, i) => {
            const done =
              phase === "done" ||
              completed.has(stage.id) ||
              (phase === "running" && i < activeIndex);
            const active = phase === "running" && i === activeIndex;
            return (
              <li
                key={stage.id}
                className={cn(
                  "flex gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
                  done && "border-emerald-600/30 bg-emerald-500/5",
                  active && "border-foreground/25 bg-muted/40",
                  !done && !active && "border-border bg-muted/10",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium",
                    done && "bg-emerald-600 text-white",
                    active && "bg-foreground text-background",
                    !done && !active && "bg-muted text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-3" /> : active ? <Loader2 className="size-3 animate-spin" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight">
                    {stage.label}
                    {stage.id === "judge" && (
                      <Sparkles className="ml-1 inline size-3 text-muted-foreground" />
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs leading-snug">{stage.hint}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
