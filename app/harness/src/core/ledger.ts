/**
 * ledger.ts — Double-entry accounting journal for the financial truth engine.
 *
 * Every posted entry is a balanced compound journal line (debitPaise ===
 * creditPaise), and the run-level invariant that the grand total of all debits
 * equals the grand total of all credits is enforced and assertable via
 * `trialBalance`. Amounts are integer paise — no floating money arithmetic.
 *
 * The ledger is append-only: entries are recorded and never mutated. It is the
 * terminal holder of ledger truth; nothing in this module may be altered after
 * posting (SPEC §4 / §7 determinism-first, AI-never-executes rule).
 */
import { randomUUID } from 'node:crypto';

/** The chart of accounts used by the recon netting/settlement flows. */
export type AccountType =
  | 'Cash'
  | 'GatewayReceivable'
  | 'CustomerReceivable'
  | 'Bank'
  | 'FeeIncome'
  | 'TaxPayable'
  | 'Payout';

/**
 * One compound double-entry line. `debitPaise` and `creditPaise` are both
 * non-negative magnitudes; a single balancing entry carries the amount on one
 * side and the mirror on the other. `txDate` is the value date, `postingDate`
 * the date the line hit the books. `ref` is the human reference key (e.g. a
 * settlement UTR or group key).
 */
export interface LedgerEntry {
  id: string;
  runId: string;
  book: string;
  account: AccountType;
  /** Septum of the entry, in integer paise (>= 0). */
  debitPaise: number;
  /** Septum of the entry, in integer paise (>= 0). */
  creditPaise: number;
  currency: string;
  /** Value date, ISO "YYYY-MM-DD". */
  txDate: string;
  /** Posting date, ISO "YYYY-MM-DD". */
  postingDate: string;
  ref: string;
  /** The ingestion record this line was derived from, when known. */
  sourceRecordId?: string;
  memo?: string;
}

/** Narrow a balance/trial-balance query to a subset of the journal. */
export interface LedgerFilter {
  runId?: string;
  book?: string;
  currency?: string;
  account?: AccountType;
}

/** Result of `trialBalance`: the auditable equality plus magnitudes. */
export interface TrialBalance {
  debitPaise: number;
  creditPaise: number;
  balanced: boolean;
}

/** Validate the money fields of an entry before it is posted. Pure. */
export function validateEntry(e: LedgerEntry): void {
  if (!Number.isInteger(e.debitPaise) || !Number.isInteger(e.creditPaise)) {
    throw new Error(`Ledger entry ${e.id}: paise amounts must be integers.`);
  }
  if (e.debitPaise < 0 || e.creditPaise < 0) {
    throw new Error(`Ledger entry ${e.id}: debit/credit cannot be negative.`);
  }
  if (e.debitPaise !== e.creditPaise) {
    throw new Error(
      `Ledger entry ${e.id} is unbalanced: debit ${e.debitPaise} ≠ credit ${e.creditPaise}.`,
    );
  }
}

/**
 * An append-only double-entry journal. Zero runtime dependencies; every money
 * value is integer paise. Posting balances each entry, running per-run totals,
 * and the whole book; `balance` returns the net for an account.
 */
export class DoubleEntryLedger {
  /** All entries, in posting order (append-only). */
  readonly entries: LedgerEntry[] = [];

  private runDebit = 0;
  private runCredit = 0;

  /**
   * Post a balanced entry. Throws if the entry itself does not balance or holds
   * negative/decimal money. Returns the recorded entry (with its id filled in
   * when none was supplied).
   */
  post(entry: LedgerEntry): LedgerEntry {
    const rec: LedgerEntry = { ...entry, id: entry.id || `led-${randomUUID()}` };
    validateEntry(rec);
    this.entries.push(rec);
    this.runDebit += rec.debitPaise;
    this.runCredit += rec.creditPaise;
    return rec;
  }

  /** All entries matching a filter (pure read). */
  query(filter: LedgerFilter = {}): LedgerEntry[] {
    return this.entries.filter(
      (e) =>
        (filter.runId === undefined || e.runId === filter.runId) &&
        (filter.book === undefined || e.book === filter.book) &&
        (filter.currency === undefined || e.currency === filter.currency) &&
        (filter.account === undefined || e.account === filter.account),
    );
  }

  /**
   * Net balance of an account = sum(debits) − sum(credits), in paise.
   * Optionally scoped by currency/runId/book.
   */
  balance(account: AccountType, filter: LedgerFilter = {}): number {
    const rows = this.query({ ...filter, account });
    const debit = rows.reduce((a, e) => a + e.debitPaise, 0);
    const credit = rows.reduce((a, e) => a + e.creditPaise, 0);
    return debit - credit;
  }

  /** Grand totals across the whole book, optionally scoped. */
  totals(filter: LedgerFilter = {}): TrialBalance {
    const rows = this.query(filter);
    const debitPaise = rows.reduce((a, e) => a + e.debitPaise, 0);
    const creditPaise = rows.reduce((a, e) => a + e.creditPaise, 0);
    return { debitPaise, creditPaise, balanced: debitPaise === creditPaise };
  }

  /**
   * Audit the double-entry invariant. Throws when the running totals of debits
   * and credits diverge (the corrupt path a finance team must never hit
   * silently). Returns the TrialBalance when healthy.
   */
  trialBalance(filter: LedgerFilter = {}): TrialBalance {
    const tb = this.totals(filter);
    if (!tb.balanced) {
      throw new Error(
        `Unbalanced ledger: debits ${tb.debitPaise} ≠ credits ${tb.creditPaise}.`,
      );
    }
    return tb;
  }

  /** Non-throwing invariant check (assertable in tests). */
  assertBalances(filter: LedgerFilter = {}): boolean {
    return this.totals(filter).balanced;
  }
}
