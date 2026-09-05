import { NextResponse } from "next/server";

import { MaterialityEngine } from "controller-harness/control/materiality";

import { denied, requireRole } from "@/lib/authz";

export const runtime = "nodejs";

/**
 * POST /api/control/materiality
 *
 * Classify a variance by materiality — auto-accept, monitor, require review or
 * require approval — using absolute + percentage thresholds. Decides whether a
 * residual needs a human. Deterministic, no AI.
 */
export async function POST(request: Request) {
  // Deterministic classification (no state change) — every authenticated role may run it.
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json();
  const engine = new MaterialityEngine();
  const outcome = engine.classify(
    (body.variancePaise as number) ?? 0,
    (body.basePaise as number) ?? 0,
    body.currency as string | undefined,
  );

  return NextResponse.json({
    level: outcome.level,
    needsHuman: outcome.needsHuman,
    requiresApproval: outcome.requiresApproval,
    driver: outcome.driver,
  });
}
