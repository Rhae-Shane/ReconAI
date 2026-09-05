import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

/**
 * Shared low-level storage for the GL ledger + fiscal periods (Workstream W2-C).
 *
 * Both `ledger.ts` and `periods.ts` need to read each other's records (posting refuses closed
 * periods; closing refuses open postings). Rather than import each other - which would form an
 * import cycle - they both depend on this thin, dependency-free store that owns the two Redis keys
 * and their read/write helpers. Every accessor is no-op-safe via the standard JSON helpers: with
 * Redis unconfigured reads return `[]` and writes return `false`, so the modules degrade to an
 * empty, open, always-balanced state instead of crashing.
 */

export const PERIODS_KEY = redisKey("close", "periods");
export const LEDGER_KEY = redisKey("close", "ledger");

/** Read the full list stored at `key` (defaults to `[]` when empty/unconfigured). */
export async function readStore<T>(key: string): Promise<T[]> {
  return (await jsonGet<T[]>(key)) ?? [];
}

/** Overwrite the full list at `key` with `value`. Returns false when Redis is unconfigured. */
export async function writeStore<T>(key: string, value: T[]): Promise<boolean> {
  return jsonSet(key, value);
}
