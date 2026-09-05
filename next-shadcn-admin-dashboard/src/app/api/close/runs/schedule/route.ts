import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { scheduleCloseRun } from "@/lib/ops/queue";

export const runtime = "nodejs";

/**
 * POST /api/close/runs/schedule - schedule a close-run to fire later via BullMQ's native delayed
 * jobs (`delay` ms), reusing the same `close-run` worker - no cron dependency.
 *
 * Body: `{ runId: string, runAt: string }` where runAt is an ISO datetime. Returns whether the
 * scheduling is on/off. When the queue is disabled (no `REDIS_URL`) we return `scheduled: false`
 * so the UI can degrade gracefully instead of erroring.
 */
export async function POST(request: Request) {
  // Scheduling a run mutates the queue/processing plan — write-capable roles only.
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  let runId: string | undefined;
  let runAt: string | undefined;
  try {
    const body = (await request.json()) as { runId?: string; runAt?: string };
    runId = body.runId;
    runAt = body.runAt;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!runId || !runAt || Number.isNaN(new Date(runAt).getTime())) {
    return NextResponse.json({ error: "Body must include a non-empty runId and a valid ISO runAt." }, { status: 400 });
  }

  const result = await scheduleCloseRun(runId, runAt);
  if (!result.scheduled) {
    return NextResponse.json(
      {
        error: "Queue disabled - REDIS_URL is not set. Scheduling needs the BullMQ queue.",
        scheduled: false,
        at: result.at,
      },
      { status: 503 },
    );
  }

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "runs:schedule",
    target: (runId ?? "").toString(),
    detail: runAt,
  });

  return NextResponse.json(result);
}
