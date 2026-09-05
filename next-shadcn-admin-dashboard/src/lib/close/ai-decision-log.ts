import type { AiDecisionProvenance } from "./types";

/**
 * In-memory ring buffer of AI residual-judge provenance records.
 * Survives for the process lifetime; used when MatchGroup wiring is not yet
 * available (demo store / agent tools). Newest-first.
 */

const MAX_DECISIONS = 500;

export interface LoggedAiDecision extends AiDecisionProvenance {
  runId?: string;
  recordIds?: string[];
  matchType?: "AI_RESOLVED" | "FUZZY" | "UNRESOLVED";
}

const buffer: LoggedAiDecision[] = [];

/** Append a provenance record (newest first). Returns the logged entry. */
export function recordAiDecision(
  provenance: AiDecisionProvenance,
  meta?: { runId?: string; recordIds?: string[]; matchType?: LoggedAiDecision["matchType"] },
): LoggedAiDecision {
  const entry: LoggedAiDecision = {
    ...provenance,
    runId: meta?.runId,
    recordIds: meta?.recordIds,
    matchType: meta?.matchType,
  };
  buffer.unshift(entry);
  if (buffer.length > MAX_DECISIONS) buffer.length = MAX_DECISIONS;
  return entry;
}

/** List recent AI decisions, newest-first. Optional runId filter. */
export function listAiDecisions(opts?: { limit?: number; runId?: string }): LoggedAiDecision[] {
  const limit = opts?.limit ?? 100;
  const filtered = opts?.runId ? buffer.filter((d) => d.runId === opts.runId) : buffer;
  return filtered.slice(0, limit);
}

/** Lookup by decisionId. */
export function getAiDecision(decisionId: string): LoggedAiDecision | undefined {
  return buffer.find((d) => d.decisionId === decisionId);
}

/** Test helper — clear the ring buffer. */
export function clearAiDecisions(): void {
  buffer.length = 0;
}
