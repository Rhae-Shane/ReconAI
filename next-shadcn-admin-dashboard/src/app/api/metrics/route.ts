import { NextResponse } from "next/server";

import { MemorySaver } from "@langchain/langgraph";

import { runCloseGraph } from "@/lib/close/graph";
import { buildDataset } from "@/lib/close/store";

export const runtime = "nodejs";

/**
 * Deterministic reconciliation metrics for a completed close run. Runs the triggerless
 * LangGraph close graph in-process over the fixed seeded dataset (MemorySaver), then
 * reports the Determinism KPI: how much of the matched volume was resolved without a
 * model call, mirroring the dashboard's determinism logic.
 *
 *   matched            records resolved into a group (report.totals.matched)
 *   aiResolved         groups whose method was JUDGED (report.totals.judged)
 *   deterministicResolved = matched - aiResolved
 *   llmCallsAvoided     = deterministicResolved (each deterministic resolve skips an LLM call)
 *
 * With `?runs=a,b,c` it repeats the deterministic computation per run id and returns a
 * `byRun` series plus a rolling `window` summary (demo: reconciliation health over time,
 * derived entirely from the seeded dataset — no auth, no queue, no credentials).
 */
interface RunMetrics {
  runId: string;
  status: string;
  records: number;
  matched: number;
  deterministicResolved: number;
  aiResolved: number;
  exceptions: number;
  resolvedPct: number;
  deterministicResolvedPct: number;
  llmCallsAvoided: number;
}

async function computeMetrics(runId: string): Promise<RunMetrics> {
  const run = await runCloseGraph({
    runId,
    provider: (id) => buildDataset(id, Date.now()),
    checkpointer: new MemorySaver(),
  });

  const totals = run.report?.totals;
  const records = totals?.records ?? 0;
  const matched = totals?.matched ?? 0;
  const aiResolved = totals?.judged ?? 0;
  const exceptions = totals?.exceptions ?? 0;
  const resolvedPct = totals?.resolvedPct ?? 0;

  const deterministicResolved = matched - aiResolved;
  const deterministicResolvedPct = records ? (deterministicResolved / records) * 100 : 0;

  return {
    runId: run.runId,
    status: run.status,
    records,
    matched,
    deterministicResolved,
    aiResolved,
    exceptions,
    resolvedPct,
    deterministicResolvedPct,
    llmCallsAvoided: deterministicResolved,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runsParam = searchParams.get("runs");

  // Single-run report (the original deterministic metrics output).
  if (!runsParam) {
    const m = await computeMetrics("metrics_deterministic");
    const { runId, status, ...rest } = m;
    return NextResponse.json({ runId, status, ...rest });
  }

  // Multi-run series: ?runs=a,b,c -> per-run metrics + rolling window summary.
  const runIds = runsParam
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const byRun: RunMetrics[] = [];
  for (const runId of runIds) {
    byRun.push(await computeMetrics(runId)); // sequential to keep it deterministic & bounded
  }

  const sum = (pick: (m: RunMetrics) => number) => byRun.reduce((acc, m) => acc + pick(m), 0);
  const count = byRun.length;
  const window = {
    runs: count,
    records: sum((m) => m.records),
    matched: sum((m) => m.matched),
    deterministicResolved: sum((m) => m.deterministicResolved),
    aiResolved: sum((m) => m.aiResolved),
    exceptions: sum((m) => m.exceptions),
    llmCallsAvoided: sum((m) => m.llmCallsAvoided),
    resolvedPct: count ? sum((m) => m.resolvedPct) / count : 0,
    deterministicResolvedPct: count ? sum((m) => m.deterministicResolvedPct) / count : 0,
  };

  return NextResponse.json({
    demo: true,
    byRun,
    totals: window,
    window,
  });
}
