/**
 * Compound double-entry journal from a completed close run.
 *
 * Identity preserved per netted group:
 *   gross − fee − tax − refund + adjustment = settlement
 * so
 *   Dr Bank + Dr FeeExpense + Dr InputGST + Dr Refunds
 *     = Cr GatewayReceivable + Cr Adjustments
 */

import type { MatchGroup, RunDetail } from "@/lib/close/types";
import type { NewLedgerEntry } from "@/lib/finance/ledger";

export const GL_ACCOUNTS = {
  bank: "Bank",
  receivable: "Gateway Receivable",
  fee: "Payment Gateway Fees",
  inputGst: "Input GST (ITC)",
  refund: "Refunds",
  adjustment: "Settlement Adjustments",
  variance: "Reconciliation Variance",
  clearing: "Settlement Clearing",
} as const;

function mag(n: number | undefined): number {
  return Math.abs(Number.isFinite(n) ? (n as number) : 0);
}

function line(
  periodId: string,
  runId: string,
  account: string,
  debitPaise: number,
  creditPaise: number,
  memo: string,
): NewLedgerEntry | null {
  if (debitPaise === 0 && creditPaise === 0) return null;
  return { periodId, runId, account, debitPaise, creditPaise, memo };
}

function fromNetted(periodId: string, runId: string, g: MatchGroup): NewLedgerEntry[] {
  const n = g.netting!;
  const gross = mag(n.grossPaise);
  const fee = mag(n.feePaise);
  const tax = mag(n.taxOnFeePaise);
  const refund = mag(n.refundPaise);
  const adj = n.adjustmentPaise ?? 0;
  const settlement = mag(n.actualSettlementPaise);
  const adjDr = adj < 0 ? mag(adj) : 0;
  const adjCr = adj > 0 ? adj : 0;

  const debit = settlement + fee + tax + refund + adjDr;
  const credit = gross + adjCr;
  const variance = debit - credit;

  const memo = `close ${runId} · ${g.key}`;
  const rows = [
    line(periodId, runId, GL_ACCOUNTS.bank, settlement, 0, memo),
    line(periodId, runId, GL_ACCOUNTS.fee, fee, 0, memo),
    line(periodId, runId, GL_ACCOUNTS.inputGst, tax, 0, memo),
    line(periodId, runId, GL_ACCOUNTS.refund, refund, 0, memo),
    line(periodId, runId, GL_ACCOUNTS.adjustment, adjDr, adjCr, memo),
    line(periodId, runId, GL_ACCOUNTS.receivable, 0, gross, memo),
  ].filter((x): x is NewLedgerEntry => x !== null);

  if (variance > 0)
    rows.push({ periodId, runId, account: GL_ACCOUNTS.variance, debitPaise: 0, creditPaise: variance, memo });
  if (variance < 0)
    rows.push({ periodId, runId, account: GL_ACCOUNTS.variance, debitPaise: mag(variance), creditPaise: 0, memo });
  return rows;
}

function fromPlain(periodId: string, runId: string, g: MatchGroup): NewLedgerEntry[] {
  const amt = mag(g.amountPaise);
  if (amt === 0) return [];
  const memo = `close ${runId} · ${g.key}`;
  return [
    { periodId, runId, account: GL_ACCOUNTS.bank, debitPaise: amt, creditPaise: 0, memo },
    { periodId, runId, account: GL_ACCOUNTS.receivable, debitPaise: 0, creditPaise: amt, memo },
  ];
}

function fromSettlements(periodId: string, runId: string, run: RunDetail): NewLedgerEntry[] {
  const matched = run.settlements
    .filter((s) => s.status === "RECEIVED" || s.status === "RECONCILED")
    .reduce((sum, s) => sum + (s.amountPaise ?? 0), 0);
  const magnitude = mag(matched);
  if (magnitude === 0) return [];
  const inflow = matched >= 0;
  return [
    {
      periodId,
      runId,
      account: GL_ACCOUNTS.clearing,
      debitPaise: inflow ? magnitude : 0,
      creditPaise: inflow ? 0 : magnitude,
      memo: `Settlement clearing from close run ${runId}`,
    },
    {
      periodId,
      runId,
      account: GL_ACCOUNTS.variance,
      debitPaise: inflow ? 0 : magnitude,
      creditPaise: inflow ? magnitude : 0,
      memo: "Reconciliation variance (suspense) from close run",
    },
  ];
}

/** True when the batch nets to zero (debits === credits). */
export function journalBalances(entries: NewLedgerEntry[]): boolean {
  const debit = entries.reduce((s, e) => s + e.debitPaise, 0);
  const credit = entries.reduce((s, e) => s + e.creditPaise, 0);
  return debit === credit;
}

export function journalFromRun(run: RunDetail, periodId: string): NewLedgerEntry[] {
  const runId = run.meta.id;
  const groups = run.groups ?? [];
  if (groups.length === 0) return fromSettlements(periodId, runId, run);

  const entries: NewLedgerEntry[] = [];
  for (const g of groups) {
    if (g.netting) entries.push(...fromNetted(periodId, runId, g));
    else entries.push(...fromPlain(periodId, runId, g));
  }
  if (entries.length === 0) return fromSettlements(periodId, runId, run);
  return entries;
}
