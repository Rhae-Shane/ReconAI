import type { ExceptionRecord, ReasonCode, UnresolvedLine } from "./types";

/** Default diagnostic confidence when an exception was filed without an explicit score. */
export function defaultExceptionConfidence(reason: ReasonCode): number {
  switch (reason) {
    case "LOW_CONFIDENCE":
      return 0.55;
    case "PARTIAL_FLAP":
      return 0.5;
    case "AMOUNT_MISMATCH":
      return 0.45;
    case "DUPLICATE":
      return 0.4;
    case "DATE_SKEW":
      return 0.5;
    default:
      return 0.35;
  }
}

function isExceptionResolved(exc: ExceptionRecord): boolean {
  return exc.status === "RESOLVED" || exc.resolutionStatus === "APPROVED";
}

/**
 * Align frozen report unresolved lines with the live exception ledger so the
 * Exceptions / Trust UI never claims CLOSE VERIFIED while still showing
 * "Needs human review", or the reverse.
 *
 * Rules:
 * - Live OPEN (or pending) exception → NEEDS_REVIEW
 * - Live RESOLVED exception → RESOLVED
 * - No live exception for the row → RESOLVED (stale report snapshot; ledger is source of truth)
 */
export function reconcileUnresolvedWithExceptions(
  lines: UnresolvedLine[],
  exceptions: ExceptionRecord[],
): UnresolvedLine[] {
  const byRecord = new Map<string, ExceptionRecord>();
  for (const e of exceptions) {
    if (e.recordId) byRecord.set(e.recordId, e);
  }

  return lines.map((line) => {
    const exc = byRecord.get(line.recordId);
    if (!exc) {
      return { ...line, status: "RESOLVED" as const };
    }
    if (isExceptionResolved(exc)) {
      return {
        ...line,
        reason: exc.reasonCode,
        confidence: exc.confidence ?? line.confidence,
        status: "RESOLVED" as const,
      };
    }
    return {
      ...line,
      reason: exc.reasonCode,
      confidence: exc.confidence ?? defaultExceptionConfidence(exc.reasonCode),
      expectedPaise: typeof exc.expectedPaise === "number" ? exc.expectedPaise : line.expectedPaise,
      actualPaise: typeof exc.actualPaise === "number" ? exc.actualPaise : line.actualPaise,
      differencePaise:
        (typeof exc.expectedPaise === "number" ? exc.expectedPaise : line.expectedPaise) -
        (typeof exc.actualPaise === "number" ? exc.actualPaise : line.actualPaise),
      status: "NEEDS_REVIEW" as const,
    };
  });
}

/** Build an UnresolvedLine from a live exception (for report builders). */
export function unresolvedLineFromException(
  exc: ExceptionRecord,
  fallback: { expectedPaise: number; actualPaise?: number; ref?: string; recordId?: string },
): UnresolvedLine {
  const expectedPaise = typeof exc.expectedPaise === "number" ? exc.expectedPaise : fallback.expectedPaise;
  const actualPaise = typeof exc.actualPaise === "number" ? exc.actualPaise : (fallback.actualPaise ?? 0);
  const resolved = isExceptionResolved(exc);
  return {
    recordId: exc.recordId ?? fallback.recordId ?? exc.id,
    ref: fallback.ref ?? String(exc.recordJson?.ref ?? exc.recordJson?.sourceRef ?? exc.recordId ?? exc.id),
    expectedPaise,
    actualPaise,
    differencePaise: expectedPaise - actualPaise,
    reason: exc.reasonCode,
    confidence: exc.confidence ?? defaultExceptionConfidence(exc.reasonCode),
    status: resolved ? "RESOLVED" : "NEEDS_REVIEW",
  };
}
