/**
 * verify:ops — headless proof that the Redis/LangGraph/BullMQ layer works without any credentials.
 *
 * Runs the LangGraph close graph against the in-memory checkpointer (MemorySaver) and the engine's
 * deterministic dataset — the exact same code path the BullMQ worker drives. Asserts:
 *   1. Node order: ingest→reconcile→judge→settle→forecast→tax→fileExceptions→closeRun.
 *   2. The conditional exception-revision LOOP: a batch with open exceptions returns to `judge`
 *      (bounded by MAX_REVISIONS) instead of closing early.
 *   3. The honesty control: an exhausted run still finalizes a report that SURFACES the open
 *      exceptions — never hidden.
 *   4. A clean (no-exception) run reaches END on the first pass.
 *   5. `processRunJob` (the BullMQ worker body) produces a resolvable report for a real run.
 *
 * Usage: npm run verify:ops   (exit 0 on pass, non-zero + message on failure)
 */
import { MemorySaver } from "@langchain/langgraph";

import type { CloseDataset } from "@/lib/close/graph";
import { MAX_REVISIONS, runCloseGraph } from "@/lib/close/graph";
import type { Dataset } from "@/lib/close/store";
import { buildDataset } from "@/lib/close/store";
import { processRunJob } from "@/lib/ops/queue";

import assert from "node:assert";

const STAGES = ["ingest", "reconcile", "judge", "settle", "forecast", "tax", "fileExceptions", "closeRun"];

function countSequential(nodeOrder: string[], name: string): number {
  return nodeOrder.filter((n) => n === name).length;
}

function encode(history: string[]): string {
  // Collapse the repeated stage backbone into a readable signature.
  return history.filter((n) => STAGES.includes(n)).join(" > ");
}

async function verifyRealRun() {
  // Engine provider against the deterministic seeded dataset (BuildDataset includes exceptions).
  const provider = (id: string): CloseDataset => buildDataset(id, Date.now());

  const run = await runCloseGraph({ runId: "verify_real", provider, checkpointer: new MemorySaver() });

  // 1. Every stage ran, in order (the backbone appears, left-to-right).
  const backbones = encode(run.nodeOrder);
  assert(backbones.includes(STAGES.join(" > ")), `expected stage backbone, got: ${backbones}`);
  assert.strictEqual(run.status, "DONE", `expected DONE after bounded revisions, got ${run.status}`);

  // 2. The exception-revision loop is BOUNDED (does not spin forever).
  const closeRunCount = countSequential(run.nodeOrder, "closeRun");
  const judgeCount = countSequential(run.nodeOrder, "judge");
  assert(closeRunCount > 1, "expected the closeRun -> judge loop to engage for a batch with exceptions");
  assert(closeRunCount <= MAX_REVISIONS + 1, `closeRun executed too many times: ${closeRunCount}`);
  assert.strictEqual(run.revisions, MAX_REVISIONS, `expected revisions to hit ${MAX_REVISIONS}, got ${run.revisions}`);

  // 3. Honesty control: the exhausted run STILL surfaces open exceptions in the report.
  assert(run.report, "expected a final report after revisions are exhausted");
  const open = run.report.exceptions.filter((e) => e.status === "OPEN");
  assert(open.length > 0, "expected un-resolvable exceptions to remain visible (never hidden)");
  assert.strictEqual(run.openExceptions, open.length, "openExceptionCount must match the surfaced set");

  console.log(
    `[verify] real run (with exceptions): status=${run.status} revisions=${run.revisions} ` +
      `closeRun=${closeRunCount} judge=${judgeCount} openSurfaced=${open.length}`,
  );
  console.log(`  backbone: ${backbones}`);
}

async function verifyCleanRun() {
  const provider = (id: string): CloseDataset => cleanDataset(id);
  const run = await runCloseGraph({ runId: "verify_clean", provider, checkpointer: new MemorySaver() });

  assert.strictEqual(run.status, "DONE", `clean run should close immediately, got ${run.status}`);
  assert.strictEqual(countSequential(run.nodeOrder, "closeRun"), 1, "clean run must not loop");
  assert.strictEqual(run.revisions, 0, "clean run must not run a revision pass");
  assert(run.report, "clean run should emit a report");
  console.log(
    `[verify] clean run: status=${run.status} closeRun=1 revisions=0 exceptions=${run.report?.totals.exceptions}`,
  );
}

async function verifyWorkerPath() {
  // The BullMQ worker body, without a queue — no Redis, so nothing persists, but it must
  // resolve a report for a real run and report progress 0→100.
  const progress: number[] = [];
  const result = await processRunJob("verify_job", (pct) => progress.push(pct));

  assert.strictEqual(result.status, "DONE", `worker run should finish, got ${result.status}`);
  assert.strictEqual(result.reportResolved, true, "worker must produce a resolved report");
  assert(result.openExceptions > 0, "seeded batch carries honest open exceptions");
  assert(progress.length > 0 && (progress.at(-1) ?? 0) >= 95, "progress should approach 100%");
  console.log(
    `[verify] worker processRunJob: status=${result.status} reportResolved=${result.reportResolved} ` +
      `openExceptions=${result.openExceptions}`,
  );
}

function cleanDataset(runId: string): CloseDataset {
  const base: Dataset = buildDataset(runId, Date.now());
  return { ...base, exceptions: [], flaps: [] };
}

async function main() {
  await verifyRealRun();
  await verifyCleanRun();
  await verifyWorkerPath();
  console.log("\n[verify:ops] ALL CHECKS PASSED — Redis/LangGraph/BullMQ pipeline resolves headlessly.");
}

main().catch((err) => {
  console.error("\n[verify:ops] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
