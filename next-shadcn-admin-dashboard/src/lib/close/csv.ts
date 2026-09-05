import type { FinKind, FinRecord, SourceKind } from "./types";

/**
 * CSV ingestion for the Controller close loop.
 *
 * Parses three raw export matrices into normalized `FinRecord` rows (integer paise),
 * so uploaded files flow through the same store reconciliation as the synthetic batch.
 *
 * Drop-in, framework-agnostic: only depends on the local type module (no runtime deps).
 * Handles quoted fields, `₹`/comma/space formatting, negative amounts, and blank/short
 * rows. The first row is treated as a header when it looks like one; otherwise columns
 * are read positionally.
 */

const SOURCE_NAMES: Record<SourceKind, string> = {
  gateway: "Razorpay Gateway",
  bank: "Bank UTR",
  erp: "ERP Orders",
  gst: "GST Invoices",
};

interface CsvColumnMap {
  headers: string[];
  position: Record<string, number>;
  hasHeader: boolean;
}

/** Robust CSV parser: handles quotes, escaped quotes, CRLF, and trailing newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const s = text;

  for (i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c === "\r") {
      // skip CR
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ""));
}

/** Convert a CSV cell (rupees, possibly `1,234.50`, `₹`, negative) to integer paise. */
export function rupeeToPaise(value: string | undefined): number {
  const cleaned = (value ?? "").replace(/[₹\s,]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Map a row's cells to named columns, honoring a header row or positional fallbacks. */
function columnMap(rows: string[][], knownKeys: string[]): { rows: string[][]; map: CsvColumnMap } {
  const first = rows[0] ?? [];
  const hasHeader = first.some((cell) => {
    const lower = cell.toLowerCase();
    return knownKeys.some((k) => lower.includes(k));
  });

  const headers = hasHeader ? first.map((h) => h.toLowerCase()) : [];
  const position: Record<string, number> = {};
  if (hasHeader) {
    for (const key of knownKeys) {
      const idx = headers.findIndex((h) => h.includes(key));
      if (idx >= 0) position[key] = idx;
    }
  }
  return { rows: hasHeader ? rows.slice(1) : rows, map: { headers, position, hasHeader } };
}

function pickRow(map: CsvColumnMap, row: string[], keys: string[], positional: number): string | undefined {
  if (map.hasHeader) {
    for (const key of keys) {
      const idx = map.position[key];
      if (idx >= 0 && idx < row.length && row[idx] !== "") return row[idx];
    }
    return undefined;
  }
  return row[positional];
}

let counter = 0;

function makeRecord(input: {
  source: SourceKind;
  kind: FinKind;
  sourceRef: string;
  amountPaise: number;
  ts: string;
  counterparty?: string;
  description?: string;
  raw?: Record<string, unknown>;
}): FinRecord {
  counter += 1;
  return {
    id: `rec_${input.source}_${counter}`,
    source: input.source,
    sourceName: SOURCE_NAMES[input.source],
    kind: input.kind,
    sourceRef: input.sourceRef,
    ts: input.ts,
    amountPaise: input.amountPaise,
    currency: "INR",
    counterparty: input.counterparty,
    description: input.description,
    raw: input.raw ?? {},
  };
}

function dateTs(value: string | undefined): string {
  const ts = (value ?? "").trim();
  if (!ts) return new Date().toISOString();
  return ts;
}

/** payments.csv -> gateway PAYMENT records (paymentId, orderId, amount, fee, settlementId, settlementDate, ...). */
function parsePayments(text: string): FinRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const { rows: data, map } = columnMap(rows, ["paymentid", "settlementid", "customer", "amount"]);
  const out: FinRecord[] = [];

  for (const row of data) {
    const paymentId = pickRow(map, row, ["paymentid", "payment_id", "id"], 0) ?? "";
    const amount = rupeeToPaise(pickRow(map, row, ["amount"], 2));
    if (!paymentId || amount === 0) continue;

    const settlementId = pickRow(map, row, ["settlementid", "settlement_id"], 4) ?? "";
    const orderId = pickRow(map, row, ["orderid", "order_id"], 1) ?? "";
    const fee = rupeeToPaise(pickRow(map, row, ["fee"], 3));
    const customer = pickRow(map, row, ["customer"], 6) ?? "";
    const ts = dateTs(pickRow(map, row, ["date", "settlementdate", "createdat"], 5));

    out.push(
      makeRecord({
        source: "gateway",
        kind: "PAYMENT",
        sourceRef: paymentId,
        amountPaise: amount,
        ts,
        counterparty: customer || undefined,
        description: "Gateway payment",
        raw: { paymentId, orderId, settlementId, feePaise: fee, netPaise: amount - fee },
      }),
    );
  }
  return out;
}

/** settlements.csv -> bank SETTLEMENT records (settlementId, amount, date). */
function parseSettlements(text: string): FinRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const { rows: data, map } = columnMap(rows, ["settlementid", "settlement_id", "amount"]);
  const out: FinRecord[] = [];

  for (const row of data) {
    const settlementId = pickRow(map, row, ["settlementid", "settlement_id", "id"], 0) ?? "";
    const amount = rupeeToPaise(pickRow(map, row, ["amount"], 1));
    if (!settlementId || amount === 0) continue;

    const ts = dateTs(pickRow(map, row, ["date", "settlementdate"], 2));
    out.push(
      makeRecord({
        source: "bank",
        kind: "SETTLEMENT",
        sourceRef: settlementId,
        amountPaise: amount,
        ts,
        description: "Bank settlement",
        raw: { settlementId },
      }),
    );
  }
  return out;
}

/** invoices.csv -> gst INVOICE records (invoiceId -> "INV-...", customer, amount, gst, paymentDate). */
function parseInvoices(text: string): FinRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const { rows: data, map } = columnMap(rows, ["invoiceid", "invoice_id", "customer", "amount"]);
  const out: FinRecord[] = [];

  for (const row of data) {
    const invoiceId = pickRow(map, row, ["invoiceid", "invoice_id", "id"], 0) ?? "";
    const amount = rupeeToPaise(pickRow(map, row, ["amount"], 2));
    if (!invoiceId || amount === 0) continue;

    const customer = pickRow(map, row, ["customer"], 1) ?? "";
    const gst = rupeeToPaise(pickRow(map, row, ["gst", "gstamount"], 3));
    const ref = invoiceId.toUpperCase().startsWith("INV-") ? invoiceId.toUpperCase() : `INV-${invoiceId.toUpperCase()}`;
    const ts = dateTs(pickRow(map, row, ["paymentdate", "date", "invoicedate"], 4));

    out.push(
      makeRecord({
        source: "gst",
        kind: "INVOICE",
        sourceRef: ref,
        amountPaise: amount + gst,
        ts,
        counterparty: customer || undefined,
        description: `GST invoice (tax ${(gst / 100).toFixed(2)})`,
        raw: { invoiceId, customer, gstPaise: gst },
      }),
    );
  }
  return out;
}

/**
 * Parse the three upload matrices into normalized FinRecords.
 * Blank/absent inputs return no records for that matrix.
 */
export function parseCsvUpload(payments: string, settlements: string, invoices: string): FinRecord[] {
  return [...parsePayments(payments), ...parseSettlements(settlements), ...parseInvoices(invoices)];
}
