import { describe, expect, it } from "vitest";

import { deleteRun, loadAllRuns, loadDataset, loadReport, loadRunMeta, saveRun } from "@/lib/close/run-store";

/**
 * Vitest suite for the durable run store with Redis UNCONFIGURED.
 *
 * Every accessor must degrade to a safe no-op (false / [] / null) — never contact a
 * real Redis — so the app falls back to the in-memory demo store without special-casing.
 */

describe("run-store with Redis unconfigured", () => {
  it("saveRun returns false", async () => {
    await expect(
      saveRun("persist_never", {
        status: "DONE",
        startedAt: new Date().toISOString(),
      }),
    ).resolves.toBe(false);
  });

  it("loadAllRuns returns an empty list", async () => {
    await expect(loadAllRuns()).resolves.toEqual([]);
  });

  it("loadRunMeta returns null", async () => {
    await expect(loadRunMeta("missing_run")).resolves.toBeNull();
  });

  it("loadDataset returns null", async () => {
    await expect(loadDataset("missing_run")).resolves.toBeNull();
  });

  it("loadReport returns null", async () => {
    await expect(loadReport("missing_run")).resolves.toBeNull();
  });

  it("deleteRun returns false", async () => {
    await expect(deleteRun("missing_run")).resolves.toBe(false);
  });
});
