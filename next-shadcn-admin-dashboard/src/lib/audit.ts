import { jsonGet, jsonSet } from "@/lib/ops/redis";

/**
 * Immutable action-audit log (Workstream B).
 *
 * Appends a JSON record of every authorized state-changing action under the Redis key
 * `close:audit`, newest-first, capped to the latest `MAX_AUDIT` entries so the key never
 * grows unbounded. The log is append-only at the app layer — nothing here mutates or deletes
 * an existing entry — and every accessor is no-op-safe: when no Redis is configured,
 * `recordAudit` returns `false` and `listAudit` returns `[]`, so the rest of the app keeps
 * working locally and in CI without any infra.
 */

const AUDIT_KEY = "close:audit";
/** Hard cap on retained entries (older entries are dropped, oldest first). */
const MAX_AUDIT = 2000;

export interface ActionAudit {
  id: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  detail?: string;
  at: string;
}

/**
 * Append a single audit entry, newest-first. `id` and `at` are stamped here. Never throws —
 * returns `false` when Redis is unconfigured or the write fails, `true` on success.
 */
export async function recordAudit(entry: Omit<ActionAudit, "id" | "at">): Promise<boolean> {
  try {
    const at = new Date().toISOString();
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const full: ActionAudit = { ...entry, id, at };

    const existing = (await jsonGet<ActionAudit[]>(AUDIT_KEY)) ?? [];
    existing.unshift(full); // newest-first
    const trimmed = existing.slice(0, MAX_AUDIT);

    return await jsonSet(AUDIT_KEY, trimmed);
  } catch {
    return false;
  }
}

/** List the latest audit entries, newest-first (default 200, `[]` when Redis is unconfigured). */
export async function listAudit(limit = 200): Promise<ActionAudit[]> {
  try {
    const entries = (await jsonGet<ActionAudit[]>(AUDIT_KEY)) ?? [];
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}
