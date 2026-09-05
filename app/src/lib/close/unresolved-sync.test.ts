import { describe, expect, it } from "vitest";

import type { ExceptionRecord, UnresolvedLine } from "./types";
import { reconcileUnresolvedWithExceptions } from "./unresolved-sync";

function line(partial: Partial<UnresolvedLine> & Pick<UnresolvedLine, "recordId">): UnresolvedLine {
  return {
    ref: partial.recordId,
    expectedPaise: 10000,
    actualPaise: 0,
    differencePaise: 10000,
    reason: "NO_KEY",
    confidence: 0.5,
    status: "NEEDS_REVIEW",
    ...partial,
  };
}

function exc(partial: Partial<ExceptionRecord> & Pick<ExceptionRecord, "id" | "recordId" | "status">): ExceptionRecord {
  return {
    runId: "run_1",
    recordJson: {},
    reasonCode: "NO_KEY",
    rationale: "test",
    candidateIds: [],
    createdAt: new Date().toISOString(),
    resolutionStatus: "OPEN",
    ...partial,
  };
}

describe("reconcileUnresolvedWithExceptions", () => {
  it("marks stale report rows RESOLVED when the live ledger has no matching exception", () => {
    const out = reconcileUnresolvedWithExceptions([line({ recordId: "rec_1" })], []);
    expect(out[0]?.status).toBe("RESOLVED");
  });

  it("keeps NEEDS_REVIEW when the live exception is OPEN", () => {
    const out = reconcileUnresolvedWithExceptions(
      [line({ recordId: "rec_1" })],
      [exc({ id: "exc_1", recordId: "rec_1", status: "OPEN" })],
    );
    expect(out[0]?.status).toBe("NEEDS_REVIEW");
  });

  it("marks RESOLVED when the live exception is RESOLVED", () => {
    const out = reconcileUnresolvedWithExceptions(
      [line({ recordId: "rec_1" })],
      [exc({ id: "exc_1", recordId: "rec_1", status: "RESOLVED", resolutionStatus: "APPROVED" })],
    );
    expect(out[0]?.status).toBe("RESOLVED");
  });
});
