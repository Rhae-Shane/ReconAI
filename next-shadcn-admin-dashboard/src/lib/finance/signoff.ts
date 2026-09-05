import type { AppRole } from "@/lib/authz";
import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

/**
 * Close sign-off (Workstream A - sign-off).
 *
 * A finance user attests that a completed close run has been reviewed and is accepted
 * for the books. The sign-off is a single JSON record per run persisted under the
 * `close:signoff:<runId>` key space via the same no-op-safe JSON helpers as the rest
 * of the close loop, so the flow keeps working (with a `null` sign-off) when Redis is
 * not configured.
 */

export interface SignOff {
  by: string;
  at: string; // ISO timestamp
  role: AppRole;
  runId: string;
}

const signOffKey = (runId: string) => redisKey("close", "signoff", runId);

/** Persist a sign-off for a run. No-op-safe: false when Redis is unconfigured/unreachable. */
export async function saveSignOff(runId: string, signOff: SignOff): Promise<boolean> {
  return jsonSet(signOffKey(runId), signOff);
}

/** Load the current sign-off for a run. No-op-safe: null when Redis is unconfigured/unreachable. */
export async function loadSignOff(runId: string): Promise<SignOff | null> {
  return jsonGet<SignOff>(signOffKey(runId));
}
