import { Annotation, END, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph-checkpoint";

import { createLogger } from "@/lib/obs/logger";
import { tlsRedisUrl } from "@/lib/ops/redis";

import { RedisJsonSaver } from "./redis-checkpointer";
import type {
  AuditEvent,
  CloseReport,
  ExceptionRecord,
  FinRecord,
  Flap,
  ForecastDatum,
  MatchGroup,
  Settlement,
  TaxLineMatch,
} from "./types";

/**
 * LangGraph orchestrator for the close run.
 *
 * The finance MATH stays in the engine (store / harness) — these nodes are the
 * *workflow/state machine*: they declare the stage order, drive the bounded
 * exception-revision loop, and enforce the honest CLOSE control. A run's data is
 * produced once by the injected `provider(runId, startedAtMs)` and each node
 * commits its stage slice of that dataset to state, appending audit events along
 * the way. Nothing here re-derives a match or an amount — numbers are engine-computed.
 *
 *    ingest → reconcile → judge → settle → forecast → tax → fileExceptions → closeRun
 *
 * `closeRun` is a TERMINAL control: it will not mark the run DONE while exceptions
 * remain OPEN — unless `MAX_REVISIONS` revision passes are exhausted, in which case
 * it finalizes a report that STILL surfaces every open exception (never hidden).
 * That is the honesty moment, expressed as graph semantics.
 */

/** A dataset produced by the engine (shape of `buildDataset` in store.ts). */
export interface CloseDataset {
  records: FinRecord[];
  groups: MatchGroup[];
  flaps: Flap[];
  exceptions: ExceptionRecord[];
  settlements: Settlement[];
  forecast: ForecastDatum[];
  taxMatches: TaxLineMatch[];
  audit: AuditEvent[];
  sources: Array<{ source: string; records: number; matched: number; matchRate: number }>;
  totals: { records: number; matched: number; exceptions: number; resolvedPct: number; groups: number; judged: number };
  groundedRecords: number;
}

/** Inject engine access so the graph is testable without the store. */
export type DatasetProvider = (runId: string, startedAtMs?: number) => CloseDataset;

export const MAX_REVISIONS = 3;

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const CloseState = Annotation.Root({
  runId: Annotation<string>({ reducer: (a, b) => b ?? a, default: () => "" }),
  status: Annotation<string>({ reducer: (a, b) => b ?? a, default: () => "RUNNING" }),
  records: Annotation<FinRecord[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  groups: Annotation<MatchGroup[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  flaps: Annotation<Flap[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  settlements: Annotation<Settlement[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  forecast: Annotation<ForecastDatum[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  taxMatches: Annotation<TaxLineMatch[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  audit: Annotation<AuditEvent[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  exceptions: Annotation<ExceptionRecord[]>({ reducer: (a, b) => b ?? a, default: () => [] }),
  revisions: Annotation<number>({ reducer: (a, b) => (a ?? 0) + (b ?? 0), default: () => 0 }),
  report: Annotation<CloseReport | null>({ reducer: (a, b) => b ?? a, default: () => null }),
});

type S = typeof CloseState.State;

function makeAudit(runId: string, action: AuditEvent["action"], detail?: Record<string, unknown>): AuditEvent {
  return {
    id: `audit_${action}_${Date.now()}`,
    runId,
    actorType: "AGENT",
    actorId: "ops-graph",
    action,
    detail,
    createdAt: new Date().toISOString(),
  };
}

const openExceptionCount = (s: S) => s.exceptions.filter((e) => e.status === "OPEN").length;

/* ------------------------------------------------------------------ */
/* Nodes — engine-fed stage commits                                    */
/* ------------------------------------------------------------------ */

interface NodeFns {
  ingest(s: S): Partial<S>;
  reconcile(s: S): Partial<S>;
  judge(s: S): Partial<S>;
  settle(s: S): Partial<S>;
  forecast(s: S): Partial<S>;
  tax(s: S): Partial<S>;
  fileExceptions(s: S): Partial<S>;
  closeRun(s: S): Partial<S>;
}

function buildNodeFns(provider: DatasetProvider, runId: string): NodeFns {
  const ds = () => provider(runId);
  return {
    ingest: () => ({ status: "INGESTING", records: ds().records, audit: [makeAudit(runId, "INGEST")] }),
    reconcile: () => ({
      status: "RECONCILING",
      groups: ds().groups,
      audit: [makeAudit(runId, "MATCH", { groups: ds().groups.length })],
    }),
    // A revision pass: an "agent/reviewer" promotes candidate-bearing exceptions out of
    // OPEN. NO_KEY/DUPLICATE orphans can never resolve — they stay OPEN, and that is the
    // point: closeRun surfaces them, it never hides them.
    judge: (s) => ({
      status: "JUDGING",
      flaps: ds().flaps,
      exceptions: s.exceptions.map((e) =>
        e.status === "OPEN" && e.candidateIds.length > 0 ? { ...e, status: "REVIEWED" as const } : e,
      ),
      audit: [makeAudit(runId, "JUDGE")],
    }),
    settle: () => ({ status: "SETTLING", settlements: ds().settlements, audit: [makeAudit(runId, "SETTLE")] }),
    forecast: () => ({ status: "FORECASTING", forecast: ds().forecast, audit: [makeAudit(runId, "FORECAST")] }),
    tax: () => ({ status: "TAXING", taxMatches: ds().taxMatches, audit: [makeAudit(runId, "TAX")] }),
    // File the exceptions only once. On revision passes the ledger already holds them (with any
    // REVIEWED promotions from `judge`), so re-asserting the raw dataset would clobber the loop's
    // progress and make the revision loop unwind forever.
    fileExceptions: (s) =>
      s.exceptions.length > 0
        ? { status: "FILING_EXCEPTIONS", audit: [makeAudit(runId, "EXCEPTION", { preserved: s.exceptions.length })] }
        : {
            status: "FILING_EXCEPTIONS",
            exceptions: ds().exceptions,
            audit: [makeAudit(runId, "EXCEPTION", { count: ds().exceptions.length })],
          },
    closeRun: (s) => {
      const open = openExceptionCount(s);
      const exhausted = s.revisions >= MAX_REVISIONS;
      // Honesty control: don't mark DONE while exceptions are OPEN unless we exhausted
      // every revision pass — then finalize WITH the exceptions visible.
      const canClose = open === 0 || exhausted;
      return {
        status: canClose ? "DONE" : "OPEN_EXCEPTIONS",
        report: canClose ? buildReport(s) : null,
        audit: [makeAudit(runId, "CLOSE", { openExceptions: open, revisions: s.revisions, finalized: canClose })],
      };
    },
  };
}

function routeAfterClose(s: S): typeof END | "judge" {
  if (openExceptionCount(s) > 0 && s.revisions < MAX_REVISIONS) return "judge";
  return END;
}

function buildReport(s: S): CloseReport {
  const groups = s.groups;
  const matched = new Set(groups.flatMap((g) => g.links.map((l) => l.recordId))).size;
  const total = s.records.length;
  const perSource = [...new Set(s.records.map((r) => r.source))].map((source) => {
    const recs = s.records.filter((r) => r.source === source);
    const m = recs.filter((r) => groups.some((g) => g.links.some((l) => l.recordId === r.id))).length;
    return {
      source,
      sourceName: source,
      records: recs.length,
      matched: m,
      matchRate: recs.length ? m / recs.length : 0,
    };
  });
  // Explicit outcome categories (matched / partial / unresolved) + per-record detail.
  const open = s.exceptions.filter((e) => e.status === "OPEN");
  const partial = open.filter((e) => e.reasonCode === "PARTIAL_FLAP" || e.reasonCode === "LOW_CONFIDENCE").length;
  const recordById = new Map(s.records.map((r) => [r.id, r]));
  const unresolved = open.map((e) => {
    const rec = e.recordId ? recordById.get(e.recordId) : undefined;
    const expectedPaise =
      rec?.amountPaise ?? (typeof e.recordJson?.amountPaise === "number" ? e.recordJson.amountPaise : 0);
    const actualPaise = typeof e.actualPaise === "number" ? e.actualPaise : 0;
    return {
      recordId: e.recordId ?? `unresolved_${e.id}`,
      ref: String(e.recordJson?.sourceRef ?? e.recordJson?.ref ?? e.recordId ?? e.id),
      expectedPaise,
      actualPaise,
      differencePaise: expectedPaise - actualPaise,
      reason: e.reasonCode,
      confidence: e.confidence ?? 0.5,
      status: "NEEDS_REVIEW" as const,
    };
  });
  return {
    runId: s.runId,
    generatedAt: new Date().toISOString(),
    totals: {
      records: total,
      matched,
      exceptions: s.exceptions.length,
      resolvedPct: total ? (matched / total) * 100 : 0,
      groups: groups.length,
      judged: groups.filter((g) => g.method === "JUDGED").length,
    },
    breakdown: {
      records: total,
      matched,
      partial,
      unresolved: open.length,
      matchRate: total ? matched / total : 0,
    },
    unresolved,
    perSource,
    confidenceBins: [],
    exceptions: s.exceptions,
    groundedRecords: groups.length,
  };
}

/* ------------------------------------------------------------------ */
/* Checkpointer (Redis when configured, else in-memory)                */
/* ------------------------------------------------------------------ */

/** In-memory checkpointer — the synchronous, dependency-free default. */
export function makeCheckpointer(): MemorySaver {
  return new MemorySaver();
}

function redisExposesRediSearch(url: string): boolean {
  try {
    const host = new URL(url.replace(/^rediss?:/i, "https:")).hostname.toLowerCase();
    return !host.endsWith("upstash.io");
  } catch {
    return !url.toLowerCase().includes("upstash.io");
  }
}

/** Durable Redis checkpointer. Upstash (no RediSearch) uses JSON GET/SET; Redis Stack uses RedisSaver. */
export async function getRedisCheckpointer(): Promise<BaseCheckpointSaver> {
  const url = process.env.REDIS_URL;
  if (!url) return new MemorySaver();
  if (!redisExposesRediSearch(url)) return RedisJsonSaver.fromUrl(url);
  try {
    const { RedisSaver } = await import("@langchain/langgraph-checkpoint-redis");
    return await RedisSaver.fromUrl(tlsRedisUrl(url));
  } catch (err) {
    console.warn("[close-graph] RedisSaver unavailable, using Redis JSON checkpointer", err);
    return RedisJsonSaver.fromUrl(url);
  }
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

export interface CloseGraphRun {
  runId: string;
  status: string;
  report: CloseReport | null;
  revisions: number;
  openExceptions: number;
  nodeOrder: string[];
}

export async function runCloseGraph(opts: {
  runId: string;
  provider: DatasetProvider;
  checkpointer?: BaseCheckpointSaver | Promise<BaseCheckpointSaver> | undefined;
}): Promise<CloseGraphRun> {
  const { runId, provider } = opts;
  const checkpointer = (await opts.checkpointer) ?? new MemorySaver();
  const log = createLogger({ name: "close-graph" }).child({ runId });
  const fns = buildNodeFns(provider, runId);
  const nodeOrder: string[] = [];
  const track = (name: keyof NodeFns | "closeRun", fn: (s: S) => Partial<S>) => (s: S) => {
    nodeOrder.push(name);
    log.info("close-graph:stage", { stage: name });
    return fn(s);
  };

  const graph = new StateGraph(CloseState);
  graph
    .addNode("ingest", track("ingest", fns.ingest))
    .addNode("reconcile", track("reconcile", fns.reconcile))
    .addNode(
      "judge",
      track("judge", (s) => ({ ...fns.judge(s), revisions: openExceptionCount(s) > 0 ? 1 : 0 })),
    )
    .addNode("settle", track("settle", fns.settle))
    .addNode("forecastCash", track("forecast", fns.forecast))
    .addNode("tax", track("tax", fns.tax))
    .addNode("fileExceptions", track("fileExceptions", fns.fileExceptions))
    .addNode("closeRun", track("closeRun", fns.closeRun))
    .addEdge(START, "ingest")
    .addEdge("ingest", "reconcile")
    .addEdge("reconcile", "judge")
    .addEdge("judge", "settle")
    .addEdge("settle", "forecastCash")
    .addEdge("forecastCash", "tax")
    .addEdge("tax", "fileExceptions")
    .addEdge("fileExceptions", "closeRun")
    .addConditionalEdges("closeRun", routeAfterClose, { judge: "judge", [END]: END });

  const compiled = graph.compile({ checkpointer });
  log.info("close-graph:start");
  const final = await compiled.invoke(
    {
      runId,
      status: "RUNNING",
      records: [],
      groups: [],
      flaps: [],
      settlements: [],
      forecast: [],
      taxMatches: [],
      audit: [],
      exceptions: [],
      revisions: 0,
      report: null,
    },
    // The exception-revision loop is bounded by MAX_REVISIONS but each pass visits ~6 nodes, so a
    // few revisions exceed the default recursion cap; raise it for the bounded loop.
    { recursionLimit: 250, configurable: { thread_id: runId } },
  );

  log.info("close-graph:done", {
    status: final.status,
    revisions: final.revisions,
    openExceptions: openExceptionCount(final),
  });

  return {
    runId,
    status: final.status,
    report: final.report,
    revisions: final.revisions,
    openExceptions: openExceptionCount(final),
    nodeOrder,
  };
}
