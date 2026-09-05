import { describe, expect, it } from "vitest";

import { isQueueEnabled, processRunJob } from "@/lib/ops/queue";

/**
 * Vitest suite for the BullMQ worker body (`processRunJob`) and queue gating.
 *
 * Hermetic: no real Redis, no Queue/Worker instantiation. `processRunJob` uses the
 * in-memory checkpointer (REDIS_URL unset) and `saveRun` is a no-op when Redis is
 * unconfigured, so it resolves a report fully headlessly.
 */

describe("processRunJob (headless worker body)", () => {
  it("resolves a DONE report headlessly with open exceptions surfaced", async () => {
    const progress: number[] = [];
    const result = await processRunJob("test_job", (pct) => progress.push(pct));

    expect(result.status).toBe("DONE");
    expect(result.reportResolved).toBe(true);
    expect(result.openExceptions).toBeGreaterThan(0);
    // Progress should have been reported along the way (0 → 100).
    expect(progress.length).toBeGreaterThan(0);
    expect(progress.at(-1)).toBeGreaterThanOrEqual(95);
  });
});

describe("isQueueEnabled", () => {
  it("returns a boolean gated on process.env.REDIS_URL", () => {
    expect(typeof isQueueEnabled()).toBe("boolean");
    // With no REDIS_URL set the queue must be treated as disabled (no real broker).
    expect(isQueueEnabled()).toBe(false);
  });
});
