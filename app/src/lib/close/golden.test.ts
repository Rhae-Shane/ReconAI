import { MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import { MAX_REVISIONS, runCloseGraph } from "@/lib/close/graph";
import { buildDataset } from "@/lib/close/store";

/**
 * GOLDEN SEED NUMBERS - regression lock on the deterministic close.
 *
 * These are the ground-truth totals pinned at authoring time (2026-08-23) by running the seeded
 * `buildDataset("golden", ...)` through `runCloseGraph` with an in-memory MemorySaver. They are the
 * canonical output of the deterministic generator, NOT guesses:
 *
 *   - revisions  = 3  (== MAX_REVISIONS: the bounded exception loop always exhausts its passes)
 *   - records    = 196 (154 base + 42 Razorpay fee+tax invoices for tax/2B books)
 *   - openExceptions = 18 (of 22 filed; the honesty control surfaces these in the final report)
 *
 * If a future change to the deterministic generator or the graph shifts ANY of these numbers, this
 * regression lock fails loudly so the shift is reviewed rather than silently absorbed.
 */
const GOLDEN = {
  revisions: 3 as const,
  records: 196 as const,
  openExceptions: 18 as const,
};

function goldenProvider(id: string) {
  return buildDataset(id, Date.now());
}

describe("runCloseGraph golden seed regression lock", () => {
  it("locks the deterministic seed close totals", async () => {
    const run = await runCloseGraph({
      runId: "golden",
      provider: goldenProvider,
      checkpointer: new MemorySaver(),
    });

    // The run always finalizes DONE after exhausting its revision budget...
    expect(run.status).toBe("DONE");
    expect(run.revisions).toBe(MAX_REVISIONS);
    expect(run.revisions).toBe(GOLDEN.revisions);

    // ...with a report whose record count is the pinned golden constant.
    expect(run.report).not.toBeNull();
    expect(run.report?.totals.records).toBe(GOLDEN.records);

    // Honestly-surfaced OPEN exceptions are present in the final report (never hidden).
    const open = (run.report?.exceptions ?? []).filter((e) => e.status === "OPEN").length;
    expect(open).toBe(GOLDEN.openExceptions);
    expect(open).toBeGreaterThan(0);
  });
});
