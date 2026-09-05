import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { diffReports, pickPrevRun } from "@/lib/close/run-diff";
import { getReportFromStore, getRunFromStore, listRunsFromStore } from "@/lib/close/store";

export const runtime = "nodejs";

/** GET /api/close/runs/diff?a=&b= — compare two close runs (defaults: today vs previous). */
export async function GET(request: Request) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const { searchParams } = new URL(request.url);
  const runs = await listRunsFromStore();
  const aId = searchParams.get("a") ?? "run_today";
  const bId = searchParams.get("b") ?? pickPrevRun(runs, aId)?.id;
  if (!bId) {
    return NextResponse.json({ error: "Need two completed runs to diff" }, { status: 400 });
  }

  const [aRun, bRun, aReport, bReport] = await Promise.all([
    getRunFromStore(aId),
    getRunFromStore(bId),
    getReportFromStore(aId),
    getReportFromStore(bId),
  ]);
  if (!aRun || !bRun) {
    return NextResponse.json({ error: "One or both runs were not found" }, { status: 404 });
  }

  return NextResponse.json(
    diffReports({ meta: aRun.meta, report: aReport }, { meta: bRun.meta, report: bReport }),
  );
}
