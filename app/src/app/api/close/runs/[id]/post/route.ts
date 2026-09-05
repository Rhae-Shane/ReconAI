import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { recordUsage } from "@/lib/billing/meter";
import { getReportFromStore, getRunFromStore } from "@/lib/close/store";
import { journalBalances, journalFromRun } from "@/lib/finance/journal-from-run";
import { postJournal } from "@/lib/finance/ledger";
import { ensureOpenPeriod, listPeriods } from "@/lib/finance/periods";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/close/runs/:id/post — post a completed close run as a balancing GL journal.
 * Builds compound entries from match-group netting (gross − fee − tax − refund + adj = settlement).
 */
export async function POST(request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;

  const body = await request.json().catch(() => null);
  let periodId = (body as { periodId?: string })?.periodId;
  if (!periodId) {
    periodId = (await ensureOpenPeriod()).id;
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

  const entries = journalFromRun(run, periodId);
  if (entries.length === 0) {
    return NextResponse.json({ error: "No journal lines to post from this run" }, { status: 400 });
  }
  if (!journalBalances(entries)) {
    return NextResponse.json({ error: "Journal does not balance", entries }, { status: 409 });
  }

  const result = await postJournal(entries);
  if (!result.ok) return NextResponse.json(result, { status: 409 });

  await recordUsage({ kind: "journal_post", quantity: entries.length, runId: id });
  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "journal:post",
    target: id,
    detail: `${entries.length} lines · period ${periodId}`,
  });

  return NextResponse.json({ ok: true, periodId, entries });
}
