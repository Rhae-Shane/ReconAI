/**
 * judge.ts — Judge interface + deterministic HeuristicJudge (default).
 *
 * The judge arbitrates ONLY the residual ambiguity left by the deterministic
 * matching passes. It returns a real confidence in [0,1] plus a machine reason
 * code; CloseEngine enforces `resolveThreshold` in code — the judge never
 * silently asserts a match. `forceLowConfidence(recordIds)` is the honesty
 * drill: it lets us prove a LOW_CONFIDENCE record is surfaced as an exception
 * and never hidden.
 */
import type {
  Candidate,
  JudgeResult,
  ReasonCode,
} from './types.js';
import type { SemanticMatcher } from './semantic.js';

export interface Judge {
  judgeCandidates(candidates: Candidate[], hint?: string): JudgeResult;
  /** Force the named records to a sub-threshold confidence (honesty drill). */
  forceLowConfidence(recordIds: string[]): void;
}

/**
 * Deterministic, rule-based judge. Confidence is assembled from independent
 * signals (amount, date, counterparty, normalized reference). Without an
 * identifier-backed reference match the confidence is hard-capped below the
 * resolve threshold so the engine never guesses a match from fuzzy text alone.
 *
 * HeuristicJudge never emits `provenance` — that field is reserved for an
 * LLM-backed residual judge (same {@link AiDecisionProvenance} shape as the app).
 */
export class HeuristicJudge implements Judge {
  private forced = new Set<string>();

  /**
   * Optional semantic matcher for the residual (see semantic.ts). When provided, the judge blends
   * free-text similarity of the flap↔partner candidate into the confidence — still capped by
   * `NO_REF_CAP` so a pure-text match can never silently cross the resolve threshold. Default
   * `null` keeps the audited batch byte-for-byte unchanged.
   */
  constructor(private semantic: SemanticMatcher | null = null) {}

  /** Cap applied when there is NO identifier-backed (ref) match. */
  static readonly NO_REF_CAP = 0.65;

  forceLowConfidence(recordIds: string[]): void {
    for (const id of recordIds) this.forced.add(id);
  }

  resetForced(): void {
    this.forced.clear();
  }

  private score(c: Candidate): number {
    let s = 0;
    if (c.amountDiff >= 0) s += 0.4; // amount within tolerance
    if (c.dateOk) s += 0.1;
    if (c.counterpartyOk) s += 0.15;
    if (c.normRefOk) s += 0.3;
    return Math.min(1, s);
  }

  judgeCandidates(candidates: Candidate[], hint?: string): JudgeResult {
    if (!candidates.length) {
      return {
        confidence: 0,
        reason: 'no near-amount candidates found',
        matchedRef: null,
        matchedSourceIds: [],
        reasonCode: 'NO_KEY',
        normRefOk: false,
      };
    }
    // Prefer identifier-backed candidates; among those pick the best score.
    const best = candidates.reduce((a, b) => {
      const sa = this.score(a);
      const sb = this.score(b);
      if (a.normRefOk && !b.normRefOk) return a;
      if (b.normRefOk && !a.normRefOk) return b;
      return sb > sa ? b : a;
    });

    const forced = this.forced.has(best.flapId);
    let confidence = this.score(best);
    let semNote = '';
    if (forced) confidence = 0.3;
    else if (!best.normRefOk) {
      confidence = Math.min(confidence, HeuristicJudge.NO_REF_CAP);
      // Semantic nudge for the fuzzy residual: blend free-text similarity of the flap↔partner.
      // Remains capped by NO_REF_CAP so it can re-rank but not silently resolve.
      if (this.semantic && best.flapText && best.matchText) {
        const sem = this.semantic.score(best.flapText, best.matchText);
        confidence = Math.min(HeuristicJudge.NO_REF_CAP, 0.5 * confidence + 0.5 * sem);
        semNote = ` sem=${sem.toFixed(2)}`;
      }
    }

    const reasonCode: ReasonCode = reasonFor(best, confidence);
    return {
      confidence,
      reason: `heuristic:candidate(${best.matchRecordId}) amountDiff=${best.amountDiff} dateOk=${best.dateOk} cpyOk=${best.counterpartyOk} refOk=${best.normRefOk}${semNote}${forced ? ' [forced-low]' : ''}${hint ? ` hint=${hint}` : ''}`,
      matchedRef: null,
      // HeuristicJudge is the deterministic residual resolver -> always FUZZY.
      matchType: 'FUZZY',
      matchedSourceIds: best.normRefOk ? [best.matchRecordId] : [],
      reasonCode,
      normRefOk: best.normRefOk,
    };
  }
}

function reasonFor(c: Candidate, confidence: number): ReasonCode {
  if (c.normRefOk) return 'LOW_CONFIDENCE'; // judged; CloseEngine decides resolve by threshold
  if (!c.dateOk) return 'DATE_SKEW';
  if (c.counterpartyOk) return 'PARTIAL_FLAP';
  return 'LOW_CONFIDENCE';
}
