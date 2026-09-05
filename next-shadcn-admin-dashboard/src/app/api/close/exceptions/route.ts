import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { ensureLiveClose, listExceptions } from "@/lib/close/store";

export const runtime = "nodejs";

/** GET /api/close/exceptions?reasonCode=&status=&runId= - the honest exception list. */
export async function GET(request: Request) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const url = new URL(request.url);
  const reasonCode = url.searchParams.get("reasonCode") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const runId = url.searchParams.get("runId") ?? undefined;

  await ensureLiveClose();
  const exceptions = listExceptions({ reasonCode, status, runId });
  return NextResponse.json({
    exceptions,
    count: exceptions.length,
    filters: { reasonCode, status, runId },
  });
}
