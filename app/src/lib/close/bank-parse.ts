import type { FinKind, FinRecord, SourceKind } from "./types";

/**
 * Bank-statement ingestion for close: CSV (UTR/amount/date), SWIFT MT940, ISO CAMT.053.
 * Amounts become integer paise. Kind is always SETTLEMENT on source `bank`.
 */

const SOURCE_NAME = "Bank UTR";

function record(input: {
  id: string;
  sourceRef: string;
  amountPaise: number;
  ts: string;
  description?: string;
  raw?: Record<string, unknown>;
}): FinRecord {
  return {
    id: input.id,
    source: "bank" satisfies SourceKind,
    sourceName: SOURCE_NAME,
    kind: "SETTLEMENT" satisfies FinKind,
    sourceRef: input.sourceRef,
    ts: input.ts,
    amountPaise: input.amountPaise,
    currency: "INR",
    description: input.description,
    raw: input.raw ?? {},
  };
}

function rupeeToPaise(value: string): number {
  const cleaned = value.replace(/[₹\s,]/g, "").replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n === 0) return 0;
  return Math.round(n * 100);
}

function isoDate(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return new Date(t).toISOString();
  if (/^\d{6}$/.test(t)) {
    const yy = Number(t.slice(0, 2));
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return new Date(Date.UTC(year, Number(t.slice(2, 4)) - 1, Number(t.slice(4, 6)))).toISOString();
  }
  if (/^\d{8}$/.test(t)) {
    return new Date(Date.UTC(Number(t.slice(0, 4)), Number(t.slice(4, 6)) - 1, Number(t.slice(6, 8)))).toISOString();
  }
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Detect MT940 (`:20:` / `:61:`) vs CAMT XML vs CSV. */
export function detectBankFormat(text: string): "mt940" | "camt" | "csv" {
  const trimmed = text.trim();
  if (trimmed.startsWith("<?xml") || trimmed.includes("<Document") || trimmed.includes("camt.053")) return "camt";
  if (trimmed.includes(":20:") && trimmed.includes(":61:")) return "mt940";
  return "csv";
}

export function parseMt940(text: string): FinRecord[] {
  const out: FinRecord[] = [];
  const blocks = text.split(/\n(?=:61:)/);
  let i = 0;
  for (const block of blocks) {
    const m = block.match(/:61:(\d{6})(\d{4})?([CD])([A-Z]?)(\d+[,.]\d{0,2})[^\n]*\n?(?::86:([^\n]+))?/i);
    if (!m) continue;
    const [, yymmdd, , dc, , amountRaw, info] = m;
    const paise = rupeeToPaise(amountRaw.replace(",", "."));
    if (!paise) continue;
    const signed = dc.toUpperCase() === "D" ? -paise : paise;
    const narrative = (info ?? "").trim();
    const utrMatch = narrative.match(/\b([A-Z0-9]{8,22})\b/);
    const utr = utrMatch?.[1] ?? `MT940_${yymmdd}_${i}`;
    out.push(
      record({
        id: `rec:bank:mt940:${utr}:${i}`,
        sourceRef: utr,
        amountPaise: signed,
        ts: isoDate(yymmdd),
        description: narrative || "MT940 statement line",
        raw: { utr, format: "mt940" },
      }),
    );
    i += 1;
  }
  return out;
}

export function parseCamt053(text: string): FinRecord[] {
  const out: FinRecord[] = [];
  const entries = text.split(/<Ntry[\s>]/i).slice(1);
  let i = 0;
  for (const entry of entries) {
    const amt = entry.match(/<Amt[^>]*>([0-9.]+)<\/Amt>/i)?.[1];
    const cdtDbt = entry.match(/<(CdtDbtInd)>(CRDT|DBIT)<\/\1>/i)?.[2];
    const bookg = entry.match(/<BookgDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i)?.[1]
      ?? entry.match(/<ValDt>[\s\S]*?<Dt>([^<]+)<\/Dt>/i)?.[1];
    const ref =
      entry.match(/<AcctSvcrRef>([^<]+)<\/AcctSvcrRef>/i)?.[1]
      ?? entry.match(/<NtryRef>([^<]+)<\/NtryRef>/i)?.[1]
      ?? entry.match(/<EndToEndId>([^<]+)<\/EndToEndId>/i)?.[1]
      ?? `CAMT_${i}`;
    const paise = amt ? rupeeToPaise(amt) : 0;
    if (!paise) continue;
    const signed = cdtDbt === "DBIT" ? -paise : paise;
    out.push(
      record({
        id: `rec:bank:camt:${ref}:${i}`,
        sourceRef: ref,
        amountPaise: signed,
        ts: isoDate(bookg ?? new Date().toISOString()),
        description: "CAMT.053 statement entry",
        raw: { utr: ref, format: "camt053" },
      }),
    );
    i += 1;
  }
  return out;
}

export function parseBankCsv(text: string): FinRecord[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].toLowerCase();
  const hasHeader = /utr|amount|date|narration|ref/.test(header);
  const start = hasHeader ? 1 : 0;
  const cols = hasHeader ? header.split(",").map((c) => c.trim()) : [];
  const idx = (names: string[], fallback: number) => {
    if (!hasHeader) return fallback;
    const found = cols.findIndex((c) => names.some((n) => c.includes(n)));
    return found >= 0 ? found : fallback;
  };
  const iUtr = idx(["utr", "ref", "reference"], 0);
  const iAmt = idx(["amount", "amt", "credit"], 1);
  const iDate = idx(["date", "value"], 2);
  const out: FinRecord[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const parts = lines[i].split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    const utr = parts[iUtr] ?? "";
    const paise = rupeeToPaise(parts[iAmt] ?? "");
    if (!utr || !paise) continue;
    out.push(
      record({
        id: `rec:bank:csv:${utr}:${i}`,
        sourceRef: utr,
        amountPaise: paise,
        ts: isoDate(parts[iDate] ?? ""),
        description: "Bank statement CSV",
        raw: { utr, format: "csv" },
      }),
    );
  }
  return out;
}

export function parseBankStatement(text: string): FinRecord[] {
  const format = detectBankFormat(text);
  if (format === "mt940") return parseMt940(text);
  if (format === "camt") return parseCamt053(text);
  return parseBankCsv(text);
}
