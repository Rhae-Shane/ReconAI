/**
 * types.ts — ALL shared data shapes for the AI Finance Controller core engine.
 *
 * These types are the single source of truth for every module in `harness/src`,
 * and are mirrored by the app repo (`next-shadcn-admin-dashboard`). Currency is
 * integer **paise**, signed: `+` inflow, `-` outflow. See SPEC §4/§5.
 */

/** Source systems feeding one close run. */
export type SourceKind =
  | 'razorpay-gateway'
  | 'bank-utr'
  | 'erp-orders'
  | 'gst-invoices';

/** What a record represents in the money lifecycle. */
export type RecordKind =
  | 'PAYMENT'
  | 'SETTLEMENT'
  | 'REFUND'
  | 'FEE'
  | 'INVOICE'
  | 'CHARGEBACK'
  | 'ADJUSTMENT';

/** How a match group was formed (deterministic-first ordering). */
export type MatchMethod = 'EXACT' | 'NORMALIZED' | 'JUDGED' | 'NETTED';

/**
 * Every reconciliation decision carries an explicit, explainable match type.
 * This is the "what did we actually do with these records" label a finance team
 * reads. Deterministic-first: EXACT / NORMALIZED, then financial netting
 * (FEE / REFUND / ADJUSTMENT), then the residual (PARTIAL / FUZZY / AI_RESOLVED),
 * and finally UNRESOLVED for anything filed to the exception ledger.
 */
export type MatchType =
  | 'EXACT'
  | 'NORMALIZED'
  | 'FEE_NETTED'
  | 'REFUND_NETTED'
  | 'ADJUSTMENT_NETTED'
  | 'PARTIAL'
  | 'FUZZY'
  | 'AI_RESOLVED'
  | 'UNRESOLVED';

/**
 * Structured reason codes for the honest exception ledger. Nothing is ever
 * silently dropped — every unresolved record must carry one of these.
 */
export type ReasonCode =
  | 'NO_KEY' // no usable reference key found (orphan)
  | 'AMOUNT_MISMATCH' // key matches but amounts differ beyond tolerance
  | 'PARTIAL_FLAP' // some signals matched, not enough to resolve
  | 'DATE_SKEW' // amount matched but value date outside the window
  | 'LOW_CONFIDENCE' // judge could not reach the resolve threshold
  | 'DUPLICATE' // idempotency collision: same (source, sourceRef) repeated
  | 'UNKNOWN_SOURCE'; // unrecognised source kind

/**
 * A normalized finance record. `sourceRef` is the per-source idempotency key
 * (gateway ref / UTR / order id / invoice no). `ts` is the value date (ISO
 * `YYYY-MM-DD`).
 */
export interface FinRecord {
  id: string;
  source: SourceKind;
  kind: RecordKind;
  sourceRef: string;
  ts: string; // value date, ISO "YYYY-MM-DD"
  amountPaise: number; // signed: + inflow, - outflow
  currency: string;
  counterparty?: string;
  description?: string;
  /** Bank UTR — shared by gateway + bank rows; the primary cross-source key. */
  utr?: string;
  /** Gateway payment ref (pay_...) — shared by gateway + erp rows. */
  gatewayRef?: string;
  /** ERP order ref (ORD-...) — shared by erp + gst rows. */
  orderRef?: string;
  /**
   * Tax (GST/IGST) charged ON a gateway fee, in paise, magnitude (always >= 0).
   * Present on FEE records so gross − fee − tax_on_fee + refund/adjustment
   * nets cleanly to the settlement (SPEC review P0).
   */
  feeTaxPaise?: number;
  /** Original raw row, preserved verbatim. */
  raw?: Record<string, unknown>;
}

/** Membership of a record inside a match group. */
export interface MatchLink {
  recordId: string;
  matchedOn: string; // "utr" | "gatewayRef" | "orderRef" | "normalizedRef" | "judge"
  /** Explicit, explainable decision for this link. */
  matchType?: MatchType;
}

/**
 * The exact settlement mathematics behind a netted match. All magnitudes in
 * paise. Captures the review's target identity:
 *
 *   netExpected = gross − gatewayFee − taxOnFee − refund + adjustment
 *   variance    = actualSettlement − netExpected   (≈ 0 when the net matches)
 *
 * Nothing here is guessed: every field is populated only from FEE/REFUND/
 * ADJUSTMENT records actually present in the group.
 */
export interface NettingBreakdown {
  /** Base invoice / payment amount from which the settlement derives (abs). */
  grossPaise: number;
  /** Total gateway fees present (FEE records, abs). */
  feePaise: number;
  /** Tax charged on those gateway fees (FEE.feeTaxPaise, abs). */
  taxOnFeePaise: number;
  /** Total refunds present (REFUND records, abs). */
  refundPaise: number;
  /** Net adjustment (ADJUSTMENT records; signed, +/-). */
  adjustmentPaise: number;
  /** gross − fee − taxOnFee − refund + adjustment. */
  netExpectedPaise: number;
  /** Sum of the actual settlement legs present (SETTLEMENT / bank-utr, abs). */
  actualSettlementPaise: number;
  /** actualSettlement − netExpected; ≈ 0 (within tolerance) for a balanced net. */
  variancePaise: number;
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

/** A set of records judged to be one underlying money movement. */
export interface MatchGroup {
  id: string;
  key: string;
  method: MatchMethod;
  /** Explicit decision label — the primary deliverable of the reconciler. */
  matchType: MatchType;
  confidence: number;
  reason: string;
  amountPaise: number;
  recordIds: string[];
  links: MatchLink[];
  /** Representative value date (ISO) when known — used for journal posting. */
  valueDate?: string;
  /** Present when this group was resolved by an AI residual judge. */
  aiProvenance?: AiDecisionProvenance;
  /** Present exactly when this group was formed by financial netting. */
  netting?: NettingBreakdown;
}

export interface SettlementLine {
  groupId: string;
  amountPaise: number;
}

export interface Settlement {
  id: string;
  groupKeys: string[];
  settledAt: string;
  amountPaise: number;
  utr?: string;
  status: 'EXPECTED' | 'RECEIVED' | 'MISSING' | 'RECONCILED';
  lagDays?: number;
  lines: SettlementLine[];
}

/** A forward cash projection point. */
export interface ForecastDatum {
  date: string;
  balancePaise: number;
  deltaPaise: number;
  confidence: number;
  reconciledIn: boolean;
}

/** A tiny GST/HSN + ledger taxonomy. */
export interface TaxCategory {
  code: string; // HSN or GL code
  label: string;
  description?: string;
}

export interface TaxLineMatch {
  recordId: string;
  categoryCode: string | null;
  categoryLabel?: string;
  matchedBy: 'RULE' | 'JUDGED';
  confidence: number;
  reason: string;
}

/** Append-only audit event. */
export interface AuditEvent {
  id: string;
  runId: string;
  actorType: 'AGENT' | 'SYSTEM' | 'USER';
  actorId: string;
  action: string; // INGEST|MATCH|JUDGE|SETTLE|FORECAST|TAX|EXCEPTION|CLOSE
  recordId?: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

/** SoD workflow state for exception resolution (orthogonal to ledger `status`). */
export type ExceptionResolutionStatus =
  | 'OPEN'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

/** Append-only honest exception record — never deleted. */
export interface ExceptionRecord {
  id: string;
  runId: string;
  recordId: string | null;
  recordJson: Record<string, unknown>;
  reasonCode: ReasonCode;
  rationale: string;
  candidateIds: string[];
  status: 'OPEN' | 'REVIEWED' | 'OVERRIDDEN' | 'RESOLVED';
  createdAt: string;
  /** How this residual was classed (the review-P1 matchType on exceptions). */
  matchType?: MatchType;
  /** Resolver confidence in the diagnosis (0..1). */
  confidence?: number;
  /** What we expected the settlement to be (the record's own amount). */
  expectedPaise?: number;
  /** The actual settlement (or best near-match) that was present. */
  actualPaise?: number;
  /** expected − actual (positive = shortfall). */
  variancePaise?: number;
  /** Fee component explaining the variance, when known (abs). */
  feePaise?: number;
  /** Adjustment component explaining the variance, when known (signed). */
  adjustmentPaise?: number;
  /** Refund component explaining the variance, when known (abs). */
  refundPaise?: number;
  /** Free-text AI rationale, when the residual was AI-arbitrated. */
  aiReasoning?: string;
  /** Human decision recorded on review: e.g. "RESOLVE_AUTO", "OVERRIDE". */
  reviewerDecision?: string;
  /** Actor who submitted the resolution (SoD: must differ from approvedBy on critical). */
  resolvedBy?: string;
  /** Actor who approved the resolution (SoD: must differ from resolvedBy on critical). */
  approvedBy?: string;
  /** Resolution workflow state for segregation-of-duties. */
  resolutionStatus?: ExceptionResolutionStatus;
  /**
   * Material / high-risk exception — always requires SoD (resolvedBy !== approvedBy).
   * True for AMOUNT_MISMATCH, DUPLICATE, or |variance| above the critical threshold.
   */
  critical?: boolean;
}

/** Per-tenant tolerance + threshold model (SPEC §5). */
export interface FinanceConfig {
  paiseTolerance: number;
  dateWindowDays: number;
  resolveThreshold: number;
  exactThreshold: number;
  normalizedThreshold: number;
  maxExceptionAge: number;
}

export interface SourceStats {
  source: SourceKind;
  total: number;
  matched: number;
  matchRate: number; // 0..1
  exceptionCount: number;
}

/** Ground-truth label for a record produced by the batch generator. */
export interface GroundTruthLabel {
  expectedGroupKey: string | null;
  expectedStatus: 'MATCHED' | 'EXCEPTION';
}

/**
 * One unresolved record broken down the way a finance team reads it: what we expected vs what a
 * settlement actually delivered, the difference, and *why* the resolver thinks so.
 */
export interface UnresolvedLine {
  recordId: string; // the record being reconciled (invoice / payment / gateway)
  ref: string; // human key, e.g. "INV-1234" or "pay_19"
  expectedPaise: number; // invoice / payment amount
  actualPaise: number; // the settlement (or best near-match) amount actually present
  differencePaise: number; // expected - actual (positive = shortfall)
  reason: ReasonCode; // why it did not resolve cleanly
  confidence: number; // resolver confidence in the diagnosis (0..1)
  status: 'NEEDS_REVIEW' | 'RESOLVED'; // human-review state
}

/** Top-line outcomes: the explicit matched / partial / unresolved split + match rate. */
export interface MatchBreakdown {
  records: number;
  matched: number;
  partial: number;
  unresolved: number;
  matchRate: number; // records ? matched / records : 0  (0..1)
}

/** The terminal deliverable of a close run. */
export interface CloseReport {
  runId: string;
  generatedAt: string;
  batchId?: string;
  totals: {
    records: number;
    sources: number;
    matched: number;
    resolvedPct: number;
    exceptionCount: number;
    groups: number;
  };
  /** Explicit matched / partial / unresolved categories + match rate. */
  breakdown: MatchBreakdown;
  /** Per-record breakdown for everything we could not fully resolve. */
  unresolved: UnresolvedLine[];
  perSource: SourceStats[];
  precision: number;
  recall: number;
  judge: { candidates: number; resolved: number; lowConfidence: number };
  exceptions: ExceptionRecord[];
  auditCount: number;
}

/** One raw export row, verbatim from a source. */
export type RawRow = Record<string, unknown>;

export interface SourceData {
  source: SourceKind;
  rows: RawRow[];
}

/** The full synthetic batch fed to CloseEngine (with optional ground truth). */
export interface Batch {
  id: string;
  sources: SourceData[];
  labels?: Record<string, GroundTruthLabel>;
}

/** A near-match candidate surfaced for the judge to arbitrate. */
export interface Candidate {
  flapId: string; // unresolved record
  matchRecordId: string; // potential partner
  amountDiff: number;
  dateOk: boolean;
  counterpartyOk: boolean;
  normRefOk: boolean;
  /** Free-text for the optional semantic matcher (flap's descriptor), when available. */
  flapText?: string;
  /** Free-text for the optional semantic matcher (partner's descriptor), when available. */
  matchText?: string;
}

export interface JudgeResult {
  confidence: number;
  reason: string;
  matchedRef: string | null;
  matchedSourceIds: string[];
  reasonCode?: ReasonCode;
  normRefOk: boolean;
  /** Explicit decision class: HeuristicJudge => FUZZY, ClaudeJudge => AI_RESOLVED. */
  matchType?: MatchType;
  /** Free-text rationale when the residual was AI-arbitrated. */
  aiReasoning?: string;
  /** Present when an LLM successfully arbitrated this candidacy; HeuristicJudge leaves undefined. */
  provenance?: AiDecisionProvenance;
}
