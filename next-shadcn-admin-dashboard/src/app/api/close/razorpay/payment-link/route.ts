import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/audit";
import { denied, requireRole } from "@/lib/authz";
import { createPaymentLink, RazorpayApiError } from "@/lib/razorpay/client";
import { isRazorpayConfigured } from "@/lib/razorpay/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/close/razorpay/payment-link — create a Razorpay payment link in the connected mode. */
export async function POST() {
  const verdict = await requireRole(["owner", "accountant"]);
  if (!verdict.ok) return await denied(verdict);

  if (!isRazorpayConfigured()) {
    return NextResponse.json(
      { error: "unconfigured", hint: "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET first." },
      { status: 503 },
    );
  }

  try {
    const link = await createPaymentLink();
    if (!link) {
      return NextResponse.json({ error: "unconfigured" }, { status: 503 });
    }
    await recordAudit({
      actor: verdict.role,
      role: verdict.role,
      action: "razorpay:payment-link",
      target: link.id,
    });
    return NextResponse.json(link, { status: 201 });
  } catch (err) {
    const message = err instanceof RazorpayApiError ? err.message : "Could not create a payment link.";
    return NextResponse.json({ error: "razorpay_failed", hint: message }, { status: 502 });
  }
}
