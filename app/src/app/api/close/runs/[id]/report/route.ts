import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { type getReport, getReportFromStore } from "@/lib/close/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function toCsv(report: NonNullable<ReturnType<typeof getReport>>): string {
  const header = "section,key,value\n";
  const rows: string[] = [];
  rows.push(`totals,records,${report.totals.records}`);
  rows.push(`totals,matched,${report.totals.matched}`);
  rows.push(`totals,exceptions,${report.totals.exceptions}`);
  rows.push(`totals,resolvedPct,${report.totals.resolvedPct.toFixed(2)}`);
  for (const s of report.perSource) {
    rows.push(`perSource,${s.sourceName},${s.matched}/${s.records} (${(s.matchRate * 100).toFixed(1)}%)`);
  }
  for (const b of report.confidenceBins) {
    rows.push(`confidence,${b.bin},${b.count}`);
  }
  for (const e of report.exceptions) {
    rows.push(`exception,${e.reasonCode},${e.status}: ${e.rationale.replaceAll('"', "'")}`);
  }
  return `${header}${rows.join("\n")}`;
}

/** GET /api/close/runs/:id/report?format=json|csv - download the CloseReport artifact (Redis run-store merged with in-memory demo). */
export async function GET(_request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;
  const report = await getReportFromStore(id);
  if (!report) {
    return NextResponse.json({ error: "Report not available for this run." }, { status: 404 });
  }

  const url = new URL(_request.url);
  const format = url.searchParams.get("format") ?? "json";

  if (format === "csv") {
    return new NextResponse(toCsv(report), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="closereport-${id}.csv"`,
      },
    });
  }

  return NextResponse.json(report);
}
