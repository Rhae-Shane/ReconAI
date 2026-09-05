import type { GstB2bRow } from "@/lib/finance/gst";
import type { GstFiling } from "@/lib/finance/gst-file";
import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

const TWO_B_KEY = redisKey("gst", "gstr2b");
const FILINGS_KEY = redisKey("gst", "filings");

export interface StoredGstr2b {
  pulledAt: string;
  source: "upload" | "gateway-fees" | "gsp";
  rows: GstB2bRow[];
}

export async function saveGstr2b(doc: StoredGstr2b): Promise<boolean> {
  return jsonSet(TWO_B_KEY, doc);
}

export async function loadGstr2b(): Promise<StoredGstr2b | null> {
  return jsonGet<StoredGstr2b>(TWO_B_KEY);
}

export async function saveFiling(filing: GstFiling): Promise<boolean> {
  const list = (await jsonGet<GstFiling[]>(FILINGS_KEY)) ?? [];
  const next = [filing, ...list.filter((f) => f.id !== filing.id)].slice(0, 50);
  return jsonSet(FILINGS_KEY, next);
}

export async function listFilings(): Promise<GstFiling[]> {
  return (await jsonGet<GstFiling[]>(FILINGS_KEY)) ?? [];
}
