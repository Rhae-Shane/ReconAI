import type { FinRecord } from "@/lib/close/types";

/**
 * In-memory inbox of Razorpay webhook records waiting to be flushed into a
 * close run. Same process-local pattern as `close/store.ts` — Redis is not
 * required for the demo. Dedupes by `FinRecord.id`.
 */

const records = new Map<string, FinRecord>();

export function inboxPush(incoming: FinRecord[]): number {
  let added = 0;
  for (const rec of incoming) {
    if (!records.has(rec.id)) added += 1;
    records.set(rec.id, rec);
  }
  return added;
}

export function inboxList(): FinRecord[] {
  return [...records.values()];
}

export function inboxTake(): FinRecord[] {
  const out = inboxList();
  records.clear();
  return out;
}

export function inboxClear(): void {
  records.clear();
}

export function inboxSize(): number {
  return records.size;
}
