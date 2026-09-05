/**
 * Self-serve CSV column mapper: map arbitrary headers onto FinRecord fields.
 */

import { parseCsv, rupeeToPaise } from "@/lib/close/csv";
import type { FinKind, FinRecord, SourceKind } from "@/lib/close/types";

export const MAP_TARGETS = [
  "sourceRef",
  "amount",
  "date",
  "counterparty",
  "gstin",
  "kind",
  "utr",
  "description",
] as const;
export type MapTarget = (typeof MAP_TARGETS)[number];

export type ColumnMapping = Partial<Record<MapTarget, string>>;

const HINTS: Record<MapTarget, string[]> = {
  sourceRef: ["paymentid", "payment_id", "id", "invoice", "source_ref", "ref", "utr", "txn"],
  amount: ["amount", "net", "source_amount", "total", "value"],
  date: ["date", "created", "settled", "invoice_date", "when"],
  counterparty: ["customer", "email", "counterparty", "name", "who"],
  gstin: ["gstin", "gst_in", "taxid"],
  kind: ["kind", "type", "txn_type"],
  utr: ["utr", "bank_ref", "rrn"],
  description: ["description", "narration", "memo"],
};

export function detectHeaders(text: string): string[] {
  const rows = parseCsv(text);
  return rows[0] ?? [];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function suggestMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  for (const target of MAP_TARGETS) {
    const hit = headers.find((h) => {
      if (used.has(h)) return false;
      const n = norm(h);
      return HINTS[target].some((hint) => n.includes(norm(hint)));
    });
    if (hit) {
      mapping[target] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

function cell(row: string[], headers: string[], header: string | undefined): string {
  if (!header) return "";
  const idx = headers.findIndex((h) => h === header || norm(h) === norm(header));
  return idx >= 0 ? (row[idx] ?? "") : "";
}

const KINDS: FinKind[] = ["PAYMENT", "SETTLEMENT", "REFUND", "FEE", "INVOICE", "CHARGEBACK", "ADJUSTMENT"];

function asKind(raw: string): FinKind {
  const u = raw.trim().toUpperCase();
  return (KINDS as string[]).includes(u) ? (u as FinKind) : "PAYMENT";
}

export function applyColumnMapping(
  text: string,
  mapping: ColumnMapping,
  source: SourceKind = "gateway",
  sourceName = "CSV upload",
): FinRecord[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0];
  const data = rows.slice(1);
  const out: FinRecord[] = [];
  let i = 0;
  for (const row of data) {
    const sourceRef = cell(row, headers, mapping.sourceRef);
    const amountPaise = rupeeToPaise(cell(row, headers, mapping.amount));
    if (!sourceRef || amountPaise === 0) continue;
    i += 1;
    const gstin = cell(row, headers, mapping.gstin);
    const utr = cell(row, headers, mapping.utr);
    const tsRaw = cell(row, headers, mapping.date);
    const ts = tsRaw ? new Date(tsRaw).toISOString() : new Date().toISOString();
    out.push({
      id: `rec:map:${source}:${i}`,
      source,
      sourceName,
      kind: asKind(cell(row, headers, mapping.kind)),
      sourceRef,
      ts: Number.isNaN(Date.parse(ts)) ? new Date().toISOString() : ts,
      amountPaise,
      currency: "INR",
      counterparty: cell(row, headers, mapping.counterparty) || undefined,
      description: cell(row, headers, mapping.description) || undefined,
      raw: { gstin: gstin || undefined, utr: utr || undefined, mapped: true },
    });
  }
  return out;
}

export const CSV_TEMPLATE = `payment_id,amount,date,customer,gstin,kind,utr,description
pay_demo_1,1500.00,2026-09-01T10:00:00Z,ada@rhae.in,27AABCR0001R1Z5,PAYMENT,,Rhae checkout
setl_demo_1,1470.00,2026-09-02T10:00:00Z,,,SETTLEMENT,UTR123456789,Bank credit
`;
