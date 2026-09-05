import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { getPlan, PLANS, type PlanId, setPlan, usageSummary } from "@/lib/billing/meter";

export const runtime = "nodejs";

/** GET /api/billing — usage + plan for the current org (Rhae). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);
  return NextResponse.json(await usageSummary());
}

/** POST /api/billing { planId } — owner can switch plan. */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const planId = (body as { planId?: PlanId })?.planId;
  if (!planId || !(planId in PLANS)) {
    return NextResponse.json({ error: "planId must be starter, growth, or scale" }, { status: 400 });
  }
  await setPlan(planId);
  return NextResponse.json({ plan: await getPlan() });
}
