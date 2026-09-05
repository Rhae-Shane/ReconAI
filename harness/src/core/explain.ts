/**
 * explain.ts — Build human-readable "why was this matched?" explanations.
 *
 * Framework-agnostic: accepts duck-typed MatchGroup / FinRecord shapes so both
 * the harness engine and the Next.js app can reuse the same decision narrative.
 */
import type { AiDecisionProvenance, MatchMethod, MatchType } from './types.js';
import { DEFAULTS } from './config.js';

/** Stages the deterministic cascade must fail before AI residual judgment. */
export type MatchFailedStage = 'EXACT' | 'NORMALIZED' | 'FEE_NETTING';

/** Candidate signals the residual judge (or heuristic) weighed. */
export interface MatchSignals {
  amountSimilarity: boolean;
  date: boolean;
  reference: boolean;
  counterparty: boolean;
}

export interface LinkedRecordRef {
  recordId: string;
  sourceRef: string;
  kind: string;
  matchedOn: string;
}

export interface MatchExplanation {
  /** Deterministic/netting path vs AI/residual path. */
  kind: 'deterministic' | 'ai';
  /** Display label: FEE_NETTING, EXACT, NORMALIZED, REFUND_NETTED, … */
  method: string;
  matchType: MatchType;
  invoiceRef: string;
  reason: string;
  confidence: number;
  aiUsed: boolean;
  /** Netting arithmetic (magnitudes in paise) when available. */
  grossPaise?: number;
  feePaise?: number;
  taxOnFeePaise?: number;
  refundPaise?: number;
  adjustmentPaise?: number;
  expectedPaise?: number;
  settlementPaise?: number;
  differencePaise?: number;
  /** AI path: which deterministic stages failed before the judge. */
  failedStages: MatchFailedStage[];
  signals: MatchSignals;
  /** e.g. LIKELY MATCH / WEAK MATCH / UNCERTAIN */
  verdict?: string;
  humanReviewRequired: boolean;
  provenance?: AiDecisionProvenance | null;
  linkedRefs: LinkedRecordRef[];
}

/** Minimal group shape accepted by the builder (harness + app). */
export interface ExplainableGroup {
  id: string;
  key: string;
  method: MatchMethod;
  matchType: MatchType;
  confidence: number;
  reason: string;
  amountPaise: number;
  links: Array<{ recordId: string; matchedOn: string; matchType?: MatchType }>;
  recordIds?: string[];
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
  aiProvenance?: AiDecisionProvenance;
}

/** Minimal record shape accepted by the builder. */
export interface ExplainableRecord {
  id: string;
  sourceRef: string;
  kind: string;
  amountPaise: number;
  ts?: string;
  counterparty?: string;
  feeTaxPaise?: number;
}

export interface BuildMatchExplanationOptions {
  /** Judge resolve threshold (default 0.7). Below → human review. */
  resolveThreshold?: number;
}

const AI_MATCH_TYPES: ReadonlySet<MatchType> = new Set([
  'AI_RESOLVED',
  'FUZZY',
  'PARTIAL',
]);

/** Map internal matchType to the accountant-facing method label. */
export function displayMethodLabel(matchType: MatchType, method: MatchMethod): string {
  if (matchType === 'FEE_NETTED') return 'FEE_NETTING';
  if (matchType === 'REFUND_NETTED') return 'REFUND_NETTED';
  if (matchType === 'ADJUSTMENT_NETTED') return 'ADJUSTMENT_NETTED';
  if (matchType === 'AI_RESOLVED') return 'AI_RESOLVED';
  if (matchType === 'EXACT' || matchType === 'NORMALIZED') return matchType;
  if (method === 'NETTED') return 'FEE_NETTING';
  if (method === 'JUDGED') return matchType === 'FUZZY' ? 'FUZZY' : 'AI_RESOLVED';
  return matchType || method;
}

function isAiMatch(group: ExplainableGroup): boolean {
  if (group.aiProvenance) return true;
  if (group.method === 'JUDGED') return true;
  return AI_MATCH_TYPES.has(group.matchType);
}

function memberIds(group: ExplainableGroup): string[] {
  if (group.recordIds?.length) return group.recordIds;
  return group.links.map((l) => l.recordId);
}

function linkedRefs(group: ExplainableGroup, byId: Map<string, ExplainableRecord>): LinkedRecordRef[] {
  return group.links.map((link) => {
    const rec = byId.get(link.recordId);
    return {
      recordId: link.recordId,
      sourceRef: rec?.sourceRef ?? link.recordId,
      kind: rec?.kind ?? 'UNKNOWN',
      matchedOn: link.matchedOn,
    };
  });
}

function pickInvoiceRef(group: ExplainableGroup, members: ExplainableRecord[]): string {
  const invoice = members.find((r) => r.kind === 'INVOICE');
  if (invoice) return invoice.sourceRef;
  const payment = members.find((r) => r.kind === 'PAYMENT');
  if (payment) return payment.sourceRef;
  if (group.key) return group.key;
  return members[0]?.sourceRef ?? group.id;
}

function deriveNettingFromRecords(
  group: ExplainableGroup,
  members: ExplainableRecord[],
): ExplainableGroup['netting'] | undefined {
  const isNetted =
    group.method === 'NETTED' ||
    group.matchType === 'FEE_NETTED' ||
    group.matchType === 'REFUND_NETTED' ||
    group.matchType === 'ADJUSTMENT_NETTED';
  if (!isNetted) return undefined;

  const gross = members.find((r) => r.kind === 'INVOICE' || r.kind === 'PAYMENT');
  const fees = members.filter((r) => r.kind === 'FEE');
  const refunds = members.filter((r) => r.kind === 'REFUND');
  const adjustments = members.filter((r) => r.kind === 'ADJUSTMENT' || r.kind === 'CHARGEBACK');
  const settlement = members.find((r) => r.kind === 'SETTLEMENT');
  if (!gross) return undefined;

  const feePaise = fees.reduce((s, f) => s + Math.abs(f.amountPaise), 0);
  const taxOnFeePaise = fees.reduce((s, f) => s + Math.abs(f.feeTaxPaise ?? 0), 0);
  const refundPaise = refunds.reduce((s, r) => s + Math.abs(r.amountPaise), 0);
  const adjustmentPaise = adjustments.reduce((s, a) => s + a.amountPaise, 0);
  const grossPaise = Math.abs(gross.amountPaise);
  const netExpectedPaise = grossPaise - feePaise - taxOnFeePaise - refundPaise + adjustmentPaise;
  const actualSettlementPaise = settlement ? Math.abs(settlement.amountPaise) : netExpectedPaise;
  return {
    grossPaise,
    feePaise,
    taxOnFeePaise,
    refundPaise,
    adjustmentPaise,
    netExpectedPaise,
    actualSettlementPaise,
    variancePaise: actualSettlementPaise - netExpectedPaise,
  };
}

function inferSignals(group: ExplainableGroup, members: ExplainableRecord[]): MatchSignals {
  const reason = group.reason.toLowerCase();
  const matchedOns = group.links.map((l) => l.matchedOn.toLowerCase());
  const hasRef =
    matchedOns.some((m) => /utr|gateway|order|normalized|ref|invoice/.test(m)) ||
    /utr|gateway|ref|normalized/.test(reason);
  const amounts = members.map((m) => Math.abs(m.amountPaise));
  const amountOk =
    amounts.length >= 2
      ? Math.max(...amounts) - Math.min(...amounts) <= Math.max(...amounts) * 0.15 + 50
      : /amount|similarity|near/.test(reason);
  const dates = members.map((m) => m.ts).filter(Boolean) as string[];
  const dateOk =
    dates.length >= 2
      ? dates.every((d) => Math.abs(Date.parse(d) - Date.parse(dates[0]!)) <= 2 * 86_400_000)
      : /date|window|skew/.test(reason);
  const cps = members.map((m) => m.counterparty?.toLowerCase()).filter(Boolean) as string[];
  const counterpartyOk =
    cps.length >= 2 ? cps.every((c) => c === cps[0]) : /counterparty|merchant|party/.test(reason);

  return {
    amountSimilarity: amountOk || /amount|similarity/.test(reason),
    date: dateOk || /date/.test(reason),
    reference: hasRef,
    counterparty: counterpartyOk,
  };
}

function verdictFor(confidence: number, matchType: MatchType): string {
  if (matchType === 'AI_RESOLVED' || matchType === 'FUZZY' || matchType === 'PARTIAL') {
    if (confidence >= 0.85) return 'LIKELY MATCH';
    if (confidence >= 0.7) return 'PROBABLE MATCH';
    return 'UNCERTAIN';
  }
  return 'MATCHED';
}

/**
 * Build a rich explanation for a match group, suitable for the ReconAI drawer.
 */
export function buildMatchExplanation(
  group: ExplainableGroup,
  records: ExplainableRecord[],
  options: BuildMatchExplanationOptions = {},
): MatchExplanation {
  const resolveThreshold = options.resolveThreshold ?? DEFAULTS.resolveThreshold;
  const byId = new Map(records.map((r) => [r.id, r]));
  const ids = memberIds(group);
  const members = ids.map((id) => byId.get(id)).filter((r): r is ExplainableRecord => Boolean(r));
  const refs = linkedRefs(group, byId);
  const invoiceRef = pickInvoiceRef(group, members);
  const methodLabel = displayMethodLabel(group.matchType, group.method);
  const aiUsed = isAiMatch(group);
  const provenance = group.aiProvenance ?? null;

  const humanReviewRequired =
    provenance?.humanReviewRequired === true ||
    group.confidence < resolveThreshold ||
    (aiUsed && (group.matchType === 'AI_RESOLVED' || group.matchType === 'PARTIAL') && group.confidence < 0.9);

  if (aiUsed) {
    return {
      kind: 'ai',
      method: methodLabel,
      matchType: group.matchType,
      invoiceRef,
      reason: group.reason,
      confidence: group.confidence,
      aiUsed: true,
      failedStages: ['EXACT', 'NORMALIZED', 'FEE_NETTING'],
      signals: inferSignals(group, members),
      verdict: verdictFor(group.confidence, group.matchType),
      humanReviewRequired,
      provenance,
      linkedRefs: refs,
    };
  }

  const netting = group.netting ?? deriveNettingFromRecords(group, members);
  const base: MatchExplanation = {
    kind: 'deterministic',
    method: methodLabel,
    matchType: group.matchType,
    invoiceRef,
    reason: group.reason,
    confidence: group.confidence,
    aiUsed: false,
    failedStages: [],
    signals: { amountSimilarity: false, date: false, reference: false, counterparty: false },
    humanReviewRequired: false,
    provenance: null,
    linkedRefs: refs,
  };

  if (netting) {
    return {
      ...base,
      grossPaise: netting.grossPaise,
      feePaise: netting.feePaise,
      taxOnFeePaise: netting.taxOnFeePaise,
      refundPaise: netting.refundPaise,
      adjustmentPaise: netting.adjustmentPaise,
      expectedPaise: netting.netExpectedPaise,
      settlementPaise: netting.actualSettlementPaise,
      differencePaise: netting.variancePaise,
    };
  }

  return base;
}
