import { isRedisConfigured, jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

/**
 * Lightweight event / notification bus (Upstash Redis + best-effort webhooks).
 *
 * Surfaces operational events (close completed/failed, threshold alerts, period locked) to the
 * outside world so a finance team can be notified. The subscriber registry and the recent-event log
 * live under `close:webhooks` / `close:events` and, like the rest of the Redis layer, are no-op-safe:
 * with no Redis configured `addWebhook` returns `false` and `listWebhooks` returns `[]`.
 *
 * Delivery is best-effort and side-effect safe: `emitEvent` never throws. Each matching subscriber
 * gets a `POST` of the event JSON via `globalThis.fetch`; when `fetch` is unavailable and
 * `EVENT_METHOD=log` is set (or fetch throws), the event is logged instead of dropped. An optional
 * `EMAIL_WEBHOOK_URL` acts as the email/Slack gateway: when set, every emitted event is also POSTed
 * there; when unset, email is a clear no-op.
 */

export type AppEventName = "close.completed" | "close.failed" | "alert" | "period.locked";

export interface AppEvent {
  id: string;
  type: AppEventName;
  at: string;
  runId?: string;
  periodId?: string;
  detail?: Record<string, unknown>;
}

export interface Webhook {
  url: string;
  events?: AppEventName[];
  createdAt: string;
}

/** Cap on retained events in the log, newest first. */
const MAX_EVENTS = 200;

const WEBHOOKS_KEY = redisKey("close", "webhooks");
const EVENTS_KEY = redisKey("close", "events");

/* ------------------------------------------------------------------ */
/* Subscriber / endpoint registry                                      */
/* ------------------------------------------------------------------ */

function isAppEventName(value: unknown): value is AppEventName {
  return value === "close.completed" || value === "close.failed" || value === "alert" || value === "period.locked";
}

/** True when a webhook's event filter matches an event (empty filter = all events). */
function matches(webhook: Webhook, type: AppEventName): boolean {
  if (!webhook.events || webhook.events.length === 0) return true;
  return webhook.events.includes(type);
}

/** Register a webhook endpoint. `events` limits which event types it receives (empty = all). Returns false when Redis is unconfigured. */
export async function addWebhook(url: string, events?: AppEventName[]): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    const list = (await jsonGet<Webhook[]>(WEBHOOKS_KEY)) ?? [];
    const cleaned = (events ?? []).filter(isAppEventName);
    const existing = list.find((w) => w.url === url);
    if (existing) {
      existing.events = cleaned;
    } else {
      list.push({ url, events: cleaned, createdAt: new Date().toISOString() });
    }
    return await jsonSet(WEBHOOKS_KEY, list);
  } catch {
    return false;
  }
}

/** Deregister a webhook endpoint. Returns false when Redis is unconfigured or it was not found. */
export async function removeWebhook(url: string): Promise<boolean> {
  if (!isRedisConfigured()) return false;
  try {
    const list = (await jsonGet<Webhook[]>(WEBHOOKS_KEY)) ?? [];
    const next = list.filter((w) => w.url !== url);
    if (next.length === list.length) return false;
    return await jsonSet(WEBHOOKS_KEY, next);
  } catch {
    return false;
  }
}

/** List all registered webhook endpoints. Empty when Redis is unconfigured. */
export async function listWebhooks(): Promise<Webhook[]> {
  if (!isRedisConfigured()) return [];
  const list = await jsonGet<Webhook[]>(WEBHOOKS_KEY);
  return (list ?? []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/* ------------------------------------------------------------------ */
/* Event emission                                                      */
/* ------------------------------------------------------------------ */

/** Best-effort fire-and-forget delivery of a webhook payload. Never throws. */
async function post(url: string, payload: object, extraHeaders?: Record<string, string>): Promise<void> {
  if (typeof globalThis.fetch !== "function") {
    if (process.env.EVENT_METHOD === "log")
      console.log(`[events] log-mode (no fetch) ${(payload as AppEvent).type} -> ${url}`, payload);
    return;
  }
  try {
    await globalThis.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(payload),
      // A webhook must never block the emitting path longer than a beat or hang forever.
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    if (process.env.EVENT_METHOD === "log") console.log(`[events] deliver failed ${(payload as AppEvent).type} -> ${url}`, payload);
  }
}

function detailText(detail: AppEvent["detail"]): string {
  if (detail == null) return "-";
  if (typeof detail === "string") return detail;
  return JSON.stringify(detail, null, 2);
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatEmailHtml(event: AppEvent): string {
  const detail = escapeHtml(detailText(event.detail));
  return [
    `<p><strong>Type:</strong> ${escapeHtml(event.type)}</p>`,
    `<p><strong>Time:</strong> ${escapeHtml(event.at)}</p>`,
    `<p><strong>Run:</strong> ${escapeHtml(event.runId ?? "-")}</p>`,
    `<p><strong>Period:</strong> ${escapeHtml(event.periodId ?? "-")}</p>`,
    `<p><strong>Detail:</strong></p>`,
    `<pre style="background:#f4f4f4;padding:12px;border-radius:8px;font-family:Consolas,monospace;white-space:pre-wrap">${detail}</pre>`,
  ].join("");
}

/**
 * Emit an event: append it to the `close:events` log and POST it to each matching subscriber plus
 * the optional `EMAIL_WEBHOOK_URL` gateway. Never throws; safe to call fire-and-forget.
 */
export async function emitEvent(ev: Omit<AppEvent, "id" | "at">): Promise<void> {
  const event: AppEvent = {
    ...ev,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  };
  try {
    // 1. Persist to the recent-event log (append, newest first) so operators can inspect history.
    if (isRedisConfigured()) {
      const list = (await jsonGet<AppEvent[]>(EVENTS_KEY)) ?? [];
      await jsonSet(EVENTS_KEY, [event, ...list].slice(0, MAX_EVENTS));
    }
    // 2. Deliver to matching subscribers.
    if (isRedisConfigured()) {
      const webhooks = await listWebhooks();
      await Promise.allSettled(webhooks.filter((w) => matches(w, event.type)).map((w) => post(w.url, event)));
    }
    // 3. Optional email/Slack gateway. Unset -> clear no-op.
    const emailGateway = process.env.EMAIL_WEBHOOK_URL;
    const makeKey = process.env.EMAIL_WEBHOOK_API_KEY?.trim();
    if (emailGateway) {
      await post(
        emailGateway,
        {
          type: event.type,
          at: event.at,
          runId: event.runId ?? "-",
          periodId: event.periodId ?? "-",
          detail: detailText(event.detail),
          subject: `Finance close: ${event.type}`,
          html: formatEmailHtml(event),
        },
        makeKey ? { "x-make-apikey": makeKey } : undefined,
      );
    }
  } catch {
    // Emission must never throw to its caller; swallow any unexpected failure.
  }
}
