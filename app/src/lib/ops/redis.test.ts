import { describe, expect, it } from "vitest";

import { getRedis, isRedisConfigured, jsonDel, jsonGet, jsonSet } from "@/lib/ops/redis";

/**
 * Vitest suite for the app-level Upstash REST accessors with Redis UNCONFIGURED.
 *
 * The JSON kv helpers must return safe no-op values (null / false) when no credentials
 * are present — never throw and never reach the network.
 */

describe("redis JSON helpers with Redis unconfigured", () => {
  it("jsonGet returns null", async () => {
    await expect(jsonGet("some:key")).resolves.toBeNull();
  });

  it("jsonSet returns false", async () => {
    await expect(jsonSet("some:key", { hello: "world" })).resolves.toBe(false);
  });

  it("jsonDel returns false", async () => {
    await expect(jsonDel("some:key")).resolves.toBe(false);
  });

  it("getRedis returns null when no credentials are configured", () => {
    expect(getRedis()).toBeNull();
  });

  it("isRedisConfigured is false without env", () => {
    expect(isRedisConfigured()).toBe(false);
  });
});
