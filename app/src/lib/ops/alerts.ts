import { emitEvent } from "@/lib/events";
import { isRedisConfigured, jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

/**
 * Lightweight operational alert ledger (Upstash Redis).
 *
 * Records threshold / health alerts raised by the close loop (e.g. a run that keeps failing) under
 * the `close:alerts` list so operators can see them surfaced in the cockpit. Like the rest of the
 * Redis layer it is no-op-safe: when Redis is unconfigured `recordAlert` returns `false` and
 * `listAlerts` returns `[]`, so the worker and UI keep working locally and in CI without special
 * casing or any real credential.
 */

export interface OpsAlert {
  id: string;
  level: "info" | "warn" | "critical";
  kind: string;
  message: string;
  createdAt: string;
  runId?: string;
}

/** Cap on how many alerts to retain, newest first. */
const MAX_ALERTS = 100;

const ALERTS_LIST_KEY = redisKey("close", "alerts");

/** Record an alert. Returns false when Redis is unconfigured or the write fails. */
export async function recordAlert(alert: Omit<OpsAlert, "id" | "createdAt">): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  const entry: OpsAlert = {
    ...alert,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  try {
    const list = await jsonGet<OpsAlert[]>(ALERTS_LIST_KEY);
    const next = [entry, ...(list ?? [])].slice(0, MAX_ALERTS);
    const written = await jsonSet(ALERTS_LIST_KEY, next);
    // Surface the alert to the event bus so finance gets notified. Fire-and-forget; never throws.
    if (written) {
      emitEvent({ type: "alert", detail: { kind: entry.kind, message: entry.message, level: entry.level } }).catch(
        () => {
          // Event emission must never break the alert ledger; swallow any failure.
        },
      );
    }
    return written;
  } catch {
    // A ledger write must never break the caller; treat failures as "not recorded".
    return false;
  }
}

/** List all recorded alerts, newest first. Empty when Redis is unconfigured/unreachable. */
export async function listAlerts(): Promise<OpsAlert[]> {
  if (!isRedisConfigured()) return [];
  const list = await jsonGet<OpsAlert[]>(ALERTS_LIST_KEY);
  return (list ?? []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Returns a CRITICAL operator alert when `failedCount` breaches `threshold`, else null.
 * The returned alert carries a fresh id/createdAt; `recordAlert` re-derives them anyway.
 */
export function failedRunThresholdAlert(failedCount: number, threshold: number): OpsAlert | null {
  if (failedCount < threshold) return null;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    level: "critical",
    kind: "failed-run-threshold",
    message: `Close runs: ${failedCount} failed run(s) in the dead-letter queue (threshold ${threshold}). Review and retry.`,
  };
}
