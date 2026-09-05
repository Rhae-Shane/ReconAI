import { LEDGER_KEY, PERIODS_KEY, readStore, writeStore } from "./journal-store";

/**
 * Fiscal periods (Workstream W2-C).
 *
 * A fiscal period gates journal posting: `postJournal` refuses to write into a closed period, so
 * periods must be closed only once the intra-period postings are settled. Periods are stored as a
 * single ordered list under `close:periods` (via the shared `journal-store`) and are persisted
 * through the standard no-op-safe JSON helpers, so with Redis unconfigured the list is empty (and
 * every period is treated as open - nothing to lock, nothing refuses to post).
 */

export interface PeriodAuditNote {
  at: string;
  by: string;
  note: string;
}

export interface FiscalPeriod {
  id: string;
  label: string;
  startIso: string;
  endIso: string;
  status: "open" | "closed";
  entityId?: string;
  closedAt?: string;
  closedBy?: string;
  /** Additive audit trail appended on close/reopen so the period lifecycle is traceable. */
  audit?: PeriodAuditNote[];
}

/** Fields a client may set when creating/updating a period (close metadata is system-owned). */
export type NewFiscalPeriod = Omit<FiscalPeriod, "closedAt" | "closedBy">;

/** Only the ledger fields `closePeriod` needs - kept local to avoid an import cycle. */
interface StoredLedgerEntry {
  periodId: string;
  settledAt?: string | null;
}

/** List all fiscal periods in insertion order. Empty when Redis is unconfigured/unreachable. */
export async function listPeriods(): Promise<FiscalPeriod[]> {
  return readStore<FiscalPeriod>(PERIODS_KEY);
}

/**
 * Create or update a period. An update applies the new fields over the existing record while
 * preserving system-owned closing metadata (`closedAt`/`closedBy`) and the audit trail - reopening
 * goes through `reopenPeriod` so it always appends an audit note. No-op-safe (false without Redis).
 */
export async function upsertPeriod(p: NewFiscalPeriod): Promise<boolean> {
  const periods = await listPeriods();
  const existing = periods.find((x) => x.id === p.id);
  const merged: FiscalPeriod = {
    ...existing,
    ...p,
    closedAt: existing?.closedAt,
    closedBy: existing?.closedBy,
    audit: existing?.audit,
  };
  const next = periods.filter((x) => x.id !== p.id);
  next.push(merged);
  return writeStore<FiscalPeriod>(PERIODS_KEY, next);
}

/**
 * Close a period. Refuses if there are OPEN postings - an "open" posting is any ledger entry in the
 * period with `settledAt` explicitly `null`. Our journal rows do not yet carry settlement lifecycle
 * state, so stored entries have no `settledAt` and the period is treated as closable (unknown =>
 * closable). Appends a "closed" audit note.
 */
export async function closePeriod(id: string, by: string): Promise<{ ok: boolean; reason?: string }> {
  const periods = await listPeriods();
  const period = periods.find((x) => x.id === id);
  if (!period) return { ok: false, reason: "period not found" };
  if (period.status === "closed") return { ok: false, reason: "period already closed" };

  const ledger = await readStore<StoredLedgerEntry>(LEDGER_KEY);
  const hasOpenPosting = ledger.filter((e) => e.periodId === id).some((e) => e.settledAt === null);
  if (hasOpenPosting) return { ok: false, reason: "open postings remain in this period" };

  const at = new Date().toISOString();
  const next = periods.map((x) =>
    x.id === id
      ? {
          ...x,
          status: "closed" as const,
          closedAt: at,
          closedBy: by,
          audit: [...(x.audit ?? []), { at, by, note: "closed" }],
        }
      : x,
  );
  return { ok: await writeStore<FiscalPeriod>(PERIODS_KEY, next) };
}

/** Reopen a closed period and append an audit note to the periods list (traceability requirement). */
export async function reopenPeriod(id: string, by: string): Promise<{ ok: boolean; reason?: string }> {
  const periods = await listPeriods();
  const period = periods.find((x) => x.id === id);
  if (!period) return { ok: false, reason: "period not found" };
  if (period.status === "open") return { ok: false, reason: "period already open" };

  const at = new Date().toISOString();
  return { ok: await writeStore<FiscalPeriod>(PERIODS_KEY, next) };
}

/** Current calendar month as an open period (created if missing). */
export async function ensureOpenPeriod(now = new Date()): Promise<FiscalPeriod> {
  const id = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const existing = (await listPeriods()).find((p) => p.id === id);
  if (existing) return existing;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59)).toISOString();
  const period: FiscalPeriod = {
    id,
    label: `FY ${id}`,
    startIso: start,
    endIso: end,
    status: "open",
  };
  await upsertPeriod(period);
  return period;
}
