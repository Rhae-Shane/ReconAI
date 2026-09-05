import { createHash } from "node:crypto";

import { getPool } from "@/lib/db";

async function ensureWebhookTable(): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
      event_id TEXT PRIMARY KEY,
      event TEXT,
      payload_hash TEXT,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

export function webhookEventId(raw: string, headerId: string | null): string {
  const header = headerId?.trim();
  if (header) return header;
  return createHash("sha256").update(raw).digest("hex");
}

/** Returns true when this Razorpay event was already ingested (duplicate delivery). */
export async function claimWebhookEvent(eventId: string, event: string, raw: string): Promise<"claimed" | "duplicate" | "skipped"> {
  const pool = getPool();
  if (!pool) return "skipped";
  await ensureWebhookTable();
  const payloadHash = createHash("sha256").update(raw).digest("hex");
  const inserted = await pool.query(
    `INSERT INTO razorpay_webhook_events (event_id, event, payload_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId, event, payloadHash],
  );
  return inserted.rowCount && inserted.rowCount > 0 ? "claimed" : "duplicate";
}
