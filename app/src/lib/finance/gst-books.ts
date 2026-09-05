/**
 * Build internal purchase books and supplier GSTR-2B rows from close-run records.
 *
 * GSTINs come from the record itself (raw.gstin / notes) or from known counterparties:
 * Razorpay fee tax invoices use Razorpay's published GSTIN; outward supplies stamp Rhae's GSTIN.
 * Placeholder / hash-derived GSTINs are never invented.
 */

import { GSTIN_RE, orgGstin, razorpayGstin } from "@/lib/close/org";
import type { FinRecord } from "@/lib/close/types";
import type { GstB2bRow } from "@/lib/finance/gst";

export function pickGstin(raw?: Record<string, unknown> | null): string | undefined {
  if (!raw) return undefined;
  for (const key of ["gstin", "gstIn", "GSTIN", "supplierGstin", "supplier_gstin", "buyerGstin"]) {
    const v = raw[key];
    if (typeof v === "string" && GSTIN_RE.test(v.trim())) return v.trim().toUpperCase();
  }
  const notes = raw.notes;
  if (notes && typeof notes === "object") {
    return pickGstin(notes as Record<string, unknown>);
  }
  return undefined;
}

function inrSplit(
  totalPaise: number,
  taxPaise?: number,
): { taxablePaise: number; taxPaise: number; totalPaise: number } {
  const total = Math.abs(totalPaise);
  if (taxPaise != null && Number.isFinite(taxPaise) && taxPaise >= 0 && taxPaise <= total) {
    return { taxablePaise: total - taxPaise, taxPaise, totalPaise: total };
  }
  const taxable = Math.round(total / 1.18);
  return { taxablePaise: taxable, taxPaise: total - taxable, totalPaise: total };
}

function paymentIdOf(r: FinRecord): string {
  const raw = r.raw ?? {};
  const id = raw.paymentId;
  return typeof id === "string" && id ? id : r.sourceRef.replace(/^fee_/, "");
}

/**
 * Internal purchase ledger: GST invoices we booked, plus gateway fee+tax invoices.
 * Every row carries a real GSTIN (from the file, notes, or Razorpay's published GSTIN).
 */
export function internalPurchaseRows(records: FinRecord[]): GstB2bRow[] {
  const rows: GstB2bRow[] = [];
  for (const r of records) {
    if (r.source === "gst" && r.kind === "INVOICE") {
      const gstin = pickGstin(r.raw);
      if (!gstin) continue;
      const tax =
        typeof r.raw?.gstPaise === "number"
          ? r.raw.gstPaise
          : typeof r.raw?.feeTaxPaise === "number"
            ? r.raw.feeTaxPaise
            : undefined;
      const split = inrSplit(r.amountPaise, tax);
      rows.push({
        supplierGstin: gstin,
        invoiceNo: r.sourceRef,
        invoiceDate: r.ts.slice(0, 10),
        ...split,
        source: "internal",
      });
      continue;
    }
    if (r.kind === "FEE") {
      const tax = typeof r.raw?.feeTaxPaise === "number" ? Math.abs(r.raw.feeTaxPaise) : 0;
      const total = Math.abs(r.amountPaise);
      if (total === 0) continue;
      rows.push({
        supplierGstin: pickGstin(r.raw) ?? razorpayGstin(),
        invoiceNo: `RZP-FEE-${paymentIdOf(r)}`,
        invoiceDate: r.ts.slice(0, 10),
        ...inrSplit(total, tax || undefined),
        source: "internal",
      });
    }
  }
  return rows;
}

/**
 * GSTR-2B from a portal export (uploaded) or, when none is stored, from the same
 * gateway fee invoices — those tax amounts come from the PSP API, not a placeholder GSTIN.
 */
export function gstr2bFromRecords(records: FinRecord[]): GstB2bRow[] {
  const fromFile = records
    .filter((r) => r.source === "gst" && r.kind === "INVOICE")
    .flatMap((r) => {
      const gstin = pickGstin(r.raw);
      if (!gstin) return [];
      const tax = typeof r.raw?.gstPaise === "number" ? r.raw.gstPaise : undefined;
      return [
        {
          supplierGstin: gstin,
          invoiceNo: r.sourceRef,
          invoiceDate: r.ts.slice(0, 10),
          ...inrSplit(r.amountPaise, tax),
          source: "gstr2b" as const,
        },
      ];
    });
  if (fromFile.length > 0) return fromFile;

  return records
    .filter((r) => r.kind === "FEE")
    .map((r) => {
      const tax = typeof r.raw?.feeTaxPaise === "number" ? Math.abs(r.raw.feeTaxPaise) : 0;
      const total = Math.abs(r.amountPaise);
      return {
        supplierGstin: pickGstin(r.raw) ?? razorpayGstin(),
        invoiceNo: `RZP-FEE-${paymentIdOf(r)}`,
        invoiceDate: r.ts.slice(0, 10),
        ...inrSplit(total, tax || undefined),
        source: "gstr2b" as const,
      };
    })
    .filter((r) => r.totalPaise > 0);
}

export interface OutwardSupply {
  gstin?: string;
  invoiceNo: string;
  invoiceDate: string;
  taxablePaise: number;
  taxPaise: number;
  totalPaise: number;
  pos: string;
}

/** GSTR-1 outward supplies from captured payments (Rhae as supplier). */
export function outwardSupplies(records: FinRecord[]): OutwardSupply[] {
  const pos = orgGstin().slice(0, 2);
  return records
    .filter((r) => r.kind === "PAYMENT")
    .map((r) => {
      const split = inrSplit(r.amountPaise);
      return {
        gstin: pickGstin(r.raw),
        invoiceNo: r.sourceRef,
        invoiceDate: r.ts.slice(0, 10),
        ...split,
        pos,
      };
    });
}

export function parsedRowsToGst2b(
  rows: Array<{ extra?: Record<string, unknown>; sourceRef: string; ts: string; amountPaise: number }>,
): GstB2bRow[] {
  return rows.flatMap((r) => {
    const gstin = pickGstin(r.extra);
    if (!gstin) return [];
    const tax = typeof r.extra?.gstPaise === "number" ? r.extra.gstPaise : undefined;
    return [
      {
        supplierGstin: gstin,
        invoiceNo: r.sourceRef,
        invoiceDate: r.ts.slice(0, 10),
        ...inrSplit(r.amountPaise, tax),
        source: "gstr2b" as const,
      },
    ];
  });
}
