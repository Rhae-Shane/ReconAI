import { describe, expect, it } from "vitest";

import { applyColumnMapping, detectHeaders, suggestMapping } from "@/lib/close/csv-map";
import { diffReports } from "@/lib/close/run-diff";
import { needsSharding, SHARD_SIZE, shardRecords } from "@/lib/close/shard";
import type { CloseReport, CloseRunMeta, ExceptionRecord } from "@/lib/close/types";
import { buildExceptionDigest } from "@/lib/ops/digest";

describe("csv-map", () => {
  it("suggests and applies a mapping onto FinRecords", () => {
    const csv = `Txn Id,Value,When,Who
pay_1,10.00,2026-09-01T10:00:00Z,ada@rhae.in
`;
    const headers = detectHeaders(csv);
    const mapping = suggestMapping(headers);
    expect(mapping.sourceRef).toBe("Txn Id");
    expect(mapping.amount).toBe("Value");
    const rows = applyColumnMapping(csv, mapping);
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceRef).toBe("pay_1");
    expect(rows[0].amountPaise).toBe(1000);
  });
});

describe("run-diff", () => {
  it("computes match-rate and unresolved-ref deltas", () => {
    const meta = (id: string, matched: number, exceptions: number): CloseRunMeta => ({
      id,
      status: "DONE",
      startedAt: "2026-09-01T00:00:00.000Z",
      totals: { records: 10, matched, exceptions, resolvedPct: (matched / 10) * 100, groups: 1, judged: 0 },
    });
    const report = (id: string, refs: string[]): CloseReport => ({
      runId: id,
      generatedAt: "2026-09-01T00:00:00.000Z",
      totals: meta(id, 8, 2).totals,
      breakdown: { records: 10, matched: 8, partial: 0, unresolved: refs.length, matchRate: 0.8 },
      unresolved: refs.map((ref) => ({
        recordId: ref,
        ref,
        expectedPaise: 0,
        actualPaise: 0,
        differencePaise: 0,
        reason: "NO_KEY",
        confidence: 0,
        status: "NEEDS_REVIEW",
      })),
      perSource: [],
      confidenceBins: [],
      exceptions: [],
      groundedRecords: 8,
    });
    const diff = diffReports(
      { meta: meta("a", 9, 1), report: report("a", ["x"]) },
      { meta: meta("b", 8, 2), report: report("b", ["x", "y"]) },
    );
    expect(diff.matchedDelta).toBe(1);
    expect(diff.exceptionDelta).toBe(-1);
    expect(diff.clearedUnresolved).toEqual(["y"]);
  });
});

describe("shard", () => {
  it("chunks above SHARD_SIZE", () => {
    const rows = Array.from({ length: 5001 }, (_, i) => i);
    expect(needsSharding(rows.length)).toBe(true);
    const shards = shardRecords(rows);
    expect(shards[0]).toHaveLength(SHARD_SIZE);
    expect(shards.at(-1)?.length).toBe(5001 - SHARD_SIZE * 2);
  });
});

describe("digest", () => {
  it("summarizes open exceptions", () => {
    const digest = buildExceptionDigest("run_today", [
      {
        id: "ex1",
        runId: "run_today",
        recordJson: {},
        reasonCode: "NO_KEY",
        rationale: "orphan",
        candidateIds: [],
        status: "OPEN",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ] as ExceptionRecord[]);
    expect(digest.open).toBe(1);
    expect(digest.byCode.NO_KEY).toBe(1);
    expect(digest.subject).toContain("Rhae");
  });
});
