import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { getRunFromStore } from "@/lib/close/store";
import { sendExceptionDigest } from "@/lib/ops/digest";

export const runtime = "nodejs";

/** POST /api/close/digest — Slack/email digest of open exceptions (EMAIL_WEBHOOK_URL). */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const runId = (body as { runId?: string })?.runId ?? "run_today";
  const run = await getRunFromStore(runId);
  if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

  const digest = await sendExceptionDigest(runId, run.exceptions);
  return NextResponse.json({
    digest,
    delivered: Boolean(process.env.EMAIL_WEBHOOK_URL),
  });
}
