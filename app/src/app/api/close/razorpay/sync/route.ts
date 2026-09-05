import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { isRazorpayConfigured } from "@/lib/razorpay/config";
import { inboxSize } from "@/lib/razorpay/inbox";
import { syncRazorpayClose } from "@/lib/razorpay/sync";

export const runtime = "nodejs";

/**
 * GET /api/close/razorpay/sync — whether test-mode keys are present (never leaks secrets).
 * POST /api/close/razorpay/sync — pull payments + settlements + refunds from Razorpay
 *   (when configured) and flush the webhook inbox into a close run.
 */

export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);
  const keyId = process.env.RAZORPAY_KEY_ID?.trim() ?? "";
  return NextResponse.json({
    configured: isRazorpayConfigured(),
    inbox: inboxSize(),
    mode: keyId.startsWith("rzp_live_") ? "live" : keyId.startsWith("rzp_test_") ? "test" : "unknown",
  });
}

export async function POST() {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  const result = await syncRazorpayClose();
  if ("error" in result) {
    const status = result.error === "unconfigured" ? 503 : 400;
    return NextResponse.json(
      {
        error: result.error,
        hint:
          result.error === "unconfigured"
            ? "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test mode) to pull live settlements, or send webhooks to /api/webhooks/razorpay."
            : "No Razorpay payments, settlements, refunds, or webhook inbox rows to reconcile.",
      },
      { status },
    );
  }

  await recordAudit({
    actor: verdict.role,
    role: verdict.role,
    action: "razorpay:sync",
    target: result.runId,
    detail: `${result.counts.records} records (${result.mode})`,
  });

  return NextResponse.json(result, { status: 201 });
}
