/**
 * ingest.ts — IngestService.normalize: turns heterogeneous raw export rows
 * (gateway captures, bank UTR rows, ERP orders, GST invoices) into one
 * `FinRecord` shape. Idempotent by `(source, sourceRef)`; repeated rows are
 * surfaced as DUPLICATE hits rather than silently re-appended.
 */
import type {
  FinanceConfig,
  FinRecord,
  RawRow,
  RecordKind,
  SourceData,
  SourceKind,
} from './types.js';
import { resolveConfig } from './config.js';

const SOURCES: readonly SourceKind[] = [
  'razorpay-gateway',
  'bank-utr',
  'erp-orders',
  'gst-invoices',
];

/** A row we already saw for the same (source, sourceRef). */
export interface DuplicateHit {
  source: SourceKind;
  sourceRef: string;
  /** The id of the record we kept (the first instance). */
  recordId: string;
  /** The kept record, for exception provenance. */
  record: FinRecord;
}

/** Convert a rupee (decimal or string) amount to integer paise. */
export function rupeesToPaise(v: unknown): number {
  if (typeof v === 'number') return Math.round(v * 100);
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(n)) return Math.round(n * 100);
  }
  return 0;
}

function dateSlice(v: unknown): string {
  const s = String(v ?? '').trim();
  return s.slice(0, 10); // "YYYY-MM-DD"
}

/**
 * Deterministic record id. Because it derives only from (source, sourceRef),
 * calling normalize twice yields the same id — that is the idempotency contract.
 */
export function recordId(source: SourceKind, sourceRef: string): string {
  return `rec:${source}:${sourceRef}`;
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

/**
 * Map a raw row for a given source to a normalized FinRecord (pure).
 */
export function buildRecord(raw: RawRow, source: SourceKind): FinRecord {
  const id = recordId(source, String(raw.sourceRef ?? ''));
  const base = { id, source, raw };
  switch (source) {
    case 'razorpay-gateway': {
      // Cost / flow legs on a parent movement are flagged by an explicit
      // `kind` marker (`kind: 'FEE' | 'REFUND' | 'ADJUSTMENT'` or `fee: true`)
      // so those `RecordKind`s surface into the engine and the netting pass can
      // consume them as drivers. Unmarked rows are ordinary payments.
      const rawKind = str(raw.kind);
      const isFee = rawKind === 'FEE' || raw.fee === true;
      const kind: RecordKind =
        rawKind === 'FEE'
          ? 'FEE'
          : rawKind === 'REFUND'
            ? 'REFUND'
            : rawKind === 'ADJUSTMENT'
              ? 'ADJUSTMENT'
              : 'PAYMENT';
      const srcRef = isFee
        ? (str(raw.feeRef) ?? `fee-${String(raw.paymentId ?? '').replace(/[^A-Za-z0-9]/g, '')}`)
        : (str(raw.paymentId) ?? String(raw.sourceRef ?? ''));
      const gatewayRef = str(raw.paymentId) ?? srcRef;
      // Tax (GST/IGST) charged ON a gateway fee — preserved so the netting pass
      // sees it in the NettingBreakdown (gross − fee − taxOnFee = settlement).
      const feeTaxPaise =
        typeof raw.feeTaxPaise === 'number' && Number.isFinite(raw.feeTaxPaise)
          ? Math.abs(raw.feeTaxPaise)
          : typeof raw.feeTaxPaise === 'string'
            ? Math.abs(Number(raw.feeTaxPaise.replace(/[^0-9.-]/g, '')) || 0)
            : undefined;
      return {
        ...base,
        id: recordId(source, srcRef),
        kind,
        sourceRef: srcRef,
        ts: dateSlice(raw.date),
        amountPaise: rupeesToPaise(raw.amount),
        currency: str(raw.currency) ?? 'INR',
        counterparty: str(raw.customer),
        description: str(raw.description) ?? str(raw.method),
        utr: str(raw.utr),
        gatewayRef,
        orderRef: str(raw.orderId),
        ...(feeTaxPaise !== undefined ? { feeTaxPaise } : {}),
      };
    }
    case 'bank-utr': {
      const utr = str(raw.utr) ?? String(raw.sourceRef ?? '');
      return {
        ...base,
        id: recordId(source, utr),
        kind: 'SETTLEMENT',
        sourceRef: utr,
        ts: dateSlice(raw.date),
        amountPaise: rupeesToPaise(raw.amount),
        currency: 'INR',
        counterparty: str(raw.counterparty),
        description: str(raw.narration),
        utr,
      };
    }
    case 'erp-orders': {
      const srcRef = str(raw.orderId) ?? String(raw.sourceRef ?? '');
      return {
        ...base,
        id: recordId(source, srcRef),
        kind: 'PAYMENT',
        sourceRef: srcRef,
        ts: dateSlice(raw.date),
        amountPaise: rupeesToPaise(raw.amount),
        currency: 'INR',
        counterparty: str(raw.customer),
        description: str(raw.item) ?? str(raw.note),
        gatewayRef: str(raw.paymentId),
        orderRef: srcRef,
      };
    }
    case 'gst-invoices': {
      const srcRef = str(raw.invoiceNo) ?? String(raw.sourceRef ?? '');
      return {
        ...base,
        id: recordId(source, srcRef),
        kind: 'INVOICE',
        sourceRef: srcRef,
        ts: dateSlice(raw.date),
        amountPaise: rupeesToPaise(raw.amount),
        currency: 'INR',
        counterparty: str(raw.buyer),
        description: str(raw.description) ?? str(raw.item),
        orderRef: str(raw.orderId),
      };
    }
    default:
      throw new Error(`Unknown source: ${String(source)}`);
  }
}

const SOURCE_SET = new Set<string>(SOURCES);

export class IngestService {
  private seen = new Map<string, FinRecord>();
  private dup: DuplicateHit[] = [];
  private cfg: FinanceConfig;

  constructor(cfg?: Partial<FinanceConfig>) {
    this.cfg = resolveConfig(cfg);
  }

  get duplicates(): ReadonlyArray<DuplicateHit> {
    return this.dup;
  }

  reset(): void {
    this.seen.clear();
    this.dup = [];
  }

  /**
   * Normalize one raw row. If (source, sourceRef) was already normalized,
   * returns the existing record and records a DUPLICATE hit — idempotent.
   */
  normalize(raw: RawRow, source: SourceKind): FinRecord {
    const rec = buildRecord(raw, source);
    if (!SOURCE_SET.has(source)) {
      throw new Error(`Unknown source kind: ${source}`);
    }
    const key = `${rec.source}::${rec.sourceRef}`;
    const existing = this.seen.get(key);
    if (existing) {
      this.dup.push({
        source,
        sourceRef: rec.sourceRef,
        recordId: existing.id,
        record: existing,
      });
      return existing;
    }
    this.seen.set(key, rec);
    return rec;
  }

  /** Normalize an entire batch of source data; returns distinct records. */
  ingestAll(sources: SourceData[]): FinRecord[] {
    const out: FinRecord[] = [];
    for (const sd of sources) {
      for (const row of sd.rows) {
        const rec = this.normalize(row, sd.source);
        // Only append the first instance (dedupe handled above).
        if (!out.some((r) => r.id === rec.id)) out.push(rec);
      }
    }
    return out;
  }
}
