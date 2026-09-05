import { NextResponse } from "next/server";

import { isCriticalException } from "controller-harness/control/sod";

import { recordAudit } from "@/lib/audit";
import { currentUserActor, denied, requireRole } from "@/lib/authz";
import { getFinanceConfig } from "@/lib/close/config";
import { resolveException, submitExceptionResolution, listExceptions } from "@/lib/close/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/close/exceptions/:id/resolve
 *
 * Actions:
 * - `submit` or `status: RESOLVED`: accountant/owner submits resolution →
 *   PENDING_APPROVAL when critical; auto-APPROVED when non-critical.
 * - `status: REVIEWED | OVERRIDDEN`: non-terminal status change (no SoD).
 *
 * Optional `actor` overrides the audit identity (demo: accountant.demo).
 */
export async function POST(request: Request, { params }: Params) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    status?: string;
    note?: string;
    actor?: string;
  };

  const identity = await currentUserActor();
  const actor =
    (typeof body.actor === "string" && body.actor.trim()) ||
    identity?.actor ||
    verdict.role;

  const existing = listExceptions().find((e) => e.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Exception not found" }, { status: 404 });
  }

  if (body.status === "REVIEWED" || body.status === "OVERRIDDEN") {
    const exc = resolveException(id, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      status: body.status as any,
      note: body.note,
    });
    if (!exc) {
      return NextResponse.json({ error: "Exception not found" }, { status: 404 });
    }
    await recordAudit({
      actor,
      role: verdict.role,
      action: "exceptions:resolve",
      target: id,
      detail: `${body.status}${body.note ? `: ${body.note}` : ""}`,
    });
    return NextResponse.json({
      exception: exc,
      audited: true,
      note: `Exception ${exc.id} marked ${exc.status}.`,
    });
  }

  const wantsSubmit = body.action === "submit" || body.status === "RESOLVED";
  if (!wantsSubmit) {
    return NextResponse.json(
      {
        error:
          "Provide action: \"submit\" or status: REVIEWED | OVERRIDDEN | RESOLVED. Use POST .../approve for owner approval.",
      },
      { status: 400 },
    );
  }

  const critical = isCriticalException(existing);
  const exc = submitExceptionResolution(id, {
    resolvedBy: actor,
    note: body.note ?? (critical ? "resolution submitted for approval" : "resolved"),
  });
  if (!exc) {
    return NextResponse.json({ error: "Exception not found" }, { status: 404 });
  }

  await recordAudit({
    actor,
    role: verdict.role,
    action: critical ? "exceptions:submit-resolution" : "exceptions:resolve",
    target: id,
    detail: critical
      ? `PENDING_APPROVAL by ${actor}`
      : `RESOLVED by ${actor} (non-critical)`,
  });

  return NextResponse.json({
    exception: exc,
    audited: true,
    sod: {
      critical,
      resolutionStatus: exc.resolutionStatus,
      resolvedBy: exc.resolvedBy,
      requiresOwnerApproval: critical && exc.resolutionStatus === "PENDING_APPROVAL",
    },
    note: critical
      ? `Exception ${exc.id} resolution submitted by ${actor}; awaiting distinct owner approval (SoD).`
      : `Exception ${exc.id} resolved by ${actor} (non-critical; SoD not required). Tolerance/age rules per financeCfg, max ${getFinanceConfig().maxExceptionAgeDays}d.`,
  });
}
