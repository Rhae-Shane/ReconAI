import { createHash, randomUUID } from "node:crypto";

import { DEFAULT_FINANCE_CONFIG } from "./config";
import type { AiDecisionProvenance, JudgeCandidacy } from "./types";

/** Prompt / system-instruction version stamped on every model-backed residual decision. */
export const RECONCILIATION_PROMPT_VERSION = "reconciliation-v3";

/**
 * Stable JSON for hashing: recursively sort object keys so the same logical
 * candidacy always yields the same sha256 regardless of insertion order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    out[key] = canonicalize(obj[key]);
  }
  return out;
}

/** sha256 hex of the candidacy payload (stable key order). */
export function hashCandidacyInput(candidacy: JudgeCandidacy | Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(candidacy), "utf8").digest("hex");
}

export interface BuildProvenanceArgs {
  model: string;
  candidacy: JudgeCandidacy | Record<string, unknown>;
  confidence: number;
  reason: string;
  matchedSourceIds: string[];
  matchedRef?: string;
  promptVersion?: string;
  resolveThreshold?: number;
  /** Injected for tests; defaults to now. */
  timestamp?: string;
  /** Injected for tests; defaults to randomUUID(). */
  decisionId?: string;
}

/** Build an {@link AiDecisionProvenance} record for a successful model judgment. */
export function buildAiDecisionProvenance(args: BuildProvenanceArgs): AiDecisionProvenance {
  const threshold = args.resolveThreshold ?? DEFAULT_FINANCE_CONFIG.resolveThreshold;
  const output = stableStringify({
    confidence: args.confidence,
    reason: args.reason,
    matchedSourceIds: args.matchedSourceIds,
    ...(args.matchedRef !== undefined ? { matchedRef: args.matchedRef } : {}),
  });
  return {
    decisionId: args.decisionId ?? randomUUID(),
    model: args.model,
    promptVersion: args.promptVersion ?? RECONCILIATION_PROMPT_VERSION,
    inputHash: hashCandidacyInput(args.candidacy),
    output,
    confidence: args.confidence,
    timestamp: args.timestamp ?? new Date().toISOString(),
    humanReviewRequired: args.confidence < threshold,
  };
}
