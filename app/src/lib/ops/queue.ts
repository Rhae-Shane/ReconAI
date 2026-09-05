import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

import { getRedisCheckpointer, runCloseGraph } from "@/lib/close/graph";
import { saveRun } from "@/lib/close/run-store";
import { datasetFromRecords, persistCloseArtifacts, putRunState } from "@/lib/close/store";
import { emitEvent } from "@/lib/events";
import { failedRunThresholdAlert, recordAlert } from "@/lib/ops/alerts";
import { listFailedRuns, recordFailedRun } from "@/lib/ops/dlq";
import { collectRazorpayRecords } from "@/lib/razorpay/sync";

import { tlsRedisUrl } from "./redis";

/**
 * BullMQ queue + worker for durable close-run execution (backed by the configured Redis).
 *
 * The queue is OFF unless `REDIS_URL` is set (the ioredis/TCP endpoint Upstash publishes).
 * When off, `isQueueEnabled()` is false and callers run closes synchronously in-process; when on,
 * `enqueueCloseRun` adds a `close-run` job consumed by `npm run worker`.
 *
 * A job runs the LangGraph close graph (see `close/graph.ts`) against the engine's deterministic
 * dataset, pushes BullMQ progress 0→100 as the stages complete, and persists the finished meta +
 * report to Redis through `run-store`.
 */

export const CLOSE_QUEUE_NAME = "close-runs";
export const CLOSE_JOB_NAME = "close-run";

export interface CloseRunJobData {
  runId: string;
  startedAt: number;
}

let queue: Queue | null | undefined;
let connection: IORedis | null | undefined;

export function isQueueEnabled(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** Lazily-created, module-scoped ioredis connection shared by the Queue and the Worker. */
export function getConnection(): IORedis {
  if (!connection) {
    const url = process.env.REDIS_URL ? tlsRedisUrl(process.env.REDIS_URL) : "redis://localhost:6379";
    connection = new IORedis(url, { maxRetriesPerRequest: null });
  }
  return connection;
}

/** Lazily-reused queue bound to the configured Redis connection. */
export function getCloseQueue(): Queue | null {
  if (!isQueueEnabled()) return null;
  if (queue) return queue;
  queue = new Queue(CLOSE_QUEUE_NAME, { connection: getConnection() });
  return queue;
}

/** Enqueue a close-run job. Returns false when the queue is disabled. */
export async function enqueueCloseRun(runId: string, startedAt = Date.now()): Promise<boolean> {
  const q = getCloseQueue();
  if (!q) return false;
  await q.add(CLOSE_JOB_NAME, { runId, startedAt } satisfies CloseRunJobData, {
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
  return true;
}

/** Milliseconds from now until `iso`, clamped to >= 0. Used for BullMQ delayed jobs. */
export function msUntil(iso: string): number {
  return Math.max(0, new Date(iso).getTime() - Date.now());
}

/**
 * Schedule a close-run to fire later as a BullMQ *delayed* job (BullMQ supports `delay` ms natively -
 * no cron library needed). The run still runs through the same `close-run` worker when its delay
 * elapses.
 *
 * Returns `{ scheduled, at }`. When the queue is disabled (no `REDIS_URL`) nothing is enqueued and
 * `scheduled` is false - the caller decides how to degrade.
 */
export async function scheduleCloseRun(runId: string, runAtIso: string): Promise<{ scheduled: boolean; at: string }> {
  const q = getCloseQueue();
  if (!q) return { scheduled: false, at: runAtIso };
  const delay = msUntil(runAtIso);
  await q.add(CLOSE_JOB_NAME, { runId, startedAt: Date.now() + delay } satisfies CloseRunJobData, {
    delay,
    removeOnComplete: 100,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
  return { scheduled: true, at: runAtIso };
}

/** Execute one close-run job: run the graph, persist, and report BullMQ progress. */
export async function processRunJob(
  runId: string,
  reportProgress?: (pct: number) => void,
): Promise<{
  runId: string;
  status: string;
  reportResolved: boolean;
  openExceptions: number;
  revisions: number;
}> {
  const startedMs = Date.now();
  // Prefer live Razorpay pull when keys work; otherwise fall back to the deterministic
  // seed so CI / local demo / missing credentials still resolve headlessly.
  const { buildDataset } = await import("@/lib/close/store");
  let dataset;
  if (process.env.CLOSE_DEMO_SEED === "force") {
    dataset = buildDataset(runId, startedMs);
  } else {
    const collected = await collectRazorpayRecords();
    dataset =
      "error" in collected || collected.records.length === 0
        ? buildDataset(runId, startedMs)
        : datasetFromRecords(runId, collected.records, startedMs);
  }
  putRunState(runId, dataset, startedMs, startedMs);
  const provider = () => dataset;
  const startedAt = new Date(startedMs).toISOString();

  const step = (pct: number) => {
    reportProgress?.(pct);
  };

  step(5);
  const run = await runCloseGraph({ runId, provider, checkpointer: await getRedisCheckpointer() });
  step(70);

  const finishedAt = run.status === "DONE" ? new Date().toISOString() : undefined;
  const saved = await saveRun(runId, {
    status: run.status,
    startedAt,
    finishedAt,
    dataset,
    report: run.report,
  });
  putRunState(runId, dataset, new Date(startedAt).getTime(), finishedAt ? new Date(finishedAt).getTime() : Date.now());
  await persistCloseArtifacts(runId, run.report);
  step(saved ? 95 : 100);

  const reportResolved = run.status === "DONE" && run.report !== null;
  const result = {
    runId,
    status: run.status,
    reportResolved,
    openExceptions: run.openExceptions,
    revisions: run.revisions,
  };
  if (run.status === "DONE") {
    await emitEvent({
      type: "close.completed",
      runId,
      detail: {
        status: run.status,
        reportResolved,
        openExceptions: run.openExceptions,
        revisions: run.revisions,
      },
    });
    if (run.openExceptions > 0) {
      try {
        const { sendExceptionDigest } = await import("@/lib/ops/digest");
        await sendExceptionDigest(runId, dataset.exceptions);
      } catch {
        // digest is best-effort
      }
    }
  } else {
    await emitEvent({
      type: "close.failed",
      runId,
      detail: { status: run.status, openExceptions: run.openExceptions },
    });
  }
  return result;
}

/** Start a long-lived worker for close-run jobs. */
export function startCloseWorker(): Worker {
  const worker = new Worker<CloseRunJobData>(
    CLOSE_QUEUE_NAME,
    async (job) => processRunJob(job.data.runId, (pct) => job.updateProgress(pct)),
    { connection: getConnection() },
  );

  worker.on("completed", (job) => {
    console.log(`[worker] close-run ${job.data.runId} completed (${job.returnvalue?.status})`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[worker] close-run ${job?.data?.runId} failed:`, err.message);
    const _reason = err?.message ?? String(err);
    recordFailedRun({
      runId: job?.data?.runId ?? "unknown",
      failedAt: new Date().toISOString(),
      reason: err?.message ?? String(err),
      attempts: job?.attemptsMade ?? 0,
    })
      .then(async (recorded) => {
        // Threshold alert: surface a critical alert when the dead-letter queue grows past 5. This is
        // fire-and-forget with a catch so it can never break the worker, even if Redis is down.
        if (!recorded) return;
        const failed = await listFailedRuns();
        const alert = failedRunThresholdAlert(failed.length, 5);
        if (alert) await recordAlert({ ...alert, runId: job?.data?.runId });
      })
      .catch(() => {
        // An alert ledger write must never break the worker; swallow any failure.
      });
  });
  worker.on("error", (err) => {
    // Surface unhandled worker-level errors (connection drops, retry scheduling, etc.).
    console.error("[worker] close-run worker error:", err);
  });

  return worker;
}
