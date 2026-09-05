import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { getReportFromStore, getRunFromStore } from "@/lib/close/store";
import { postJournal } from "@/lib/finance/ledger";
import { listPeriods } from "@/lib/finance/periods";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/close/runs/:id/post - post a completed close run to the double-entry ledger.
 * Guarded to accountant+owner.
 *
 * Builds a simple balancing journal from the run report:
 *   - "Settlement Clearing" books the matched settlement amount (debit on inflow / credit on outflow),
 *   - "Reconciliation Variance" takes the equal residual on the OPPOSITE side as a suspense leg,
 * so debits === credits (the ledger's double-entry invariant) holds by construction.
 *
 * `periodId` is required from the body; the period must be open (rejects with 400 if closed), and
 * the run must be complete with a report (rejects with 400 otherwise).
 */
export async function POST(request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;

  const body = await request.json().catch(() => null);
  const periodId = (body as { periodId?: string })?.periodId;
  if (!periodId) {
    return NextResponse.json({ error: "periodId is required" }, { status: 400 });
  }

  const run = await getRunFromStore(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const report = await getReportFromStore(id);
  if (run.meta.status !== "DONE" || !report) {
    return NextResponse.json({ error: "Run has no completed report to post" }, { status: 400 });
  }

  const periods = await listPeriods();
  const target = periods.find((p) => p.id === periodId);
  if (target?.status === "closed") {
    return NextResponse.json({ error: "Period is closed" }, { status: 400 });
  }

  const matchedSettlementPaise = run.settlements
    .filter((s) => s.status === "RECEIVED" || s.status === "RECONCILED")
    .reduce((sum, s) => sum + (s.amountPaise ?? 0), 0);

  const magnitude = Math.abs(matchedSettlementPaise);
  const isInflow = matchedSettlementPaise >= 0;

  const entries = [
    {
      periodId,
      runId: id,
      account: "Settlement Clearing",
      debitPaise: isInflow ? magnitude : 0,
      creditPaise: isInflow ? 0 : magnitude,
      memo: `Settlement clearing from close run ${id}`,
    },
    {
      periodId,
      runId: id,
      account: "Reconciliation Variance",
      debitPaise: isInflow ? 0 : magnitude,
      creditPaise: isInflow ? magnitude : 0,
      memo: "Reconciliation variance (suspense) from close run",
    },
  ];

  const result = await postJournal(entries);
  return result.ok ? NextResponse.json({ ok: true, entries }) : NextResponse.json(result, { status: 409 });
}
