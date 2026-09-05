import { NextResponse } from "next/server";

import { razorpayWebhookSecret } from "@/lib/razorpay/config";
import { inboxPush } from "@/lib/razorpay/inbox";
import { mapWebhookEvent } from "@/lib/razorpay/map";
import { claimWebhookEvent, webhookEventId } from "@/lib/razorpay/webhook-ledger";
import { verifyRazorpaySignature } from "@/lib/razorpay/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/razorpay
 *
 * Razorpay Dashboard webhook URL for this app. Verifies `X-Razorpay-Signature`
 * then maps `payment.captured` / `refund.processed` / `settlement.processed`
 * into the close inbox. Flush with POST /api/close/razorpay/sync.
 *
 * Point Dashboard → Webhooks (test mode) at this path. Events:
 *   payment.captured, refund.processed, settlement.processed
 */

export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  if (!verifyRazorpaySignature(raw, signature, razorpayWebhookSecret())) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const mapped = mapWebhookEvent(body);
  const eventName = mapped.event || "unknown";
  const envelope = body as { event?: string };
  const eventId = webhookEventId(raw, request.headers.get("x-razorpay-event-id"));
  const claim = await claimWebhookEvent(eventId, envelope.event ?? eventName, raw);
  if (claim === "duplicate") {
    return NextResponse.json({ received: true, verified: true, duplicate: true, event: eventName });
  }

  const added = inboxPush(mapped.records);
  return NextResponse.json({
    received: true,
    verified: true,
    event: mapped.event,
    records: mapped.records.length,
    inboxAdded: added,
  });
}
