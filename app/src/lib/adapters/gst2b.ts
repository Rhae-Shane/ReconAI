import { parseCsv } from "@/lib/close/csv";

import type { AdapterResult, ParsedRow, RowError, SourceAdapter } from "./types";

/**
 * GSTR-2B supplier-file adapter.
 *
 * Accepts either a JSON array of objects (`gstin`, `invoiceNo`, `invoiceDate`, `taxableValue`,
 * `cgst`, `sgst`, `igst`, `totalValue`) or a CSV variant with the same columns. Each row maps to a
 * GST INVOICE record: source "gst", kind INVOICE, amountPaise = total (or taxableValue + cgst +
 * sgst + igst when totalValue is absent), sourceRef = invoiceNo, ts = invoiceDate ISO. Rows failing
 * validation (missing invoiceNo, non-numeric totals, unparseable date) are reported per-row.
 */

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const n = Number(value.replace(/[₹,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasOwn(o: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(o, key) && o[key] !== null && o[key] !== "";
}

function pick(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (hasOwn(o, k)) return o[k];
  return undefined;
}

function normalizeRow(input: {
  rowNo: number;
  invoiceNo: string;
  invoiceDate: string;
  gstin?: string;
  taxable: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  total: number | null;
  errors: RowError[];
}): ParsedRow | null {
  const errs: string[] = [];
  if (!input.invoiceNo) errs.push("missing invoiceNo");
  if (
    input.total === null &&
    (input.taxable === null || input.cgst === null || input.sgst === null || input.igst === null)
  ) {
    errs.push("non-numeric totals (need totalValue or taxableValue+cgst+sgst+igst)");
  }
  const ts = isoFromDate(input.invoiceDate);
  if (!input.invoiceDate) errs.push("missing invoiceDate");
  else if (!ts) errs.push(`unparseable invoiceDate "${input.invoiceDate}"`);

  if (errs.length > 0) {
    input.errors.push({ row: input.rowNo, message: errs.join("; ") });
    return null;
  }

  const total =
    input.total ?? (input.taxable as number) + (input.cgst as number) + (input.sgst as number) + (input.igst as number);
  return {
    source: "gst",
    kind: "INVOICE",
    sourceRef: input.invoiceNo,
    ts: ts as string,
    amountPaise: Math.round(total * 100),
    description: input.gstin ? `GSTR-2B supplier invoice (GSTIN ${input.gstin})` : "GSTR-2B supplier invoice",
    extra: input.gstin ? { gstin: input.gstin } : undefined,
  };
}

function isoFromDate(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(v);
  let d: Date;
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const year = yyyy.length === 2 ? 2000 + Number(yyyy) : Number(yyyy);
    d = new Date(Date.UTC(year, Number(mm) - 1, Number(dd)));
  } else {
    d = new Date(v);
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fromJson(list: Record<string, unknown>[]): AdapterResult {
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const o = list[i];
    const invoiceNo = String(pick(o, ["invoiceNo", "invoice_no", "invoiceNumber", "invNo"]) ?? "").trim();
    const invoiceDate = String(pick(o, ["invoiceDate", "invoice_date", "date"]) ?? "").trim();
    const gstin = String(pick(o, ["gstin", "gstIn"]) ?? "").trim();
    const taxable = toNumber(pick(o, ["taxableValue", "taxable_value", "taxable"]));
    const cgst = toNumber(pick(o, ["cgst"]));
    const sgst = toNumber(pick(o, ["sgst"]));
    const igst = toNumber(pick(o, ["igst"]));
    const total = toNumber(pick(o, ["totalValue", "total_value", "total"]));
    const row = normalizeRow({
      rowNo: i + 1,
      invoiceNo,
      invoiceDate,
      gstin: gstin || undefined,
      taxable,
      cgst,
      sgst,
      igst,
      total,
      errors,
    });
    if (row) rows.push(row);
  }
  return { source: "gst", rows, errors };
}

function fromCsv(text: string): AdapterResult {
  const parsed = parseCsv(text);
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  if (parsed.length === 0) return { source: "gst", rows, errors };

  const HINTS = ["invoiceno", "invoice_no", "gstin", "taxablevalue", "cgst", "sgst", "igst", "totalvalue"];
  const first = parsed[0] ?? [];
  const hasHeader = first.some((c) => HINTS.some((h) => c.toLowerCase().includes(h)));
  const headers = hasHeader ? first.map((c) => c.toLowerCase()) : [];
  const data = hasHeader ? parsed.slice(1) : parsed;

  const col = (needle: string) => headers.findIndex((h) => h.includes(needle));
  const cInvoiceNo = col("invoiceno");
  const cInvoiceDate = col("invoicedate");
  const cGstin = col("gstin");
  const cTaxable = col("taxablevalue");
  const cCgst = col("cgst");
  const cSgst = col("sgst");
  const cIgst = col("igst");
  const cTotal = col("totalvalue");

  const cell = (row: string[], named: number, positional: number): string => {
    const idx = hasHeader ? named : positional;
    return idx >= 0 && idx < row.length ? row[idx].trim() : "";
  };

  for (let r = 0; r < data.length; r += 1) {
    const raw = data[r];
    if (raw.every((c) => c === "")) continue;
    const rowNo = hasHeader ? r + 2 : r + 1;

    const invoiceNo = cell(raw, cInvoiceNo, 1);
    const invoiceDate = cell(raw, cInvoiceDate, 2);
    const gstin = cell(raw, cGstin, 0);
    const n = (s: string): number | null => {
      if (!s) return null;
      const v = Number(s.replace(/[₹,\s]/g, ""));
      return Number.isFinite(v) ? v : null;
    };
    const row = normalizeRow({
      rowNo,
      invoiceNo,
      invoiceDate,
      gstin: gstin || undefined,
      taxable: n(cell(raw, cTaxable, 3)),
      cgst: n(cell(raw, cCgst, 4)),
      sgst: n(cell(raw, cSgst, 5)),
      igst: n(cell(raw, cIgst, 6)),
      total: n(cell(raw, cTotal, 7)),
      errors,
    });
    if (row) rows.push(row);
  }

  return { source: "gst", rows, errors };
}

export const gst2bAdapter: SourceAdapter = {
  id: "gst2b",
  label: "GSTR-2B Supplier File",
  parse(text: string): AdapterResult {
    const trimmed = text.trimStart();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        const data = JSON.parse(text) as unknown;
        if (Array.isArray(data)) {
          return fromJson(data as Record<string, unknown>[]);
        }
        if (data && typeof data === "object") {
          const obj = data as Record<string, unknown>;
          for (const key of ["invoices", "records", "data", "items"]) {
            const v = obj[key];
            if (Array.isArray(v)) return fromJson(v as Record<string, unknown>[]);
          }
        }
      } catch {
        // Not JSON after all — fall through to the CSV variant.
      }
    }
    return fromCsv(text);
  },
};
