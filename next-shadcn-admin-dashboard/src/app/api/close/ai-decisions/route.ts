import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { getAiDecision, listAiDecisions } from "@/lib/close/ai-decision-log";

export const runtime = "nodejs";

/**
 * GET /api/close/ai-decisions?runId=&limit=&decisionId=
 *
 * Returns AI residual-judge provenance from the in-memory ring buffer
 * (decisionId, model, promptVersion, inputHash, output, confidence, timestamp).
 */
export async function GET(request: Request) {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const url = new URL(request.url);
  const decisionId = url.searchParams.get("decisionId");
  if (decisionId) {
    const decision = getAiDecision(decisionId);
    if (!decision) {
      return NextResponse.json({ error: "Decision not found" }, { status: 404 });
    }
    return NextResponse.json({ decision });
  }

  const runId = url.searchParams.get("runId") ?? undefined;
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.min(500, Math.max(1, Number(limitRaw) || 100)) : 100;
  const decisions = listAiDecisions({ runId, limit });
  return NextResponse.json({ decisions, count: decisions.length, filters: { runId, limit } });
}
