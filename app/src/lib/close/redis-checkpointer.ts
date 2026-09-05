import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from "@langchain/langgraph-checkpoint";
import IORedis from "ioredis";

import { tlsRedisUrl } from "@/lib/ops/redis";

/**
 * LangGraph checkpointer that uses Redis GET/SET only.
 *
 * `@langchain/langgraph-checkpoint-redis` always runs `FT.CREATE` (RediSearch).
 * Upstash Redis does not support that command, so we persist checkpoint JSON
 * under `lg:ckpt:*` keys. Worker restarts can resume a thread from Redis.
 */
export class RedisJsonSaver extends BaseCheckpointSaver {
  constructor(
    private readonly redis: IORedis,
    private readonly prefix = "lg:ckpt",
  ) {
    super();
  }

  static fromUrl(url: string): RedisJsonSaver {
    const redis = new IORedis(tlsRedisUrl(url), { maxRetriesPerRequest: null });
    return new RedisJsonSaver(redis);
  }

  private ns(value: string | undefined): string {
    return value && value.length > 0 ? value : "_";
  }

  private blobKey(threadId: string, ns: string, checkpointId: string): string {
    return `${this.prefix}:${threadId}:${this.ns(ns)}:${checkpointId}`;
  }

  private latestKey(threadId: string, ns: string): string {
    return `${this.prefix}:latest:${threadId}:${this.ns(ns)}`;
  }

  private writesKey(threadId: string, ns: string, checkpointId: string): string {
    return `${this.prefix}:writes:${threadId}:${this.ns(ns)}:${checkpointId}`;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) return undefined;
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    let checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!checkpointId) {
      checkpointId = (await this.redis.get(this.latestKey(threadId, ns))) ?? undefined;
    }
    if (!checkpointId) return undefined;
    const raw = await this.redis.get(this.blobKey(threadId, ns, checkpointId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { checkpoint: Checkpoint; metadata?: CheckpointMetadata };
    const writesRaw = await this.redis.get(this.writesKey(threadId, ns, checkpointId));
    return {
      config: {
        configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpointId },
      },
      checkpoint: parsed.checkpoint,
      metadata: parsed.metadata,
      pendingWrites: writesRaw ? (JSON.parse(writesRaw) as CheckpointTuple["pendingWrites"]) : undefined,
    };
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) return;
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const pattern = `${this.prefix}:${threadId}:${this.ns(ns)}:*`;
    let cursor = "0";
    const found: CheckpointTuple[] = [];
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      for (const key of keys) {
        if (key.includes(":writes:") || key.includes(":latest:")) continue;
        const raw = await this.redis.get(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as { checkpoint: Checkpoint; metadata?: CheckpointMetadata };
        found.push({
          config: {
            configurable: {
              thread_id: threadId,
              checkpoint_ns: ns,
              checkpoint_id: parsed.checkpoint.id,
            },
          },
          checkpoint: parsed.checkpoint,
          metadata: parsed.metadata,
        });
      }
    } while (cursor !== "0");
    found.sort((a, b) => b.checkpoint.ts.localeCompare(a.checkpoint.ts));
    const limited = options?.limit ? found.slice(0, options.limit) : found;
    for (const item of limited) yield item;
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, number | string>,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (!threadId) throw new Error("thread_id is required");
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    await this.redis.set(this.blobKey(threadId, ns, checkpoint.id), JSON.stringify({ checkpoint, metadata }));
    await this.redis.set(this.latestKey(threadId, ns), checkpoint.id);
    return { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id } };
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!threadId || !checkpointId) return;
    const ns = (config.configurable?.checkpoint_ns as string | undefined) ?? "";
    const packed = writes.map((w) => [taskId, w[0], w[1]] as const);
    await this.redis.set(this.writesKey(threadId, ns, checkpointId), JSON.stringify(packed));
  }

  async deleteThread(threadId: string): Promise<void> {
    const pattern = `${this.prefix}:*${threadId}*`;
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = next;
      if (keys.length > 0) await this.redis.del(...keys);
    } while (cursor !== "0");
  }
}
