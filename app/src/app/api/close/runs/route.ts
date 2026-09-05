import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { listRunsFromStore, startRun } from "@/lib/close/store";
import { enqueueCloseRun } from "@/lib/ops/queue";

export const runtime = "nodejs";

/**
 * POST /api/close/runs - start a daily-close run.
 * When a Redis-backed queue is configured the run is enqueued as a durable BullMQ job (processed
 * by `npm run worker`); otherwise it falls back to the in-memory synchronous demo run.
 */
export async function POST() {
  // Starting a close run mutates state — write-capable roles only.
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const run = startRun();
  const queued = await enqueueCloseRun(run.id, new Date(run.startedAt).getTime());

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "runs:start",
    target: run.id,
  });

  return NextResponse.json({ run, queued }, { status: 201 });
}

/** GET /api/close/runs - list all runs, newest first (Redis run-store merged with in-memory demo). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const runs = await listRunsFromStore();
  return NextResponse.json({ runs });
}
