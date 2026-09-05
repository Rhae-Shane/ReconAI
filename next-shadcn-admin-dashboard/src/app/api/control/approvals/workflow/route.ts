import { NextResponse } from "next/server";

import {
  type ApprovalRequest,
  type ApprovalType,
  ApproverPolicy,
  createApprovalRequest,
} from "controller-harness/control/approval";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { listEvidenceRefs } from "@/lib/finance/evidence";

export const runtime = "nodejs";

/**
 * POST /api/control/approvals/workflow
 *
 * Same ApproverPolicy semantics as /api/control/approvals (submit/review/approve/post/reject),
 * but returns a richer payload that also surfaces the evidence attached to the approval request
 * so the Exceptions screen can show what proof backs a financially significant adjustment.
 * The `requestedBy` actor can never approve/reject their own request (segregation of duties),
 * and high-value adjustments require dual approval.
 */
export async function POST(request: Request) {
  // Approval workflow advances financially-significant state — restricted to the owner role (admin-only).
  const verdict = await requireRole(["owner"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json();
  const { action, actor } = body;
  if (!action || !actor) {
    return NextResponse.json({ error: "action and actor are required." }, { status: 400 });
  }

  const policy = new ApproverPolicy({
    dualApprovalAbovePaise: 1_00_000,
    requireDualForTypes: ["adjustment", "writeoff"],
  });

  let requestId: string;
  let req: ApprovalRequest;

  try {
    if (action === "submit") {
      req = createApprovalRequest({
        runId: body.runId ?? "run_today",
        type: (body.type as ApprovalType) ?? "adjustment",
        amountPaise: (body.amountPaise as number) ?? 0,
        requestedBy: body.requestedBy ?? actor,
      });
      policy.submit(req);
      requestId = req.id;
    } else {
      requestId = String(body.requestId ?? "");
      if (!requestId) {
        return NextResponse.json({ error: "requestId is required for review/approve/post/reject." }, { status: 400 });
      }
      req = {
        id: requestId,
        runId: body.runId ?? "run_today",
        type: (body.type as ApprovalType) ?? "adjustment",
        amountPaise: (body.amountPaise as number) ?? 0,
        requestedBy: body.requestedBy ?? actor,
        approvedBy: Array.isArray(body.approvedBy) ? (body.approvedBy as string[]) : [],
        createdAt: body.createdAt ?? new Date().toISOString(),
      };

      switch (action) {
        case "review":
          policy.review(req);
          break;
        case "approve":
          policy.approve(req, actor);
          break;
        case "post":
          policy.post(req);
          break;
        case "reject":
          policy.reject(req, actor);
          break;
        default:
          return NextResponse.json({ error: `Unknown approval action: ${action}` }, { status: 400 });
      }
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  await recordAudit({
    actor: String(actor ?? verdict.role),
    role: verdict.role,
    action: `approvals-workflow:${String(action)}`,
    target: requestId,
  });

  return NextResponse.json({
    requestId,
    state: policy.state(req),
    requiredApprovals: policy.requiredApprovals(req),
    approvedBy: req.approvedBy,
    requestedBy: req.requestedBy,
    evidence: await listEvidenceRefs(requestId),
  });
}
