/**
 * GST 2A/2B reconciliation primitives (Razorpay / India finance context).
 *
 * GSTR-2B is the supplier-side view pulled from the GST portal: every input (purchase)
 * invoice a supplier reported against your GSTIN. Reconciling it against your internal
 * books tells you which input tax credits (ITC) you can claim confidently (present on
 * both sides), and which are at risk:
 *
 *   - a supplier invoice on 2B that your books never booked   -> missed ITC (shortfall)
 *   - an internal invoice not reported on 2B by the supplier  -> unclaimed / surplus
 *
 * Deterministic, dependency-free, money as integer paise (sign: + inflow / - outflow).
 * This module is shared safe: no client-only imports.
 */

export interface GstB2bRow {
  supplierGstin: string;
  invoiceNo: string;
  invoiceDate: string;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  /** Which ledger this row came from. */
  source: "gstr2b" | "internal";
}

export interface Gst2BReconcileResult {
  /** gstr2b rows that also exist in the internal books (ITC confidently eligible). */
  matched: GstB2bRow[];
  /**
   * gstr2b rows not found internally (potential missed ITC) PLUS internal rows not found
   * on gstr2b (unclaimed). Every non-matching row lands here so nothing is silently dropped.
   */
  unmatched: GstB2bRow[];
  /** gstr2b matched / gstr2b count (0..1). */
  matchRate: number;
  /** Sum of totalPaise over matched rows — ITC you can safely claim. */
  itcEligiblePaise: number;
  /** Sum of totalPaise over gstr2b rows missing from internal books — potential shortfall. */
  itcShortfallPaise: number;
}

/** Case-insensitive composite key: (supplierGstin, invoiceNo). */
function rowKey(r: Pick<GstB2bRow, "supplierGstin" | "invoiceNo">): string {
  return `${r.supplierGstin.trim().toLowerCase()}|${r.invoiceNo.trim().toLowerCase()}`;
}

/**
 * Match internal invoices against supplier GSTR-2B rows on (supplierGstin + invoiceNo),
 * normalized case-insensitively.
 */
export function reconcileGst2BByInvoice(gstr2b: GstB2bRow[], internal: GstB2bRow[]): Gst2BReconcileResult {
  const internalKeys = new Set(internal.map(rowKey));
  const gstr2bKeys = new Set(gstr2b.map(rowKey));

  const matched = gstr2b.filter((r) => internalKeys.has(rowKey(r)));
  const unmatchedFrom2b = gstr2b.filter((r) => !internalKeys.has(rowKey(r)));
  const unclaimed = internal.filter((r) => !gstr2bKeys.has(rowKey(r)));

  return {
    matched,
    unmatched: [...unmatchedFrom2b, ...unclaimed],
    matchRate: gstr2b.length ? matched.length / gstr2b.length : 0,
    itcEligiblePaise: matched.reduce((sum, r) => sum + r.totalPaise, 0),
    itcShortfallPaise: unmatchedFrom2b.reduce((sum, r) => sum + r.totalPaise, 0),
  };
}

export interface Gst2BSummary {
  count: number;
  totalPaise: number;
  taxPaise: number;
}

/** Plain totals (count / total invoice value / GST tax) over a set of rows. */
export function gst2bSummary(rows: GstB2bRow[]): Gst2BSummary {
  return {
    count: rows.length,
    totalPaise: rows.reduce((sum, r) => sum + r.totalPaise, 0),
    taxPaise: rows.reduce((sum, r) => sum + r.taxPaise, 0),
  };
}
