import { NextResponse } from "next/server";

import { denied, requireRole } from "@/lib/authz";
import { type AppEventName, addWebhook, listWebhooks, removeWebhook } from "@/lib/events";

const EVENT_NAMES: readonly AppEventName[] = ["close.completed", "close.failed", "alert", "period.locked"];

export const runtime = "nodejs";

/** GET /api/ops/webhooks - list registered webhook endpoints (owner+accountant+viewer can read). */
export async function GET() {
  const verdict = await requireRole(["owner", "accountant", "viewer"]);
  if (!verdict.ok) return await denied(verdict);

  const webhooks = await listWebhooks();
  return NextResponse.json({ webhooks });
}

/** POST /api/ops/webhooks { url, events? } - register a webhook endpoint (owner only). Returns the updated list. */
export async function POST(request: Request) {
  const verdict = await requireRole(["owner"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const rawEvents = Array.isArray(body?.events) ? body.events : [];
  const events = rawEvents.filter(
    (e: unknown): e is AppEventName => typeof e === "string" && (EVENT_NAMES as readonly string[]).includes(e),
  );

  await addWebhook(url, events);
  const webhooks = await listWebhooks();
  return NextResponse.json({ webhooks });
}

/** DELETE /api/ops/webhooks { url } - deregister a webhook endpoint (owner only). Returns the updated list. */
export async function DELETE(request: Request) {
  const verdict = await requireRole(["owner"]);
  if (!verdict.ok) return await denied(verdict);

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  await removeWebhook(url);
  const webhooks = await listWebhooks();
  return NextResponse.json({ webhooks });
}
