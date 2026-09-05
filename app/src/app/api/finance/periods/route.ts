import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { closePeriod, listPeriods, type NewFiscalPeriod, reopenPeriod, upsertPeriod } from "@/lib/finance/periods";

export const runtime = "nodejs";

/** GET /api/finance/periods - list all fiscal periods (read = viewer+). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);
  return NextResponse.json({ periods: await listPeriods() });
}

/**
 * POST /api/finance/periods - create/update a period, or run a period lifecycle action.
 * Write actions (`create/update`, `closePeriod`, `reopenPeriod`) are guarded to accountant+owner.
 *
 * Body shapes:
 *   { period: <NewFiscalPeriod> }                      -> create or update
 *   { action: "closePeriod",  id, by }                 -> close (refuses while open postings remain)
 *   { action: "reopenPeriod", id, by }                 -> reopen + audit note
 */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const action = (body as { action?: string }).action;
  const id = (body as { id?: string }).id;
  const by = (body as { by?: string }).by;

  if (action === "closePeriod" || action === "reopenPeriod") {
    if (!id || !by) {
      return NextResponse.json({ error: `${action} requires id and by` }, { status: 400 });
    }
    const result = action === "closePeriod" ? await closePeriod(id, by) : await reopenPeriod(id, by);
    return result.ok ? NextResponse.json(result) : NextResponse.json(result, { status: 409 });
  }

  const period = (body as { period?: NewFiscalPeriod }).period;
  if (!period?.id) {
    return NextResponse.json({ error: "period (with id) required" }, { status: 400 });
  }
  const ok = await upsertPeriod(period);
  return NextResponse.json({ ok });
}
