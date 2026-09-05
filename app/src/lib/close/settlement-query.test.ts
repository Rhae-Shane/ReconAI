import { describe, expect, it } from "vitest";

import { parseSettlementQueryDay, putRunState, settlementQuery } from "./store";
import type { Settlement } from "./types";

function fixtureSettlements(): Settlement[] {
  return [
    {
      id: "s1",
      runId: "run_qa",
      settledAt: "2026-08-12T14:00:00.000Z",
      amountPaise: 10_000_00,
      utrNumber: "UTR_A",
      status: "RECEIVED",
      lagDays: 1,
    },
    {
      id: "s2",
      runId: "run_qa",
      settledAt: "2026-08-14T14:00:00.000Z",
      amountPaise: 25_000_00,
      utrNumber: "UTR_B",
      status: "RECONCILED",
      lagDays: 0,
    },
    {
      id: "s3",
      runId: "run_qa",
      settledAt: "2026-08-14T15:00:00.000Z",
      amountPaise: 5_000_00,
      utrNumber: "UTR_C",
      status: "RECEIVED",
      lagDays: 2,
    },
    {
      id: "s4",
      runId: "run_qa",
      settledAt: "2026-08-14T16:00:00.000Z",
      amountPaise: 1_000_00,
      utrNumber: "UTR_SKIP",
      status: "EXPECTED",
      lagDays: 0,
    },
  ];
}

describe("settlementQuery ledger Q&A", () => {
  it("parses free-text settlement dates", () => {
    expect(parseSettlementQueryDay("Which UTRs settled on 14 Aug?", 2026)).toBe("2026-08-14");
    expect(parseSettlementQueryDay("Aug 14 2025")).toBe("2025-08-14");
    expect(parseSettlementQueryDay("on 2026-09-01")).toBe("2026-09-01");
  });

  it("lists dates, day UTRs, and refuses empty days with available dates", () => {
    putRunState("run_qa", {
      records: [],
      groups: [],
      flaps: [],
      exceptions: [],
      settlements: fixtureSettlements(),
      taxMatches: [],
      forecast: [],
      audit: [],
      totals: { records: 0, matched: 0, exceptions: 0, resolvedPct: 0, groups: 0, judged: 0 },
    });

    const dates = settlementQuery("run_qa", "list all settlement dates");
    expect(dates).toContain("12 Aug 2026");
    expect(dates).toContain("14 Aug 2026");
    expect(dates).toContain("UTR_A");
    expect(dates).toContain("UTR_B");
    expect(dates).not.toContain("UTR_SKIP");

    const on14 = settlementQuery("run_qa", "Which UTRs settled on 14 Aug?");
    expect(on14).toContain("UTR_B");
    expect(on14).toContain("UTR_C");
    expect(on14).toContain("2 settlement");

    const missing = settlementQuery("run_qa", "Which UTRs settled on 1 Jan?");
    expect(missing).toContain("No settlements recorded");
    expect(missing).toContain("Available settled dates");
    expect(missing).toContain("14 Aug 2026");
  });
});
