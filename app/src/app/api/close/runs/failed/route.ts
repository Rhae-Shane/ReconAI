import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { listFailedRuns } from "@/lib/ops/dlq";

export const runtime = "nodejs";

/** GET /api/close/runs/failed - list failed close-runs, newest first (empty when Redis unconfigured). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const failed = await listFailedRuns();
  return NextResponse.json({ failed });
}
