import { Redis } from "@upstash/redis";

/**
 * Redis layer (Upstash — managed, free tier, no self-hosting).
 *
 * Two connection modes, both optional and independently gated:
 *   - `@upstash/redis` (REST) — app-level reads/cache and the run store, driven by
 *     `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
 *   - a node-redis / BullMQ connection — the durable queue + LangGraph checkpointer, driven by
 *     `REDIS_URL` (the ioredis/TCP endpoint Upstash publishes).
 *
 * Every accessor returns a usable value (or a safe no-op) even when no env is configured, so the
 * whole Controller keeps working locally and in CI without any Redis — see `isRedisConfigured`.
 */

/** App-level Upstash REST client, or `null` when no credentials are configured. */
let redis: Redis | null = null;
let redisResolved = false;

export function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url) return null;
  if (!redisResolved) {
    redis = new Redis({ url, token });
    redisResolved = true;
  }
  return redis;
}

/** True when either connection mode is configured. */
export function isRedisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.REDIS_URL);
}

export function redisKey(...parts: Array<string | number>): string {
  return parts.join(":");
}

/**
 * Upstash's published ioredis/TCP URI uses `redis://` on port 6379, but Upstash serves it over
 * TLS. Node-redis and ioredis only enable TLS for the `rediss://` scheme, so normalise the scheme
 * for Upstash hosts (the TCP path used by BullMQ and the LangGraph checkpointer).
 */
export function tlsRedisUrl(url: string): string {
  if (url.startsWith("redis://") && /upstash\.io/i.test(url)) return url.replace("redis://", "rediss://");
  return url;
}

/* ------------------------------------------------------------------ */
/* JSON kv helpers (safe no-ops without a client)                      */
/* ------------------------------------------------------------------ */

export async function jsonGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    const raw = await r.get(key);
    if (raw === null || raw === undefined) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as T) : (raw as T);
  } catch {
    return null;
  }
}

/** Write JSON to a key with an optional TTL (seconds). */
export async function jsonSet(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.set(key, JSON.stringify(value), ttlSeconds ? { ex: ttlSeconds } : undefined);
    return true;
  } catch {
    return false;
  }
}

export async function jsonDel(key: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  try {
    await r.del(key);
    return true;
  } catch {
    return false;
  }
}
