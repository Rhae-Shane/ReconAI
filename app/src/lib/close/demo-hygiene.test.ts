import { describe, expect, it } from "vitest";

import {
  buildDataset,
  completeSyntheticRun,
  getReport,
  listExceptions,
  putRunState,
  repairDataset,
  seedDemoClose,
} from "./store";

describe("demo close data hygiene", () => {
  it("seedDemoClose produces a DONE run_today with matching exceptions and unresolved", () => {
    const meta = seedDemoClose(1_700_000_000_000);
    expect(meta.id).toBe("run_today");
    expect(meta.status).toBe("DONE");
    expect(meta.totals.records).toBeGreaterThan(0);
    expect(meta.totals.exceptions).toBeGreaterThan(0);

    const open = listExceptions({ status: "OPEN", runId: "run_today" });
    const report = getReport("run_today");
    expect(report).not.toBeNull();
    expect(open.length).toBeGreaterThan(0);
    expect(report).not.toBeNull();
    expect(report!.unresolved.length).toBeGreaterThan(0);
    // Every unresolved NEEDS_REVIEW line has a live exception.
    for (const line of report!.unresolved.filter((u) => u.status === "NEEDS_REVIEW")) {
      expect(open.some((e) => e.recordId === line.recordId)).toBe(true);
    }
  });

  it("completeSyntheticRun aliases run_today and leaves no orphan RUNNING stub", () => {
    const meta = completeSyntheticRun("run_fresh_1", 1_700_000_000_100);
    expect(meta.status).toBe("DONE");
    expect(meta.id).toBe("run_fresh_1");
    const today = getReport("run_today");
    expect(today).not.toBeNull();
    expect(today?.totals.records).toBe(meta.totals.records);
  });

  it("repairDataset files missing exceptions for unmatched residuals", () => {
    const base = buildDataset("repair_me", 1_700_000_000_200);
    const stripped = { ...base, exceptions: [] as typeof base.exceptions, totals: { ...base.totals, exceptions: 0 } };
    const repaired = repairDataset(stripped, "repair_me");
    expect(repaired.exceptions.length).toBeGreaterThan(0);
    putRunState("repair_me", repaired, 1_700_000_000_200, 1_700_000_000_200);
    const report = getReport("repair_me");
    expect(report).not.toBeNull();
    expect(report!.unresolved.every((u) => u.status === "NEEDS_REVIEW")).toBe(true);
    for (const line of report!.unresolved) {
      expect(repaired.exceptions.some((e) => e.recordId === line.recordId)).toBe(true);
    }
  });
});
