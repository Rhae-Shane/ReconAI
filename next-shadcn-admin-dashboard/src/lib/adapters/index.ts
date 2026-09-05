import { bankAdapter } from "./bank";
import { gst2bAdapter } from "./gst2b";
import { razorpayAdapter } from "./razorpay";
import type { AdapterResult, SourceAdapter } from "./types";

/**
 * Branded source adapter registry.
 *
 * Callers resolve a vendor source name ("razorpay" | "bank" | "gst2b") to a `SourceAdapter` via
 * `adapterFor`, then ask its `parse(text)` for normalized rows + per-row errors. `rowErrorSummary`
 * renders a compact human report ("rows X, Y failed: ...") for the upload route response.
 */

const REGISTRY: Record<string, SourceAdapter> = {
  razorpay: razorpayAdapter,
  bank: bankAdapter,
  gst2b: gst2bAdapter,
};

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
export { bankAdapter, gst2bAdapter, razorpayAdapter };
