import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { listAlerts } from "@/lib/ops/alerts";

export const runtime = "nodejs";

/** GET /api/close/alerts - list recorded operational alerts, newest first (empty when Redis unconfigured). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const alerts = await listAlerts();
  return NextResponse.json({ alerts });
}
