import { parseCsv, rupeeToPaise } from "@/lib/close/csv";

import type { AdapterResult, ParsedRow, RowError, SourceAdapter } from "./types";

/**
 * Razorpay export adapter (settlements CSV *or* payments CSV).
 *
 * Settlement columns (Dashboard → Settlements → Export): settlement_id, settle_time /
 * settle_date, utr, source_amount, fee, tax_on_fee, net_amount, order_ref / invoice.
 * Each row becomes a gateway SETTLEMENT (amount from net_amount, else source_amount).
 *
 * Payments columns (Dashboard → Payments → Export): payment_id / id, amount, created_at,
 * fee, tax, order_id, email. Each row becomes a gateway PAYMENT. Settlement headers win
 * when both hint-sets appear so an existing settlement export is unchanged.
 */

/** Collapse spaces/underscores/dashes so "Settlement ID" matches "settlement_id". */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const SETTLEMENT_HINTS = ["settlementid", "settletime", "settledate"];
const PAYMENT_HINTS = ["paymentid", "payment_id", "orderid"];

type ExportKind = "settlement" | "payment";

function findHeader(rows: string[][]): { idx: number; headers: string[]; kind: ExportKind } | null {
  for (let i = 0; i < rows.length; i += 1) {
    const headers = rows[i].map(norm);
    const isSettlement = SETTLEMENT_HINTS.some((h) => headers.some((c) => c.includes(h)));
    const isPayment = PAYMENT_HINTS.some((h) => headers.some((c) => c.includes(h)));
    if (isSettlement || isPayment) {
      return {
        idx: i,
        headers: rows[i].map((c) => c.toLowerCase()),
        kind: isSettlement ? "settlement" : "payment",
      };
    }
  }
  return null;
}

function col(headers: string[], needle: string): number {
  const n = norm(needle);
  return headers.findIndex((h) => norm(h).includes(n));
}

function cellAt(row: string[], idx: number): string {
  return idx >= 0 && idx < row.length ? row[idx] : "";
}

function parseSettleTs(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseSettlementExport(
  parsed: string[][],
  idx: number,
  headers: string[],
): { rows: ParsedRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  const cSettleId = col(headers, "settlement_id");
  const cSettleTime = col(headers, "settle_time");
  const cSettleDate = col(headers, "settle_date");
  const cUtr = col(headers, "utr");
  const cSourceAmount = col(headers, "source_amount");
  const cFee = col(headers, "fee");
  const cTaxOnFee = col(headers, "tax_on_fee");
  const cNet = col(headers, "net_amount");
  const cOrderRef = col(headers, "order_ref");
  const cInvoice = col(headers, "invoice");

  for (let r = idx + 1; r < parsed.length; r += 1) {
    const raw = parsed[r];
    if (raw.every((c) => c === "")) continue;
    const rowNo = r + 1;
    const rowErrs: string[] = [];

    const settleId = cellAt(raw, cSettleId).trim();
    if (!settleId) rowErrs.push("missing settlement_id");

    const netStr = cellAt(raw, cNet).trim();
    const srcStr = cellAt(raw, cSourceAmount).trim();
    const amountStr = netStr || srcStr || "";
    if (!amountStr) rowErrs.push("missing amount (net_amount / source_amount)");
    else if (!Number.isFinite(Number(amountStr.replace(/[₹\s,]/g, "")))) {
      rowErrs.push(`non-numeric amount "${amountStr}"`);
    }
    const amount = rupeeToPaise(amountStr);

    const tsStr = cellAt(raw, cSettleTime).trim() || cellAt(raw, cSettleDate).trim();
    const ts = parseSettleTs(tsStr);
    if (!tsStr) rowErrs.push("missing date (settle_time / settle_date)");
    else if (!ts) rowErrs.push(`unparseable date "${tsStr}"`);

    if (rowErrs.length > 0) {
      errors.push({ row: rowNo, message: rowErrs.join("; ") });
      continue;
    }

    const feeStr = cellAt(raw, cFee).trim();
    const taxStr = cellAt(raw, cTaxOnFee).trim();
    const feePaise = rupeeToPaise(feeStr);
    const taxPaise = rupeeToPaise(taxStr);
    const extra: Record<string, unknown> = {};
    if (feeStr) extra.feePaise = feePaise;
    if (taxStr) extra.feeTaxPaise = taxPaise;
    const utr = cellAt(raw, cUtr).trim();
    if (utr) extra.utr = utr;
    const orderRef = cellAt(raw, cOrderRef).trim();
    if (orderRef) extra.orderRef = orderRef;
    const invoice = cellAt(raw, cInvoice).trim();
    if (invoice) extra.invoice = invoice;

    rows.push({
      source: "gateway",
      kind: "SETTLEMENT",
      sourceRef: settleId,
      ts: ts as string,
      amountPaise: amount,
      description: taxPaise ? "Razorpay settlement (net of fee + tax on fee)" : "Razorpay settlement",
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    });
  }
  return { rows, errors };
}

function parsePaymentExport(
  parsed: string[][],
  idx: number,
  headers: string[],
): { rows: ParsedRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  const cPayId = col(headers, "payment_id") >= 0 ? col(headers, "payment_id") : col(headers, "id");
  const cAmount = col(headers, "amount");
  const cFee = col(headers, "fee");
  const cTax = col(headers, "tax");
  const cOrder = col(headers, "order_id");
  const cEmail = col(headers, "email");
  const cCreated = col(headers, "created_at") >= 0 ? col(headers, "created_at") : col(headers, "created");

  for (let r = idx + 1; r < parsed.length; r += 1) {
    const raw = parsed[r];
    if (raw.every((c) => c === "")) continue;
    const rowNo = r + 1;
    const rowErrs: string[] = [];

    const paymentId = cellAt(raw, cPayId).trim();
    if (!paymentId) rowErrs.push("missing payment_id");

    const amountStr = cellAt(raw, cAmount).trim();
    if (!amountStr) rowErrs.push("missing amount");
    else if (!Number.isFinite(Number(amountStr.replace(/[₹\s,]/g, "")))) {
      rowErrs.push(`non-numeric amount "${amountStr}"`);
    }
    const amount = rupeeToPaise(amountStr);

    const tsStr = cellAt(raw, cCreated).trim();
    const ts = parseSettleTs(tsStr);
    if (!tsStr) rowErrs.push("missing date (created_at)");
    else if (!ts) rowErrs.push(`unparseable date "${tsStr}"`);

    if (rowErrs.length > 0) {
      errors.push({ row: rowNo, message: rowErrs.join("; ") });
      continue;
    }

    const extra: Record<string, unknown> = {};
    const feeStr = cellAt(raw, cFee).trim();
    const taxStr = cellAt(raw, cTax).trim();
    if (feeStr) extra.feePaise = rupeeToPaise(feeStr);
    if (taxStr) extra.feeTaxPaise = rupeeToPaise(taxStr);
    const orderId = cellAt(raw, cOrder).trim();
    if (orderId) extra.orderId = orderId;
    extra.paymentId = paymentId;

    rows.push({
      source: "gateway",
      kind: "PAYMENT",
      sourceRef: paymentId,
      ts: ts as string,
      amountPaise: amount,
      counterparty: cellAt(raw, cEmail).trim() || undefined,
      description: "Razorpay payment",
      extra: Object.keys(extra).length > 0 ? extra : undefined,
    });
  }
  return { rows, errors };
}

export const razorpayAdapter: SourceAdapter = {
  id: "razorpay",
  label: "Razorpay",
  parse(text: string): AdapterResult {
    const source = "gateway";
    const parsed = parseCsv(text);
    const header = findHeader(parsed);
    if (!header) {
      return {
        source,
        rows: [],
        errors: [
          {
            row: 1,
            message: "No Razorpay settlement or payments header found (expected settlement_id / payment_id).",
          },
        ],
      };
    }
    const parsedRows =
      header.kind === "payment"
        ? parsePaymentExport(parsed, header.idx, header.headers)
        : parseSettlementExport(parsed, header.idx, header.headers);
    return { source, ...parsedRows };
  },
};
