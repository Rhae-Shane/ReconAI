import { describe, expect, it } from "vitest";

import { journalBalances, journalFromRun } from "@/lib/finance/journal-from-run";
import type { RunDetail } from "@/lib/close/types";

function run(partial: Partial<RunDetail> & { groups: RunDetail["groups"] }): RunDetail {
  return {
    meta: {
      id: "run_1",
      status: "DONE",
      startedAt: "2026-09-01T00:00:00.000Z",
      totals: { records: 2, matched: 2, exceptions: 0, resolvedPct: 100, groups: 1, judged: 0 },
    },
    sources: [],
    flaps: [],
    exceptions: [],
    settlements: [],
    forecast: [],
    taxMatches: [],
    audit: [],
    ...partial,
  };
}

describe("journalFromRun", () => {
  it("posts a balanced netting journal (gross − fee − tax = settlement)", () => {
    const entries = journalFromRun(
      run({
        groups: [
          {
            id: "g1",
            runId: "run_1",
            key: "utr:ABC",
            method: "EXACT",
            matchType: "FEE_NETTED",
            confidence: 1,
            reason: "netted",
            amountPaise: 97640,
            ts: "2026-09-01T00:00:00.000Z",
            links: [],
            netting: {
              grossPaise: 100000,
              feePaise: 2000,
              taxOnFeePaise: 360,
              refundPaise: 0,
              adjustmentPaise: 0,
              netExpectedPaise: 97640,
              actualSettlementPaise: 97640,
              variancePaise: 0,
            },
          },
        ],
      }),
      "2026-09",
    );
    expect(journalBalances(entries)).toBe(true);
    expect(entries.some((e) => e.account === "Bank" && e.debitPaise === 97640)).toBe(true);
    expect(entries.some((e) => e.account === "Gateway Receivable" && e.creditPaise === 100000)).toBe(true);
  });
});
