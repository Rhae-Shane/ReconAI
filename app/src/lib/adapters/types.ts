/**
 * Branded source-file adapters for the Controller close loop.
 *
 * Real finance files (Razorpay settlements, bank statements, GSTR-2B) arrive in vendor
 * formats rather than the generic three-CSV matrix. These adapters parse ONE source file into
 * normalized `ParsedRow`s, validate each row, and report per-row errors so a caller can accept
 * the good rows and inspect the failures.
 *
 * The shapes mirror the `FinRecord` fields in `@/lib/close/types`: `source` (one of
 * "gateway" | "bank" | "erp" | "gst"), `kind`, `sourceRef`, `ts` (ISO value date), and `amountPaise`
 * (signed integer paise: + inflow / - outflow).
 */

export interface ParsedRow {
  source: string;
  kind: string;
  sourceRef: string;
  ts: string; // ISO value date
  amountPaise: number; // signed, + inflow / - outflow
  description?: string;
  counterparty?: string;
  extra?: Record<string, unknown>;
}

export interface RowError {
  row: number; // 1-based within the source file
  message: string;
}

export interface AdapterResult {
  rows: ParsedRow[];
  errors: RowError[];
  source: string;
}

export interface SourceAdapter {
  id: string;
  label: string;
  parse(text: string): AdapterResult;
}
