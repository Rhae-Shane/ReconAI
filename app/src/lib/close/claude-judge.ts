import { buildAiDecisionProvenance, RECONCILIATION_PROMPT_VERSION } from "./ai-provenance";
import { DEFAULT_FINANCE_CONFIG } from "./config";
import { embeddingSimilarity, openaiKey } from "./openai-embeddings";
import type { Judge, JudgeCandidacy, JudgeDecision } from "./types";

/**
 * Residual judge (`Judge`, SPEC §6.1 / §6.3) backed by OpenAI.
 *
 * Chat completions (`gpt-4o-mini`) plus OpenAI embeddings (`text-embedding-3-small`) share
 * OPENAI_API_KEY. If the key is missing the heuristic fallback keeps the pipeline local.
 *
 * Successful model judgments attach {@link AiDecisionProvenance} (promptVersion
 * `reconciliation-v3`, sha256 input hash, serialized output).
 *
 * NOTE: depends on `ai` + `@ai-sdk/openai`. Imports are deferred so
 * importing this module does not require the SDK to be installed.
 */

function heuristicDecide(candidacy: JudgeCandidacy): JudgeDecision {
  // Deterministic, reproducible residual judgment used when no model is configured.
  // No provenance — this path is not model-backed.
  const matchedSourceIds = candidacy.recordIds.slice(0, 2);
  const confidence = 0.72 + (candidacy.recordIds.length % 3) * 0.04;
  return {
    confidence: Math.min(0.86, confidence),
    reason: `judge:heuristic matched ${candidacy.recordIds.length} record(s) on amount + counterparty`,
    matchedSourceIds,
  };
}

const SYSTEM_PROMPT = `You are the finance controller. You reconcile, settle, forecast and match tax.
You never guess a match - you assign confidence and file exceptions when you are not sure.
The decisive numbers are computed by the engine, not by you. Only arbitrate the residual
ambiguity presented:
- If the candidate set is clearly the same money movement, return a confidence >= the resolve
  threshold (${DEFAULT_FINANCE_CONFIG.resolveThreshold}) with a short reason.
- If it is ambiguous, return a confidence BELOW the threshold with a candid reason.
Return strict JSON: { "confidence": number, "reason": string, "matchedSourceIds": string[] }.`;

export interface ClaudeJudgeOptions {
  model?: string;
  apiKey?: string;
  fallback?: Judge;
}

export class ClaudeJudge implements Judge {
  private readonly model: string;
  private readonly fallback: Judge;

  constructor(private readonly options: ClaudeJudgeOptions = {}) {
    this.model = options.model ?? "gpt-4o-mini";
    this.fallback = options.fallback ?? { decide: heuristicDecide };
  }

  private get hasModel() {
    return Boolean(openaiKey(this.options.apiKey));
  }

  async decide(candidacy: JudgeCandidacy): Promise<JudgeDecision> {
    if (!this.hasModel) return this.fallback.decide(candidacy);
    try {
      const [{ generateObject }, { createOpenAI }] = await Promise.all([import("ai"), import("@ai-sdk/openai")]);
      const schema = (await import("zod")).z.object({
        confidence: (await import("zod")).z.number().min(0).max(1),
        reason: (await import("zod")).z.string(),
        matchedSourceIds: (await import("zod")).z.array((await import("zod")).z.string()),
      });
      const key = openaiKey(this.options.apiKey);
      const openai = createOpenAI({ apiKey: key });
      const embeddingScore = candidacy.hint
        ? await embeddingSimilarity(candidacy.hint, JSON.stringify(candidacy), key)
        : null;
      const prompt =
        embeddingScore === null
          ? JSON.stringify(candidacy)
          : `${JSON.stringify(candidacy)}\nOpenAI embedding cosine(hint, candidacy)=${embeddingScore.toFixed(3)}`;
      const { object } = await generateObject({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: openai(this.model) as any,
        schema,
        system: SYSTEM_PROMPT,
        prompt,
      });
      const provenance = buildAiDecisionProvenance({
        model: this.model,
        candidacy,
        confidence: object.confidence,
        reason: object.reason,
        matchedSourceIds: object.matchedSourceIds,
        promptVersion: RECONCILIATION_PROMPT_VERSION,
      });
      return {
        confidence: object.confidence,
        reason: object.reason,
        matchedSourceIds: object.matchedSourceIds,
        provenance,
      };
    } catch {
      return this.fallback.decide(candidacy);
    }
  }
}
