import { Ratelimit } from "@upstash/ratelimit";

import { getRedis } from "./redis";

/**
 * Sliding-window rate limiter on the agent chat endpoint (Upstash).
 * Lazily built only when Redis is configured; `getRatelimit()` returns null otherwise so callers
 * skip rate limiting gracefully in local/fallback mode.
 */
let limiter: Ratelimit | null | undefined;

export function getRatelimit(): Ratelimit | null {
  if (limiter !== undefined) return limiter;
  const redis = getRedis();
  if (!redis) {
    limiter = null;
    return null;
  }
  limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "10 s"), prefix: "rl:close" });
  return limiter;
}
