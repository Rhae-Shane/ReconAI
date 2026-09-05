import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { completeSyntheticRun, listRunsFromStore, startRun } from "@/lib/close/store";
import { enqueueCloseRun, isQueueEnabled } from "@/lib/ops/queue";
import { syncRazorpayClose } from "@/lib/razorpay/sync";

export const runtime = "nodejs";

/**
 * POST /api/close/runs - start a daily-close run.
 *
 * Priority:
 * 1. Redis/BullMQ worker (when REDIS_URL is set) — pulls Razorpay and persists to DB
 * 2. In-process Razorpay sync → Postgres (no queue)
 * 3. CLOSE_DEMO_SEED=force only — synthetic batch (tests / offline demos)
 *
 * Never reads harness/output/*.json — that file is CLI measurement output only.
 */
export async function POST() {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const forceDemo = process.env.CLOSE_DEMO_SEED === "force";
  const started = startRun();
  let run = started;
  let queued = false;
  let source: "queue" | "razorpay" | "demo" = "queue";

  if (isQueueEnabled() && !forceDemo) {
    queued = await enqueueCloseRun(started.id, new Date(started.startedAt).getTime());
    if (queued) source = "queue";
  }

  if (!queued && !forceDemo) {
    // Live path: pull Razorpay → reconcile → persist close_runs / close_reports in Postgres.
    const synced = await syncRazorpayClose();
    if (!("error" in synced)) {
      const { aliasAsToday, getRun } = await import("@/lib/close/store");
      aliasAsToday(synced.runId);
      const today = getRun("run_today");
      run = today?.meta ?? started;
      source = "razorpay";
      await recordAudit({
        actor: verdict.role,
        role: verdict.role,
        action: "runs:start",
        target: synced.runId,
        detail: `source=razorpay records=${synced.counts.records} exceptions=${synced.report.exceptions.length}`,
      });
      return NextResponse.json(
        {
          run,
          queued: false,
          source,
          sync: {
            runId: synced.runId,
            mode: synced.mode,
            counts: synced.counts,
            unresolved: synced.report.unresolved.length,
            exceptions: synced.report.exceptions.length,
          },
        },
        { status: 201 },
      );
    }
    // No Razorpay data — leave RUNNING stub only if demo force is off (honest empty).
    await recordAudit({
      actor: verdict.role,
      role: verdict.role,
      action: "runs:start",
      target: started.id,
      detail: `source=empty error=${"error" in synced ? synced.error : "unknown"}`,
    });
    return NextResponse.json(
      {
        run: started,
        queued: false,
        source: "empty",
        error: "error" in synced ? synced.error : "empty",
        hint: "Configure RAZORPAY_* keys and capture test payments, or upload a CSV.",
      },
      { status: 201 },
    );
  }

  if (!queued && forceDemo) {
    run = completeSyntheticRun(started.id, new Date(started.startedAt).getTime());
    source = "demo";
  }

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "runs:start",
    target: run.id,
    detail: `source=${source} queued=${queued}`,
  });

  return NextResponse.json({ run, queued, source }, { status: 201 });
}

/** GET /api/close/runs - list runs from memory + Postgres (never harness JSON). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const runs = await listRunsFromStore();
  return NextResponse.json({ runs });
}
