import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { ClaudeJudge } from "@/lib/close/claude-judge";
import { ensureLiveClose } from "@/lib/close/store";
import { getCloseTool } from "@/lib/close/tools";

export const runtime = "nodejs";

type Body = {
  name?: string;
  input?: Record<string, unknown>;
  runId?: string;
};

/**
 * POST /api/close/agents/tools - direct tool invocation (internal, for the harness / driver).
 * Body: { name, input, runId }. Every tool parses its input through its Zod schema and routes
 * through the engine deterministically.
 */
export async function POST(request: Request) {
  // Direct tool invocation can mutate close state (reconcile, finalize, ...) — write-capable roles only.
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = (await request.json().catch(() => ({}))) as Body;
  const tool = getCloseTool(body.name ?? "");

  if (!tool) {
    return NextResponse.json({ error: `Unknown tool "${body.name}".` }, { status: 400 });
  }

  const parsed = tool.inputSchema.safeParse(body.input ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tool input", issues: parsed.error.issues }, { status: 400 });
  }

  await ensureLiveClose();
  const result = await tool.execute(parsed.data as never, {
    runId: body.runId ?? "run_today",
    judge: new ClaudeJudge(),
  });

  const provenance =
    result && typeof result === "object" && "provenance" in result
      ? (result as { provenance?: { decisionId?: string; inputHash?: string; model?: string } }).provenance
      : undefined;

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "agents:tool",
    target: (body.runId ?? tool.name ?? "").toString(),
    detail: provenance?.decisionId
      ? `tool=${tool.name};aiDecision=${provenance.decisionId};model=${provenance.model ?? ""};inputHash=${provenance.inputHash ?? ""}`
      : `tool=${tool.name}`,
  });

  return NextResponse.json({ tool: tool.name, result });
}
