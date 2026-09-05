import type { FinKind, FinRecord, SourceKind } from "@/lib/close/types";

import { bankAdapter } from "./bank";
import { gst2bAdapter } from "./gst2b";
import { payuAdapter } from "./payu";
import { razorpayAdapter } from "./razorpay";
import { stripeAdapter } from "./stripe";
import type { AdapterResult, ParsedRow, SourceAdapter } from "./types";

/**
 * Branded source adapter registry (Razorpay + Stripe + PayU + bank + GSTR-2B).
 */

const REGISTRY: Record<string, SourceAdapter> = {
  razorpay: razorpayAdapter,
  stripe: stripeAdapter,
  payu: payuAdapter,
  bank: bankAdapter,
  gst2b: gst2bAdapter,
};

const SOURCES: SourceKind[] = ["gateway", "bank", "erp", "gst"];
const KINDS: FinKind[] = ["PAYMENT", "SETTLEMENT", "REFUND", "FEE", "INVOICE", "CHARGEBACK", "ADJUSTMENT"];

export function toFinRecords(result: AdapterResult, sourceName?: string): FinRecord[] {
  const name = sourceName ?? adapterFor(result.source)?.label ?? result.source;
  return result.rows.map((row: ParsedRow, i) => {
    const source = (SOURCES as string[]).includes(row.source) ? (row.source as SourceKind) : "gateway";
    const kind = (KINDS as string[]).includes(row.kind) ? (row.kind as FinKind) : "PAYMENT";
    return {
      id: `rec:${result.source}:${row.sourceRef}:${i}`,
      source,
      sourceName: name,
      kind,
      sourceRef: row.sourceRef,
      ts: row.ts,
      amountPaise: row.amountPaise,
      currency: "INR",
      counterparty: row.counterparty,
      description: row.description,
      raw: row.extra ?? {},
    };
  });
}

/** Resolve a source id to its adapter (case-insensitive), or null when unknown/empty. */
export function adapterFor(id: string): SourceAdapter | null {
  if (!id) return null;
  return REGISTRY[id.toLowerCase()] ?? null;
}

/** Compact human report: how many rows parsed and why rejected rows failed. */
export function rowErrorSummary(result: AdapterResult): string {
  const { rows, errors } = result;
  if (errors.length === 0) {
    return `rows ${rows.length}, 0 failed`;
  }
  const first = errors[0];
  const more = errors.length > 1 ? ` (${errors.length - 1} more)` : "";
  if (rows.length === 0) {
    return `rows 0, ${errors.length} failed: row ${first.row} ${first.message}${more}`;
  }
  return `rows ${rows.length}, ${errors.length} failed: row ${first.row} ${first.message}${more}`;
}

export type { AdapterResult, ParsedRow, RowError, SourceAdapter } from "./types";
export { bankAdapter, gst2bAdapter, payuAdapter, razorpayAdapter, stripeAdapter };
