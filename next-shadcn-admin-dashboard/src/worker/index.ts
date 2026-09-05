/**
 * Long-lived BullMQ worker entrypoint: `npm run worker`.
 *
 * Consumes `close-run` jobs from the configured Redis queue, runs each through the LangGraph
 * close graph, and persists finished runs to Redis. Requires `REDIS_URL` to be set (Upstash's
 * ioredis/TCP endpoint). Gracefully shuts down on SIGINT/SIGTERM.
 */
import { createLogger } from "@/lib/obs/logger";
import { enqueueCloseRun, isQueueEnabled, startCloseWorker } from "@/lib/ops/queue";

const log = createLogger({ name: "worker" });

if (!isQueueEnabled()) {
  log.error("[worker] REDIS_URL is not set — the queue is disabled. Set REDIS_URL (Upstash URI) and retry.");
  process.exit(1);
}

// Optional startup auto-close: when CLOSE_SCHEDULE_CRON names a stable close-run id, enqueue it
// once on boot so a scheduled close fires through the normal worker pipeline. Clearly optional -
// a strict no-op when the env var is absent, and it uses no cron dependency (callers that want a
// recurring cadence can restart / re-enqueue on their own schedule).
const autoRunId = process.env.CLOSE_SCHEDULE_CRON?.trim();
if (autoRunId) {
  enqueueCloseRun(autoRunId)
    .then((queued) => {
      log.info(
        queued
          ? `[worker] auto-enqueued scheduled close-run ${autoRunId}`
          : `[worker] auto-schedule skipped for ${autoRunId}`,
      );
    })
    .catch((err) => {
      log.error(`[worker] auto-schedule failed for ${autoRunId}:`, err);
    });
}

const worker = startCloseWorker();
log.info("[worker] listening for close-run jobs…");

function shutdown(signal: string) {
  log.info(`[worker] ${signal} received, shutting down…`);
  worker
    .close()
    .then(() => {
      log.info("[worker] closed cleanly.");
      process.exit(0);
    })
    .catch((err) => {
      log.error("[worker] error during shutdown:", err);
      process.exit(1);
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
