import { parseCsv } from "@/lib/close/csv";

import type { AdapterResult, ParsedRow, RowError, SourceAdapter } from "./types";

/**
 * Bank statement adapter.
 *
 * Accepts either a plain CSV of `(date, narration, amount, ref)` columns (amount sign determines
 * + inflow / - outflow) or an OFX/QFX XML statement. The OFX variant is handled with a small
 * regex parser for `<STMTTRN>` blocks (TRNTYPE, DTPOSTED, TRNAMT, MEMO, FITID) — no XML lib
 * needed. Each row maps to a bank record with sourceRef = FITID (OFX) or the ref column (CSV)
 * and ts normalized to ISO. Rows failing validation are reported per-row and skipped.
 */

/** Parse a decimal amount string like `1,234.56` / `-123.45` into signed paise (null if invalid). */
function decimalToPaise(value: string): number | null {
  const t = value
    .trim()
    .replace(/[,\s₹]/g, "")
    .replace(/^\+/, "");
  if (!t) return null;
  const neg = t.startsWith("-");
  const abs = t.replace(/^[-+]/, "");
  if (!/^\d+(\.\d+)?$/.test(abs)) return null;
  const [whole, frac = ""] = abs.split(".");
  const paise = Number(whole) * 100 + Number(`${frac}00`.slice(0, 2));
  return neg ? -paise : paise;
}

/** OFX DTPOSTED like `20240101123000[+5.5:EST]` -> ISO. First 8 = YYYYMMDD, next 6 = HHMMSS. */
function ofxDateToIso(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})[T\s]?(\d{2})?(\d{2})?(\d{2})?/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh = "00", mm = "00", ss = "00"] = m;
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss)));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Normalize a `dd/mm/yyyy`, `dd-mm-yyyy`, or any Date-parseable value into ISO; null if unparseable. */
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

const CSV_HINTS = ["date", "narration", "amount", "ref"];

/** Infer a row kind from the narration/trntype: settle-ish for credits & refunds, else PAYMENT. */
function kindForWord(text: string, inflow: boolean): string {
  if (/settle|refund|credit|inflow|intrest|interest/i.test(text)) return "SETTLEMENT";
  return inflow ? "SETTLEMENT" : "PAYMENT";
}

function bankCsv(text: string): { rows: ParsedRow[]; errors: RowError[] } {
  const parsed = parseCsv(text);
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  if (parsed.length === 0) return { rows, errors };

  const first = parsed[0] ?? [];
  const hasHeader = first.some((c) => CSV_HINTS.some((h) => c.toLowerCase().includes(h)));
  const headers = hasHeader ? first.map((c) => c.toLowerCase()) : [];
  const data = hasHeader ? parsed.slice(1) : parsed;

  const col = (needle: string) => headers.findIndex((h) => h.includes(needle));
  const cDate = col("date");
  const cNarration = col("narration");
  const cAmount = col("amount");
  const cRef = col("ref");
  const cell = (row: string[], named: number, positional: number): string => {
    const idx = hasHeader ? named : positional;
    return idx >= 0 && idx < row.length ? row[idx].trim() : "";
  };

  for (let r = 0; r < data.length; r += 1) {
    const raw = data[r];
    if (raw.every((c) => c === "")) continue;
    const rowNo = hasHeader ? r + 2 : r + 1;
    const rowErrs: string[] = [];

    const dateStr = cell(raw, cDate, 0);
    const narration = cell(raw, cNarration, 1);
    const amountStr = cell(raw, cAmount, 2);
    const ref = cell(raw, cRef, 3);

    if (!ref) rowErrs.push("missing ref");
    if (!dateStr) rowErrs.push("missing date");
    const ts = isoFromDate(dateStr);
    if (dateStr && !ts) rowErrs.push(`unparseable date "${dateStr}"`);
    const amount = decimalToPaise(amountStr);
    if (!amountStr) rowErrs.push("missing amount");
    else if (amount === null) rowErrs.push(`non-numeric amount "${amountStr}"`);

    if (rowErrs.length > 0) {
      errors.push({ row: rowNo, message: rowErrs.join("; ") });
      continue;
    }

    rows.push({
      source: "bank",
      kind: kindForWord(`${narration} ${ref}`, (amount as number) >= 0),
      sourceRef: ref,
      ts: ts as string,
      amountPaise: amount as number,
      description: narration || undefined,
    });
  }

  return { rows, errors };
}

function bankOfx(text: string): { rows: ParsedRow[]; errors: RowError[] } {
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];
  const blockRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let rowNo = 0;
  let m: RegExpExecArray | null = blockRe.exec(text);
  while (m !== null) {
    rowNo += 1;
    const block = m[1];
    // Case-insensitive tag scan (no XML lib / regex-exec nullability surprises).
    const field = (tag: string): string => {
      const lower = block.toLowerCase();
      const open = `<${tag.toLowerCase()}>`;
      const close = `</${tag.toLowerCase()}>`;
      const start = lower.indexOf(open);
      if (start === -1) return "";
      const end = lower.indexOf(close, start);
      if (end === -1) return "";
      return block.slice(start + open.length, end).trim();
    };

    const fitid = field("FITID");
    const trntype = field("TRNTYPE");
    const dtposted = field("DTPOSTED");
    const trnamt = field("TRNAMT");
    const memo = field("MEMO");

    const rowErrs: string[] = [];
    if (!fitid) rowErrs.push("missing FITID");
    if (!dtposted) rowErrs.push("missing DTPOSTED");
    const ts = ofxDateToIso(dtposted);
    if (dtposted && !ts) rowErrs.push(`unparseable DTPOSTED "${dtposted}"`);
    const amount = decimalToPaise(trnamt);
    if (!trnamt) rowErrs.push("missing TRNAMT");
    else if (amount === null) rowErrs.push(`non-numeric TRNAMT "${trnamt}"`);

    if (rowErrs.length > 0) {
      errors.push({ row: rowNo, message: rowErrs.join("; ") });
      continue;
    }

    rows.push({
      source: "bank",
      kind: kindForWord(`${memo} ${trntype}`, (amount as number) >= 0),
      sourceRef: fitid,
      ts: ts as string,
      amountPaise: amount as number,
      description: memo || undefined,
      extra: trntype ? { trntype } : undefined,
    });
    m = blockRe.exec(text);
  }
  return { rows, errors };
}

export const bankAdapter: SourceAdapter = {
  id: "bank",
  label: "Bank Statement",
  parse(text: string): AdapterResult {
    if (/<STMTTRN>/i.test(text)) {
      const { rows, errors } = bankOfx(text);
      return { source: "bank", rows, errors };
    }
    const { rows, errors } = bankCsv(text);
    return { source: "bank", rows, errors };
  },
};
