import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { getReportFromStore, getRunFromStore } from "@/lib/close/store";
import { buildDossier, dossierToCsv, dossierToPdf, dossierToXlsx } from "@/lib/finance/dossier";

export const runtime = "nodejs";

type Params = { params: Promise<{ runId: string }> };

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
};

/**
 * GET /api/finance/dossier/:runId/export?format=pdf|xlsx|csv
 *
 * Assemble the audit-ready Close Dossier for a run and stream it back as a download.
 * A viewer may read/export, so this is open to owner / accountant / viewer.
 */
export async function GET(_request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return denied(verdict);

  const { runId } = await params;
  const url = new URL(_request.url);
  const format = url.searchParams.get("format") ?? "xlsx";

  const run = await getRunFromStore(runId);
  const report = await getReportFromStore(runId);
  if (!run && !report) {
    return NextResponse.json({ error: "No close run or report available for this run." }, { status: 404 });
  }

  const dossier = await buildDossier({ meta: run?.meta, report });

  const disposition = `attachment; filename="close-dossier-${runId}.${format}"`;
  const contentType = CONTENT_TYPES[format] ?? "application/octet-stream";

  if (format === "pdf") {
    return new NextResponse(new Uint8Array(await dossierToPdf(dossier)), {
      headers: { "Content-Type": contentType, "Content-Disposition": disposition },
    });
  }

  if (format === "csv") {
    return new NextResponse(dossierToCsv(dossier), {
      headers: { "Content-Type": contentType, "Content-Disposition": disposition },
    });
  }

  return new NextResponse(new Uint8Array(await dossierToXlsx(dossier)), {
    headers: { "Content-Type": contentType, "Content-Disposition": disposition },
  });
}
