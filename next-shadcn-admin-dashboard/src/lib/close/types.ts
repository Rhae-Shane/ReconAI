/**
 * Shared data shapes for the Controller close loop.
 *
 * NOTE: The rules engine that owns the authoritative copies of these types lives in
 * `harness/src/core/types.ts` (framework-agnostic core). That harness does not exist in
 * this workspace yet, so these are LOCAL PLACEHOLDER definitions whose field names mirror
 * the harness types and the Prisma models in SPEC §4 one-to-one. When the harness lands,
 * replace the `import ... from "./types"` sites in this app with the harness module and
 * delete this file.
 */

export type SourceKind = "gateway" | "bank" | "erp" | "gst";

export type FinKind = "PAYMENT" | "SETTLEMENT" | "REFUND" | "FEE" | "INVOICE" | "CHARGEBACK" | "ADJUSTMENT";

export type MatchMethod = "EXACT" | "NORMALIZED" | "JUDGED" | "NETTED";

/** Explicit, explainable decision label for a match group / link (review P1). */
export type MatchType =
  | "EXACT"
  | "NORMALIZED"
  | "FEE_NETTED"
  | "REFUND_NETTED"
  | "ADJUSTMENT_NETTED"
  | "PARTIAL"
  | "FUZZY"
  | "AI_RESOLVED"
  | "UNRESOLVED";

export type ReasonCode =
  | "NO_KEY"
  | "AMOUNT_MISMATCH"
  | "PARTIAL_FLAP"
  | "DATE_SKEW"
  | "LOW_CONFIDENCE"
  | "DUPLICATE"
  | "UNKNOWN_SOURCE";

export type RunStatus = "RUNNING" | "DONE" | "FAILED";

export type ExceptionStatus = "OPEN" | "REVIEWED" | "OVERRIDDEN" | "RESOLVED";

/** SoD workflow state for exception resolution (orthogonal to ledger `status`). */
export type ExceptionResolutionStatus = "OPEN" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

export interface FinanceConfig {
  paiseTolerance: number;
  dateWindowDays: number;
  resolveThreshold: number;
  exactThreshold: number;
  normalizedThreshold: number;
  maxExceptionAgeDays: number;
  currency: string;
}

/** Normalized finance record (one row from a raw export). */
export interface FinRecord {
  id: string;
  source: SourceKind;
  sourceName: string;
  kind: FinKind;
  sourceRef: string;
  ts: string; // ISO value date
  amountPaise: number; // signed rupees, + inflow / - outflow
  currency: string;
  counterparty?: string;
  description?: string;
  /** Tax (GST) charged ON a gateway fee, in paise (magnitude). On FEE records. */
  feeTaxPaise?: number;
  raw?: Record<string, unknown>;
}

export interface MatchLink {
  recordId: string;
  matchedOn: string; // "gatewayRef" | "utr" | "amountWindow" | "normalizedRef" | "judge"
  matchType?: MatchType;
}

/** Provenance for an AI residual-judge decision (audit / Decision Trace). */
export interface AiDecisionProvenance {
  decisionId: string;
  model: string;
  promptVersion: string; // e.g. "reconciliation-v3"
  inputHash: string; // sha256 of candidacy JSON
  output: string; // serialized verdict/reason
  confidence: number;
  timestamp: string; // ISO
  humanReviewRequired: boolean;
}

export interface MatchGroup {
  id: string;
  runId: string;
  key: string;
  method: MatchMethod;
  /** Explicit decision label — the primary deliverable of the reconciler. */
  matchType: MatchType;
  confidence: number;
  reason: string; // e.g. "exact:utr"
  amountPaise: number;
  ts: string; // representative value date
  links: MatchLink[];
  /** Present when this group was resolved by the AI residual judge. */
  aiProvenance?: AiDecisionProvenance;
  /** Present exactly when this group was formed by financial netting. */
  netting?: {
    grossPaise: number;
    feePaise: number;
    taxOnFeePaise: number;
    refundPaise: number;
    adjustmentPaise: number;
    netExpectedPaise: number;
    actualSettlementPaise: number;
    variancePaise: number;
  };
}

/** A near-match that could not be cleanly resolved (still filed as an exception). */
export interface Flap {
  id: string;
  runId: string;
  recordIds: string[];
  amountPaise: number;
  reason: string;
}

export interface Settlement {
  id: string;
  runId: string;
  settledAt: string;
  amountPaise: number;
  utrNumber?: string;
  status: "EXPECTED" | "RECEIVED" | "MISSING" | "RECONCILED";
  lagDays?: number;
}

export interface ForecastDatum {
  id: string;
  runId: string;
  date: string; // ISO
  balancePaise: number;
  deltaPaise: number;
  confidence: number;
  reconciledIn: boolean;
}

export interface TaxCategory {
  id: string;
  code: string; // HSN / GL code
  label: string;
  description?: string;
}

export interface TaxLineMatch {
  id: string;
  runId: string;
  recordId: string;
  categoryId?: string;
  categoryCode?: string;
  categoryLabel?: string;
  matchedBy: "RULE" | "JUDGED";
  confidence: number;
  reason: string;
}

export interface AuditEvent {
  id: string;
  runId: string;
  actorType: "AGENT" | "SYSTEM" | "USER";
  actorId: string;
  action: "INGEST" | "MATCH" | "JUDGE" | "SETTLE" | "FORECAST" | "TAX" | "EXCEPTION" | "CLOSE";
  recordId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export interface ExceptionRecord {
  id: string;
  runId: string;
  recordId?: string;
  recordJson: Record<string, unknown>;
  reasonCode: ReasonCode;
  rationale: string;
  candidateIds: string[];
  status: ExceptionStatus;
  createdAt: string;
  /** Review-P1 enrichment: how this residual was classed / why it varies. */
  matchType?: MatchType;
  confidence?: number;
  expectedPaise?: number;
  actualPaise?: number;
  variancePaise?: number;
  feePaise?: number;
  adjustmentPaise?: number;
  refundPaise?: number;
  aiReasoning?: string;
  reviewerDecision?: string;
  /** Actor who submitted the resolution (SoD: must differ from approvedBy on critical). */
  resolvedBy?: string;
  /** Actor who approved the resolution (SoD: must differ from resolvedBy on critical). */
  approvedBy?: string;
  /** Resolution workflow state for segregation-of-duties. */
  resolutionStatus?: ExceptionResolutionStatus;
  /**
   * Material / high-risk — always requires SoD (resolvedBy !== approvedBy).
   * True for AMOUNT_MISMATCH, DUPLICATE, or |variance| above the critical threshold.
   */
  critical?: boolean;
}

export interface SourceStat {
  source: SourceKind;
  sourceName: string;
  records: number;
  matched: number;
  matchRate: number; // 0..1
}

export interface CloseRunMeta {
  id: string;
  status: RunStatus;
  batchRef?: string;
  startedAt: string;
  finishedAt?: string;
  totals: RunTotals;
}

export interface RunTotals {
  records: number;
  matched: number;
  exceptions: number;
  resolvedPct: number; // 0..100
  groups: number;
  judged: number;
  precision?: number;
  recall?: number;
}

/** One unresolved record, aligned to the harness `UnresolvedLine` shape. */
export interface UnresolvedLine {
  recordId: string;
  ref: string; // e.g. "INV-1234"
  expectedPaise: number;
  actualPaise: number;
  differencePaise: number; // expected - actual
  reason: ReasonCode;
  confidence: number; // 0..1 diagnostic confidence
  status: "NEEDS_REVIEW" | "RESOLVED";
}

/** Explicit matched / partial / unresolved split + match rate. */
export interface MatchBreakdown {
  records: number;
  matched: number;
  partial: number;
  unresolved: number;
  matchRate: number; // 0..1
}

export interface CloseReport {
  runId: string;
  generatedAt: string;
  totals: RunTotals;
  breakdown: MatchBreakdown;
  unresolved: UnresolvedLine[];
  perSource: SourceStat[];
  confidenceBins: Array<{ bin: string; count: number }>;
  exceptions: ExceptionRecord[];
  groundedRecords: number;
}

export interface RunDetail {
  meta: CloseRunMeta;
  sources: SourceStat[];
  groups: MatchGroup[];
  flaps: Flap[];
  exceptions: ExceptionRecord[];
  settlements: Settlement[];
  forecast: ForecastDatum[];
  taxMatches: TaxLineMatch[];
  audit: AuditEvent[];
  /** Linked FinRecords for the run (optional for backward-compatible callers). */
  records?: FinRecord[];
}

/** Decision shape emitted by a Judge for a residual candidacy. */
export interface JudgeDecision {
  confidence: number;
  reason: string;
  matchedRef?: string;
  matchedSourceIds: string[];
  /** Present when an LLM successfully arbitrated this candidacy. */
  provenance?: AiDecisionProvenance;
}

export interface JudgeCandidacy {
  recordIds: string[];
  amountPaise: number;
  sources: SourceKind[];
  hint?: string;
}

/** Pluggable residual-judgment interface (HeuristicJudge default, ClaudeJudge pluggable). */
export interface Judge {
  decide(candidacy: JudgeCandidacy): JudgeDecision | Promise<JudgeDecision>;
}
