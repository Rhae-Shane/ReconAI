import { describe, expect, it } from "vitest";

import { clearAiDecisions, listAiDecisions, recordAiDecision } from "./ai-decision-log";
import {
  buildAiDecisionProvenance,
  hashCandidacyInput,
  RECONCILIATION_PROMPT_VERSION,
  stableStringify,
} from "./ai-provenance";
import type { JudgeCandidacy } from "./types";
import { createHash } from "node:crypto";

const fixedCandidacy: JudgeCandidacy = {
  recordIds: ["rec_a", "rec_b"],
  amountPaise: 12_500_00,
  sources: ["gateway", "bank"],
  hint: "same UTR window",
};

describe("ai provenance helpers", () => {
  it("hashCandidacyInput is stable for fixed input (key order independent)", () => {
    const a = hashCandidacyInput(fixedCandidacy);
    const b = hashCandidacyInput({
      hint: "same UTR window",
      amountPaise: 12_500_00,
      sources: ["gateway", "bank"],
      recordIds: ["rec_a", "rec_b"],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);

    const expected = createHash("sha256").update(stableStringify(fixedCandidacy), "utf8").digest("hex");
    expect(a).toBe(expected);
  });

  it("buildAiDecisionProvenance stamps reconciliation-v3 and serializes output", () => {
    const provenance = buildAiDecisionProvenance({
      model: "gpt-4o-mini",
      candidacy: fixedCandidacy,
      confidence: 0.88,
      reason: "same money movement across gateway + bank",
      matchedSourceIds: ["rec_a", "rec_b"],
      decisionId: "dec-test-001",
      timestamp: "2026-09-05T09:00:00.000Z",
    });

    expect(provenance).toEqual({
      decisionId: "dec-test-001",
      model: "gpt-4o-mini",
      promptVersion: RECONCILIATION_PROMPT_VERSION,
      inputHash: hashCandidacyInput(fixedCandidacy),
      output: stableStringify({
        confidence: 0.88,
        reason: "same money movement across gateway + bank",
        matchedSourceIds: ["rec_a", "rec_b"],
      }),
      confidence: 0.88,
      timestamp: "2026-09-05T09:00:00.000Z",
      humanReviewRequired: false,
    });
    expect(provenance.promptVersion).toBe("reconciliation-v3");
  });

  it("marks humanReviewRequired when confidence is below resolve threshold", () => {
    const provenance = buildAiDecisionProvenance({
      model: "gpt-4o-mini",
      candidacy: fixedCandidacy,
      confidence: 0.55,
      reason: "ambiguous",
      matchedSourceIds: [],
      decisionId: "dec-low",
      timestamp: "2026-09-05T09:00:00.000Z",
    });
    expect(provenance.humanReviewRequired).toBe(true);
  });

  it("ring buffer stores and lists AI decisions", () => {
    clearAiDecisions();
    const provenance = buildAiDecisionProvenance({
      model: "gpt-4o-mini",
      candidacy: fixedCandidacy,
      confidence: 0.9,
      reason: "ok",
      matchedSourceIds: ["rec_a"],
      decisionId: "dec-ring",
      timestamp: "2026-09-05T10:00:00.000Z",
    });
    recordAiDecision(provenance, {
      runId: "run_today",
      recordIds: fixedCandidacy.recordIds,
      matchType: "AI_RESOLVED",
    });
    const listed = listAiDecisions({ runId: "run_today" });
    expect(listed).toHaveLength(1);
    expect(listed[0]?.decisionId).toBe("dec-ring");
    expect(listed[0]?.matchType).toBe("AI_RESOLVED");
    expect(listed[0]?.inputHash).toBe(hashCandidacyInput(fixedCandidacy));
    clearAiDecisions();
  });
});
