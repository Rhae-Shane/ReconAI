import { isRedisConfigured, jsonDel, jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

import type { Dataset } from "./store";
import type { CloseReport } from "./types";

/**
 * Durable run persistence over Redis (Upstash).
 *
 * When Redis is configured, the BullMQ worker writes each executed run's meta, dataset and report
 * here under the `close:*` key space. The API layer can then read completed runs from Redis across
 * processes (worker ↔ serverless). When Redis is NOT configured every accessor returns `null`
 * (or `false`), so callers fall back to the in-memory demo store without special-casing.
 */

export interface PersistedRunMeta {
  runId: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
}

export const RUN_KEY = (runId: string) => redisKey("close", "run", runId);
export const REPORT_KEY = (runId: string) => redisKey("close", "report", runId);
/** Index of every persisted run, newest-first, used to list runs without N key probes. */
const RUN_LIST_KEY = redisKey("close", "runs");

export async function saveRun(
  runId: string,
  data: { status: string; startedAt: string; finishedAt?: string; dataset?: Dataset; report?: CloseReport | null },
): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  const meta: PersistedRunMeta = { runId, status: data.status, startedAt: data.startedAt, finishedAt: data.finishedAt };
  await jsonSet(RUN_KEY(runId), meta);
  if (data.dataset) await jsonSet(RUN_KEY(`${runId}:dataset`), data.dataset);
  await jsonSet(REPORT_KEY(runId), data.report ?? null);
  await upsertRunList(meta);
  return true;
}

/**
 * Upsert `meta` into the run-list index, de-duplicated by runId and sorted newest first (by
 * `startedAt`). On a Redis miss (first write) it starts from an empty list.
 */
async function upsertRunList(meta: PersistedRunMeta): Promise<void> {
  const existing = await jsonGet<PersistedRunMeta[]>(RUN_LIST_KEY);
  const list = existing ?? [];
  const without = list.filter((m) => m.runId !== meta.runId);
  without.push(meta);
  without.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  await jsonSet(RUN_LIST_KEY, without);
}

/** List all persisted run metas from the index, newest first. Empty when Redis is unconfigured/unreachable. */
export async function loadAllRuns(): Promise<PersistedRunMeta[]> {
  if (!isRedisConfigured()) return [];
  const list = await jsonGet<PersistedRunMeta[]>(RUN_LIST_KEY);
  return (list ?? []).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

export async function loadRunMeta(runId: string): Promise<PersistedRunMeta | null> {
  if (!isRedisConfigured()) return null;
  return jsonGet<PersistedRunMeta>(RUN_KEY(runId));
}

export async function loadDataset(runId: string): Promise<Dataset | null> {
  if (!isRedisConfigured()) return null;
  return jsonGet<Dataset>(RUN_KEY(`${runId}:dataset`));
}

export async function loadReport(runId: string): Promise<CloseReport | null> {
  if (!isRedisConfigured()) return null;
  return jsonGet<CloseReport>(REPORT_KEY(runId));
}

export async function deleteRun(runId: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  await jsonDel(RUN_KEY(runId));
  await jsonDel(RUN_KEY(`${runId}:dataset`));
  await jsonDel(REPORT_KEY(runId));
  const list = (await jsonGet<PersistedRunMeta[]>(RUN_LIST_KEY)) ?? [];
  await jsonSet(
    RUN_LIST_KEY,
    list.filter((m) => m.runId !== runId),
  );
  return true;
}
