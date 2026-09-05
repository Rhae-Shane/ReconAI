import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { buildReconcileSummary } from "@/lib/close/reconcile-summary";
import { getRunFromStore } from "@/lib/close/store";
import { getRatelimit } from "@/lib/ops/ratelimit";

export const runtime = "nodejs";

/**
 * GET /api/close/reconcile?runId=...
 *
 * Recomputes and returns a finance-team reading of a completed close run: the
 * counts and sums of payments vs settlements, the payout schedule, payouts that
 * are still missing, and the forecast / unsettled amounts — all surfaced with an
 * explicit match-type breakdown so an engineer (or auditor) can see exactly how
 * every record was decided.
 *
 * Data flows through the same deterministic core (`CloseEngine` + `reconcile.ts`
 * semantics) that produced the persisted run, re-exposed here as a single
 * engineering-facing summary. The Redis run-store is preferred; the in-memory
 * demo store is used as fallback so the endpoint works with zero infra.
 */

/** GET /api/close/reconcile?runId=... — the engineering answer for a run. */
export async function GET(request: Request) {
  // Read-only reconciliation reading — every authenticated role may view it.
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const ratelimit = getRatelimit();
  if (ratelimit) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Rate limit exceeded. Try again shortly." }, { status: 429 });
    }
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");
  if (!runId) {
    return NextResponse.json(
      { error: "runId query parameter is required (e.g. /api/close/reconcile?runId=run_123)." },
      { status: 400 },
    );
  }

  const detail = await getRunFromStore(runId);
  if (!detail) {
    return NextResponse.json({ error: `No completed run found for ${runId}.` }, { status: 404 });
  }

  return NextResponse.json(buildReconcileSummary(detail));
}
