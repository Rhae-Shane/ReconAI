/**
 * settle.ts — SettlementService: binds matched groups to settlement batches,
 * answers simple Q&A over the settled ledger, and summarizes settlement lag.
 */
import type { FinanceConfig, MatchGroup, Settlement, SettlementLine } from './types.js';
import { resolveConfig } from './config.js';
import { randomUUID } from 'node:crypto';

/** Default settlement lag (days) when none is given. */
export const DEFAULT_LAG_DAYS = 1;

export interface BindOptions {
  settledAt?: string;
  amountPaise?: number;
  utr?: string;
  lagDays?: number;
}

export interface LagStats {
  avgLagDays: number;
  minLagDays: number;
  maxLagDays: number;
  count: number;
}

export class SettlementService {
  private cfg: FinanceConfig;

  constructor(cfg?: Partial<FinanceConfig>) {
    this.cfg = resolveConfig(cfg);
  }

  /**
   * Split matched groups into settlement batches — one batch per group that
   * carries a settlement UTR (its canonical key starts with `utr:`). Everything
   * else has no bank leg and is not settled.
   */
  bindToSettlements(groups: MatchGroup[], opts: BindOptions = {}): Settlement[] {
    const settlements: Settlement[] = [];
    for (const g of groups) {
      const utr = opts.utr ?? extractUtr(g);
      if (!utr) continue; // group has no bank settlement leg
      const settledAt = opts.settledAt ?? DEFAULT_SETTLED_AT;
      const line: SettlementLine = {
        groupId: g.id,
        amountPaise: opts.amountPaise ?? g.amountPaise,
      };
      settlements.push({
        id: `set-${randomUUID()}`,
        groupKeys: [g.key],
        settledAt,
        amountPaise: line.amountPaise,
        utr,
        status: 'RECONCILED',
        lagDays: opts.lagDays ?? DEFAULT_LAG_DAYS,
        lines: [line],
      });
    }
    return settlements;
  }

  /** All settlement lags across the batches (feeds the forecaster). */
  matchedLags(settlements: Settlement[]): number[] {
    return settlements
      .filter((s) => s.lagDays !== undefined)
      .map((s) => s.lagDays as number);
  }

  lagStats(settlements: Settlement[]): LagStats {
    const lags = this.matchedLags(settlements);
    if (!lags.length) return { avgLagDays: 0, minLagDays: 0, maxLagDays: 0, count: 0 };
    return {
      avgLagDays: lags.reduce((a, b) => a + b, 0) / lags.length,
      minLagDays: Math.min(...lags),
      maxLagDays: Math.max(...lags),
      count: lags.length,
    };
  }

  /** Minimal deterministic Q&A over the settled ledger. */
  settleQuery(settlements: Settlement[], query: string): string {
    const q = query.toLowerCase();
    const utrs = settlements.filter((s) => s.utr).map((s) => s.utr as string);
    if (q.includes('utr')) {
      if (utrs.length === 0) return 'No settlements carry a UTR.';
      const list =
        utrs.length > 6
          ? `${utrs.slice(0, 6).join(', ')}, … (${utrs.length} total)`
          : utrs.join(', ');
      return `${utrs.length} settlement UTR(s) on the ledger: ${list}`;
    }
    if (q.includes('total') || q.includes('sum') || q.includes('amount')) {
      const total = settlements.reduce((a, s) => a + s.amountPaise, 0);
      return `Total settled across ${settlements.length} batch(es): ₹${(total / 100).toFixed(2)}`;
    }
    return `Unknown query. Try "which UTRs ..." or "total settled amount".`;
  }
}

/** Statically dated so forecasts are reproducible (use `settledAt` override
 *  with real dates in production runs). */
const DEFAULT_SETTLED_AT = '2026-08-14';

function extractUtr(g: MatchGroup): string | undefined {
  if (g.key.startsWith('utr:')) return g.key.slice('utr:'.length);
  return undefined;
}
