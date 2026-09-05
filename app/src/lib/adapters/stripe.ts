import { parseCsv, rupeeToPaise } from "@/lib/close/csv";

import type { AdapterResult, ParsedRow, RowError, SourceAdapter } from "./types";

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function col(headers: string[], needles: string[]): number {
  return headers.findIndex((h) => needles.some((n) => norm(h).includes(norm(n))));
}

function iso(raw: string): string | null {
  if (!raw.trim()) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Stripe payments export (id, Amount, Fee, Created, Customer Email, Description).
 * Amounts in the export are major units; converted to paise.
 */
export const stripeAdapter: SourceAdapter = {
  id: "stripe",
  label: "Stripe",
  parse(text: string): AdapterResult {
    const rows = parseCsv(text);
    const errors: RowError[] = [];
    const parsed: ParsedRow[] = [];
    if (rows.length === 0) return { source: "gateway", rows: parsed, errors };

    const headerIdx = rows.findIndex((r) =>
      r.some((c) => ["id", "amount", "created"].some((h) => norm(c).includes(h))),
    );
    if (headerIdx < 0) {
      errors.push({ row: 1, message: "No Stripe payments header (need id, amount, created)" });
      return { source: "gateway", rows: parsed, errors };
    }
    const headers = rows[headerIdx];
    const cId = col(headers, ["id", "chargeid", "paymentintent"]);
    const cAmt = col(headers, ["amount"]);
    const cFee = col(headers, ["fee"]);
    const cDate = col(headers, ["created", "createdutc", "date"]);
    const cEmail = col(headers, ["email", "customer"]);
    const cDesc = col(headers, ["description", "memo"]);

    rows.slice(headerIdx + 1).forEach((row, i) => {
      const rowNo = headerIdx + i + 2;
      const id = (row[cId] ?? "").trim();
      const amount = rupeeToPaise(row[cAmt]);
      const ts = iso(row[cDate] ?? "");
      if (!id || !amount || !ts) {
        errors.push({ row: rowNo, message: "missing id, amount, or created" });
        return;
      }
      parsed.push({
        source: "gateway",
        kind: "PAYMENT",
        sourceRef: id,
        ts,
        amountPaise: amount,
        description: row[cDesc] || "Stripe payment",
        counterparty: row[cEmail] || undefined,
        extra: { psp: "stripe", feePaise: rupeeToPaise(row[cFee] ?? "") },
      });
    });
    return { source: "gateway", rows: parsed, errors };
  },
};
