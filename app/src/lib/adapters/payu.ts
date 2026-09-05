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
 * PayU settlement / transaction export (mihpayid, amount, addedon, email, status).
 */
export const payuAdapter: SourceAdapter = {
  id: "payu",
  label: "PayU",
  parse(text: string): AdapterResult {
    const rows = parseCsv(text);
    const errors: RowError[] = [];
    const parsed: ParsedRow[] = [];
    if (rows.length === 0) return { source: "gateway", rows: parsed, errors };

    const headerIdx = rows.findIndex((r) =>
      r.some((c) => ["mihpayid", "txnid", "payuid"].some((h) => norm(c).includes(h))),
    );
    if (headerIdx < 0) {
      errors.push({ row: 1, message: "No PayU header (need mihpayid / txnid)" });
      return { source: "gateway", rows: parsed, errors };
    }
    const headers = rows[headerIdx];
    const cId = col(headers, ["mihpayid", "txnid", "payuid"]);
    const cAmt = col(headers, ["amount"]);
    const cDate = col(headers, ["addedon", "date", "created"]);
    const cEmail = col(headers, ["email"]);
    const cStatus = col(headers, ["status"]);

    rows.slice(headerIdx + 1).forEach((row, i) => {
      const rowNo = headerIdx + i + 2;
      const id = (row[cId] ?? "").trim();
      const amount = rupeeToPaise(row[cAmt]);
      const ts = iso(row[cDate] ?? "");
      const status = (row[cStatus] ?? "").toLowerCase();
      if (status && status !== "success" && status !== "captured") {
        errors.push({ row: rowNo, message: `skipped status ${status}` });
        return;
      }
      if (!id || !amount || !ts) {
        errors.push({ row: rowNo, message: "missing mihpayid, amount, or addedon" });
        return;
      }
      parsed.push({
        source: "gateway",
        kind: "PAYMENT",
        sourceRef: id,
        ts,
        amountPaise: amount,
        description: "PayU payment",
        counterparty: row[cEmail] || undefined,
        extra: { psp: "payu", status },
      });
    });
    return { source: "gateway", rows: parsed, errors };
  },
};
