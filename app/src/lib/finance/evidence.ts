import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

/**
 * Evidence attachments for exception review (Tranch 4.3).
 *
 * Evidence is a lightweight reference (a URL / doc-id / UTR trace), not an uploaded
 * file — no multipart plumbing, no storage of binary content. References are stored
 * under the `close:evidence:<exceptionId>` key space via the same no-op-safe JSON
 * helpers as the rest of the close loop, so the whole flow keeps working (with an
 * empty list) when Redis is not configured.
 */

export interface EvidenceRef {
  id: string;
  exceptionId: string;
  label: string;
  ref: string;
  note?: string;
  createdAt: string;
}

const evidenceKey = (exceptionId: string) => redisKey("close", "evidence", exceptionId);

/** Append one evidence reference for an exception. No-op-safe: false when Redis is unconfigured. */
export async function saveEvidenceRef(ev: Omit<EvidenceRef, "id" | "createdAt">): Promise<boolean> {
  const existing = (await jsonGet<EvidenceRef[]>(evidenceKey(ev.exceptionId))) ?? [];
  const ref: EvidenceRef = {
    ...ev,
    id: `ev-${Date.now()}-${existing.length}`,
    createdAt: new Date().toISOString(),
  };
  return jsonSet(evidenceKey(ev.exceptionId), [...existing, ref]);
}

/** List evidence references for an exception. No-op-safe: [] when Redis is unconfigured. */
export async function listEvidenceRefs(exceptionId: string): Promise<EvidenceRef[]> {
  return (await jsonGet<EvidenceRef[]>(evidenceKey(exceptionId))) ?? [];
}
