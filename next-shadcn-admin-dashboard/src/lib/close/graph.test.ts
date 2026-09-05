import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import type { CloseDataset } from "@/lib/close/graph";
import { MAX_REVISIONS, runCloseGraph } from "@/lib/close/graph";
import type { Dataset } from "@/lib/close/store";
import { buildDataset } from "@/lib/close/store";

/**
 * Vitest suite for the LangGraph close orchestrator — ports the assertions from
 * `src/scripts/verify-ops.ts` into hermetic describe/it tests.
 *
 * Runs against the deterministic seeded dataset via an in-memory checkpointer
 * (MemorySaver), so no Redis / env is needed and every run is reproducible & fast.
 */

const STAGES = ["ingest", "reconcile", "judge", "settle", "forecast", "tax", "fileExceptions", "closeRun"];

/** Provider producing the deterministic seeded dataset (includes open exceptions). */
function seededProvider(id: string): CloseDataset {
  return buildDataset(id, Date.now());
}

/** Provider producing a clean (no-exception) dataset. */
function cleanProvider(id: string): CloseDataset {
  const base: Dataset = buildDataset(id, Date.now());
  return { ...base, exceptions: [], flaps: [] };
}

function countSequential(nodeOrder: string[], name: string): number {
  return nodeOrder.filter((n) => n === name).length;
}

function encode(history: string[]): string {
  // Collapse the repeated stage backbone into a readable signature.
  return history.filter((n) => STAGES.includes(n)).join(" > ");
}

describe("runCloseGraph (real dataset with exceptions)", () => {
  it("reaches DONE with the stage backbone present in node order", async () => {
    const run = await runCloseGraph({
      runId: "test_real",
      provider: seededProvider,
      checkpointer: new MemorySaver(),
    });

    const backbones = encode(run.nodeOrder);
    expect(backbones).toContain(STAGES.join(" > "));
    expect(run.status).toBe("DONE");
  });

  it("engages the bounded closeRun -> judge revision loop and hits MAX_REVISIONS", async () => {
    const run = await runCloseGraph({
      runId: "test_real_loop",
      provider: seededProvider,
      checkpointer: new MemorySaver(),
    });

    const closeRunCount = countSequential(run.nodeOrder, "closeRun");
    const judgeCount = countSequential(run.nodeOrder, "judge");

    expect(closeRunCount).toBeGreaterThan(1);
    expect(closeRunCount).toBeLessThanOrEqual(MAX_REVISIONS + 1);
    expect(judgeCount).toBeGreaterThan(1);
    expect(run.revisions).toBe(MAX_REVISIONS);
  });

  it("surfaces OPEN exceptions in the final report after exhaustion (honesty control)", async () => {
    const run = await runCloseGraph({
      runId: "test_real_honest",
      provider: seededProvider,
      checkpointer: new MemorySaver(),
    });

    expect(run.report).not.toBeNull();
    const open = (run.report?.exceptions ?? []).filter((e) => e.status === "OPEN");
    expect(open.length).toBeGreaterThan(0);
    // openExceptionCount must match the number of exceptions surfaced as still-OPEN.
    expect(run.openExceptions).toBe(open.length);
  });
});

describe("runCloseGraph (clean, no-exception dataset)", () => {
  it("closes on the first pass with zero revisions", async () => {
    const run = await runCloseGraph({
      runId: "test_clean",
      provider: cleanProvider,
      checkpointer: new MemorySaver(),
    });

    expect(run.status).toBe("DONE");
    expect(countSequential(run.nodeOrder, "closeRun")).toBe(1);
    expect(run.revisions).toBe(0);
    expect(run.report).not.toBeNull();
    expect(run.openExceptions).toBe(0);
  });
});
