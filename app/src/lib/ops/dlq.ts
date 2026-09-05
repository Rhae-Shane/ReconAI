import { isRedisConfigured, jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

/**
 * Dead-letter store for failed close-runs (Upstash Redis).
 *
 * When the BullMQ worker's `failed` handler fires, `recordFailedRun` records the run's id, failure
 * time, reason and attempt count here under the `close:failed` key space so operators can see what
 * failed and why. When Redis is NOT configured every accessor returns `false`/`[]` (no-op-safe), so
 * the worker and API keep working locally and in CI without special-casing.
 */

export interface FailedRun {
  runId: string;
  failedAt: string;
  reason: string;
  attempts: number;
}

/** Cap on how many failed runs to retain, newest first. */
const MAX_FAILED_RUNS = 100;

const FAILED_RUN_LIST_KEY = redisKey("close", "failed");

/** Record a failed close-run. Returns false when Redis is unconfigured or the write fails. */
export async function recordFailedRun(run: FailedRun): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  const list = await jsonGet<FailedRun[]>(FAILED_RUN_LIST_KEY);
  const without = (list ?? []).filter((f) => f.runId !== run.runId);
  without.push(run);
  without.sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());
  await jsonSet(FAILED_RUN_LIST_KEY, without.slice(0, MAX_FAILED_RUNS));
  return true;
}

/** List all recorded failed runs, newest first. Empty when Redis is unconfigured/unreachable. */
export async function listFailedRuns(): Promise<FailedRun[]> {
  if (!isRedisConfigured()) return [];
  const list = await jsonGet<FailedRun[]>(FAILED_RUN_LIST_KEY);
  return (list ?? []).sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());
}
