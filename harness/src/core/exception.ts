/**
 * exception.ts — ExceptionLedger: append-only, never-deleted store of every
 * unresolved record, each with a machine reason code + human rationale. This is
 * the "honesty" backbone — nothing is silently dropped.
 */
import type {
  ExceptionRecord,
  FinRecord,
  MatchType,
  ReasonCode,
} from './types.js';
import { randomUUID } from 'node:crypto';
import { isCriticalException } from '../control/sod.js';

/** Optional enrichment for an exception — the review-P1 "why it varies". */
export interface ExceptionMeta {
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
  critical?: boolean;
}

export class ExceptionLedger {
  private items: ExceptionRecord[] = [];

  constructor(private runId = '') {}

  get all(): ReadonlyArray<ExceptionRecord> {
    return this.items;
  }

  clear(): void {
    this.items = [];
  }

  /** Set the run id to stamp onto future records (CloseEngine sets it). */
  setRunId(runId: string): void {
    this.runId = runId;
  }

  /**
   * Add an exception for the given record. `candidateIds` lists the records it
   * nearly matched (for human review); `meta` carries the honest expected-vs-
   * actual breakdown (P1 enrichment). Never a no-op if a record is genuinely
   * unresolved.
   */
  add(
    record: FinRecord | null,
    reasonCode: ReasonCode,
    rationale: string,
    candidateIds: string[] = [],
    meta: ExceptionMeta = {},
    status: ExceptionRecord['status'] = 'OPEN',
  ): ExceptionRecord {
    const rec: ExceptionRecord = {
      id: `exc-${randomUUID()}`,
      runId: this.runId,
      recordId: record ? record.id : null,
      recordJson: record ? toJson(record) : {},
      reasonCode,
      rationale,
      candidateIds,
      ...meta, // spreads only the enriched keys provided
      status,
      createdAt: new Date().toISOString(),
      resolutionStatus: 'OPEN',
      critical: isCriticalException({
        reasonCode,
        variancePaise: meta.variancePaise,
        critical: (meta as { critical?: boolean }).critical,
      }),
    };
    this.items.push(rec);
    return rec;
  }

  count(): number {
    return this.items.length;
  }

  byCode(code: ReasonCode): ExceptionRecord[] {
    return this.items.filter((e) => e.reasonCode === code);
  }
}

function toJson(record: FinRecord): Record<string, unknown> {
  return {
    id: record.id,
    source: record.source,
    sourceRef: record.sourceRef,
    ts: record.ts,
    amountPaise: record.amountPaise,
    currency: record.currency,
    counterparty: record.counterparty,
    description: record.description,
    utr: record.utr,
    gatewayRef: record.gatewayRef,
    orderRef: record.orderRef,
  };
}
