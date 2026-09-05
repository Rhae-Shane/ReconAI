import type { FinRecord } from "@/lib/close/types";

/** Chunk large uploads so parse/progress stays live above ~10k rows. */
export const SHARD_SIZE = 2500;

export function shardRecords<T>(rows: T[], size = SHARD_SIZE): T[][] {
  if (rows.length === 0) return [];
  const shards: T[][] = [];
  for (let i = 0; i < rows.length; i += size) shards.push(rows.slice(i, i + size));
  return shards;
}

export function needsSharding(count: number, size = SHARD_SIZE): boolean {
  return count > size;
}

export interface ShardProgress {
  id: string;
  total: number;
  parsed: number;
  shards: number;
  shardIndex: number;
  stage: "parse" | "reconcile" | "done" | "error";
  runId?: string;
  error?: string;
  updatedAt: string;
}

export function shardProgress(id: string, total: number, parsed: number, shardIndex: number, shards: number, stage: ShardProgress["stage"]): ShardProgress {
  return {
    id,
    total,
    parsed,
    shards,
    shardIndex,
    stage,
    updatedAt: new Date().toISOString(),
  };
}
