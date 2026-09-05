import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { enqueueCloseRun, isQueueEnabled } from "@/lib/ops/queue";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/close/runs/:id/retry - re-enqueue a previously-failed close run as a fresh BullMQ job.
 *
 * Relies on `enqueueCloseRun` (BullMQ) so the retried run is processed by `npm run worker`. When the
 * queue is disabled (no `REDIS_URL`) retrying is impossible in-process, so we return 503 with a
 * clear message rather than silently pretending it succeeded.
 */
export async function POST(_request: Request, { params }: Params) {
  // Retrying enqueues a job that mutates run processing — write-capable roles only.
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const { id } = await params;

  if (!isQueueEnabled()) {
    return NextResponse.json(
      { error: "Queue disabled - REDIS_URL is not set. Configure the BullMQ queue before retrying." },
      { status: 503 },
    );
  }

  const queued = await enqueueCloseRun(id);
  if (!queued) {
    return NextResponse.json(
      { error: "Could not enqueue the retry - the queue did not accept the job." },
      { status: 500 },
    );
  }

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "runs:retry",
    target: (id ?? "").toString(),
  });

  return NextResponse.json({ runId: id, queued });
}
