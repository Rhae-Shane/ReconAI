import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { finalizeRun, getRunFromStore } from "@/lib/close/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** GET /api/close/runs/:id - run status + progress + partial metrics (Redis run-store merged with in-memory demo). */
export async function GET(_request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;
  const run = await getRunFromStore(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}

/**
 * POST /api/close/runs/:id/finalize - terminal step, emits the CloseReport.
 * Guarded: only `owner`/`accountant` roles may finalize (RBAC via the Supabase session role).
 */
export async function POST(_request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;

  const report = finalizeRun(id);
  if (!report) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "runs:finalize",
    target: (id ?? "").toString(),
  });

  return NextResponse.json({ report });
}
