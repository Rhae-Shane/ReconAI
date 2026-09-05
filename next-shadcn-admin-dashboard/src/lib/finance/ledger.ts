import { LEDGER_KEY, PERIODS_KEY, readStore, writeStore } from "./journal-store";

/**
 * Double-entry GL ledger (Workstream W2-C).
 *
 * A completed close run posts a small balancing journal into the ledger. Every posting is scoped
 * to a fiscal period (see `./periods.ts`), and `postJournal` refuses to write into a closed
 * period so the books stay period-controlled. Money is integer paise; each journal row carries an
 * account with a debit and a credit amount. The double-entry invariant is that across any subset
 * the sum of all debits equals the sum of all credits, so `trialBalance` nets each account
 * (`netPaise = debit - credit`) and reports `balanced = totalPaise === 0`.
 *
 * Records live under `close:ledger` (via the shared `journal-store`) and are persisted through the
 * same no-op-safe JSON helpers as the rest of the close loop, so with Redis unconfigured the
 * ledger is simply empty (an empty ledger is trivially balanced) and posting remains a graceful
 * no-op rather than a crash.
 */

export interface LedgerEntry {
  id: string;
  runId?: string;
  periodId: string;
  entityId?: string;
  account: string;
  debitPaise: number;
  creditPaise: number;
  memo: string;
  postedAt: string;
}

export type NewLedgerEntry = Omit<LedgerEntry, "id" | "postedAt">;

export interface TrialBalanceRow {
  account: string;
  netPaise: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  /** Sum of per-account nets - MUST be 0 for the books to balance (double-entry invariant). */
  totalPaise: number;
  balanced: boolean;
}

/** Thin view of a stored fiscal period used only for the closed-period gate (no import cycle). */
interface StoredPeriod {
  id: string;
  status: "open" | "closed";
}

/**
 * Post one balancing journal batch. Refuses (ok:false, "period closed") if any target period is
 * closed. Stamps `id` + `postedAt`, appends to the stored ledger, returns ok:true even when Redis
 * is unconfigured (graceful no-op - the write just doesn't persist).
 */
export async function postJournal(entries: NewLedgerEntry[]): Promise<{ ok: boolean; reason?: string }> {
  const periods = await readStore<StoredPeriod>(PERIODS_KEY);
  const closedIds = new Set(periods.filter((p) => p.status === "closed").map((p) => p.id));
  const hitsClosed = entries.some((e) => closedIds.has(e.periodId));
  if (hitsClosed) return { ok: false, reason: "period closed" };

  const now = new Date().toISOString();
  const stamped: LedgerEntry[] = entries.map((e, i) => ({
    ...e,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${i}`,
    postedAt: now,
  }));
  const existing = await readStore<LedgerEntry>(LEDGER_KEY);
  await writeStore<LedgerEntry>(LEDGER_KEY, [...existing, ...stamped]);
  return { ok: true };
}

/** List all ledger entries, optionally filtered to one period. Empty (no-op-safe) when unconfigured. */
export async function listLedger(periodId?: string): Promise<LedgerEntry[]> {
  const all = await readStore<LedgerEntry>(LEDGER_KEY);
  return periodId ? all.filter((e) => e.periodId === periodId) : all;
}

/**
 * Net each account (`netPaise = debit - credit`) and assert the double-entry invariant. The books
 * balance when `totalPaise` (the sum of all account nets) is exactly 0. An empty ledger balances.
 */
export async function trialBalance(periodId?: string): Promise<TrialBalance> {
  const entries = await listLedger(periodId);
  const byAccount = new Map<string, number>();
  for (const e of entries) {
    const net = (e.debitPaise ?? 0) - (e.creditPaise ?? 0);
    byAccount.set(e.account, (byAccount.get(e.account) ?? 0) + net);
  }
  const rows: TrialBalanceRow[] = Array.from(byAccount.entries())
    .map(([account, netPaise]) => ({ account, netPaise }))
    .sort((a, b) => a.account.localeCompare(b.account));
  const totalPaise = rows.reduce((sum, r) => sum + r.netPaise, 0);
  return { rows, totalPaise, balanced: totalPaise === 0 };
}
