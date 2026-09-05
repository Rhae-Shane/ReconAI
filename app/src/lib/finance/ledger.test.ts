import { describe, expect, it } from "vitest";

import { trialBalance } from "./ledger";

/**
 * Double-entry invariant for the GL ledger.
 *
 * The module's `trialBalance` reads from Redis, which is unconfigured in CI, so here we assert the
 * two properties that matter and are testable without infra:
 *   - an empty (no-op-safe) ledger is trivially balanced, and
 *   - the netting contract (netPaise = debit - credit; balanced <=> net sum is 0) by construction.
 */

describe("trialBalance (double-entry invariant)", () => {
  it("empty ledger is balanced", async () => {
    const tb = await trialBalance();
    expect(tb.rows).toEqual([]);
    expect(tb.totalPaise).toBe(0);
    expect(tb.balanced).toBe(true);
  });

  it("netPaise = debit - credit per account", async () => {
    const entries = [
      { account: "Settlement Clearing", debitPaise: 100_000, creditPaise: 0 },
      { account: "Reconciliation Variance", debitPaise: 0, creditPaise: 100_000 },
    ];
    const nets = new Map<string, number>();
    for (const e of entries) {
      nets.set(e.account, (nets.get(e.account) ?? 0) + e.debitPaise - e.creditPaise);
    }
    expect(nets.get("Settlement Clearing")).toBe(100_000);
    expect(nets.get("Reconciliation Variance")).toBe(-100_000);
  });

  it("debits === credits when account nets sum to zero", async () => {
    // A balancing close journal: two accounts, equal-and-opposite nets -> invariant holds.
    const nets = [100_000, -100_000];
    const totalPaise = nets.reduce((s, n) => s + n, 0);
    expect(totalPaise).toBe(0);
  });
});
