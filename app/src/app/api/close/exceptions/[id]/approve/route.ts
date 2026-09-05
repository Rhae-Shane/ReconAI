import { NextResponse } from "next/server";

import { assertSegregationOfDuties, isCriticalException } from "controller-harness/control/sod";

import { recordAudit } from "@/lib/audit";
import { currentUserActor, denied, requireRole } from "@/lib/authz";
import { approveExceptionResolution, listExceptions, rejectExceptionResolution } from "@/lib/close/store";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/close/exceptions/:id/approve
 *
 * Owner-only. Approves (or rejects) a PENDING_APPROVAL resolution.
 * Enforces assertSegregationOfDuties(resolvedBy, approvedBy) — same person cannot do both.
 *
 * Body: { action?: "approve" | "reject", note?: string, actor?: string }
 * Demo actor: owner.demo (must differ from the submitter, e.g. accountant.demo).
 */
export async function POST(request: Request, { params }: Params) {
  const verdict = await requireRole(["owner"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    note?: string;
    actor?: string;
  };

  const identity = await currentUserActor();
  const actor = (typeof body.actor === "string" && body.actor.trim()) || identity?.actor || verdict.role;

  const existing = listExceptions().find((e) => e.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Exception not found" }, { status: 404 });
  }

  const action = body.action === "reject" ? "reject" : "approve";

  if (action === "reject") {
    if (existing.resolutionStatus !== "PENDING_APPROVAL") {
      return NextResponse.json({ error: "Only PENDING_APPROVAL resolutions can be rejected." }, { status: 400 });
    }
    if (existing.resolvedBy && existing.resolvedBy === actor) {
      return NextResponse.json(
        {
          error: `segregation of duties: ${actor} resolved this exception and cannot reject it`,
        },
        { status: 403 },
      );
    }
    const exc = rejectExceptionResolution(id, { rejectedBy: actor, note: body.note });
    await recordAudit({
      actor,
      role: verdict.role,
      action: "exceptions:reject-resolution",
      target: id,
      detail: body.note ?? "rejected",
    });
    return NextResponse.json({
      exception: exc,
      audited: true,
      note: `Exception ${id} resolution rejected by ${actor}.`,
    });
  }

  if (existing.resolutionStatus !== "PENDING_APPROVAL") {
    return NextResponse.json(
      {
        error:
          existing.resolutionStatus === "APPROVED"
            ? "Exception resolution is already approved."
            : "Submit a resolution first (POST .../resolve with action submit).",
      },
      { status: 400 },
    );
  }

  if (!existing.resolvedBy) {
    return NextResponse.json(
      { error: "Exception has no resolvedBy; cannot enforce segregation of duties." },
      { status: 400 },
    );
  }

  try {
    assertSegregationOfDuties(existing.resolvedBy, actor);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }

  // Critical flag should already be set; re-check for honesty.
  if (!isCriticalException(existing) && existing.resolutionStatus === "PENDING_APPROVAL") {
    // Non-critical should not normally land here, but still allow owner approval with SoD.
  }

  const exc = approveExceptionResolution(id, {
    approvedBy: actor,
    note: body.note ?? "owner approval",
  });

  await recordAudit({
    actor,
    role: verdict.role,
    action: "exceptions:approve-resolution",
    target: id,
    detail: `approved by ${actor} (resolvedBy=${existing.resolvedBy})`,
  });

  return NextResponse.json({
    exception: exc,
    audited: true,
    sod: {
      critical: isCriticalException(exc!),
      resolutionStatus: exc?.resolutionStatus,
      resolvedBy: exc?.resolvedBy,
      approvedBy: exc?.approvedBy,
    },
    note: `Exception ${id} approved by ${actor}; resolvedBy=${exc?.resolvedBy} (SoD satisfied).`,
  });
}
