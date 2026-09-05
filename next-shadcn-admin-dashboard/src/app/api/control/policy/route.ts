import { NextResponse } from "next/server";

import {
  type ActorRole,
  type CandidateDecision,
  type DecisionKind,
  PolicyEngine,
} from "controller-harness/control/policy";
import type { MatchType } from "controller-harness/core/types";

import { denied, requireRole } from "@/lib/authz";

export const runtime = "nodejs";

/**
 * POST /api/control/policy
 *
 * Evaluate a decision context and return the governing policy action. The policy
 * engine is the gate: AI never decides what it is allowed to do. This default
 * rule set encodes the deterministic-first contract — a deterministic rule can
 * auto-resolve clean low-variance decisions; anything with an open exception is
 * blocked from closing; significant adjustments need two approvers; the residual
 * defaults to human review.
 */
function buildEngine(): PolicyEngine {
  return new PolicyEngine().addRules([
    {
      id: "r-block-open",
      name: "block close while exceptions are open",
      action: "BLOCK_CLOSE",
      condition: (c) => c.unresolvedOpen,
    },
    {
      id: "r-two-approvers",
      name: "significant adjustment or variance needs two approvers",
      action: "REQUIRE_TWO_APPROVERS",
      condition: (c) => Math.abs(c.adjustmentAmount) >= 1_00_00 || Math.abs(c.variance) >= 1_00_00,
    },
    {
      id: "r-auto-resolve",
      name: "deterministic rule on a clean low-variance decision",
      action: "AUTO_RESOLVE",
      condition: (c) =>
        c.deterministicRuleMatched && !c.unresolvedOpen && c.confidence >= 0.95 && Math.abs(c.variance) <= 100,
    },
    {
      id: "r-human-review",
      name: "residual defaults to human review",
      action: "HUMAN_REVIEW",
      condition: () => true,
    },
  ]);
}

export async function POST(request: Request) {
  // Deterministic policy evaluation (no state change) — every authenticated role may run it.
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json();
  const engine = buildEngine();

  const candidate: CandidateDecision = {
    id: body.candidateId ?? "pending",
    kind: (body.kind as DecisionKind) ?? "ADJUSTMENT",
    matchType: (body.matchType as MatchType) ?? "UNRESOLVED",
    amountPaise: (body.amountPaise as number) ?? 0,
  };

  const ctx = {
    candidate,
    variance: (body.variance as number) ?? (body.variancePaise as number) ?? 0,
    confidence: (body.confidence as number) ?? 0,
    deterministicRuleMatched: Boolean(body.deterministicRuleMatched),
    unresolvedOpen: Boolean(body.unresolvedOpen),
    adjustmentAmount: (body.adjustmentAmount as number) ?? 0,
    actorRole: (body.actorRole as ActorRole) ?? "ANALYST",
  };

  const rules = engine.evaluate(ctx);
  return NextResponse.json({
    action: engine.governingAction(ctx),
    rules: rules.map((r) => ({ id: r.id, action: r.action })),
    canAutoResolve: engine.canAutoResolve(ctx),
    isBlocked: engine.isBlocked(ctx),
    requiresTwoApprovers: engine.requiresTwoApprovers(ctx),
  });
}
