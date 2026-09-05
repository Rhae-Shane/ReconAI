/**
 * allocation.test.ts — settlement allocation: how matched groups are bound to
 * settlement batches (one batch per group carrying a UTR), plus lag stats.
 */
import { describe, it, expect } from 'vitest';
import { SettlementService } from '../src/core/settle.js';
import type { MatchGroup } from '../src/core/types.js';

function group(
  id: string,
  key: string,
  opts: { amount?: number; lines?: number } = {},
): MatchGroup {
  const amount = opts.amount ?? 10000;
  const n = opts.lines ?? 3;
  return {
    id,
    key,
    method: 'EXACT',
    matchType: 'EXACT',
    confidence: 1,
    reason: 'test',
    amountPaise: amount,
    recordIds: Array.from({ length: n }, (_, i) => `${id}-r${i}`),
    links: Array.from({ length: n }, (_, i) => ({ recordId: `${id}-r${i}`, matchedOn: 'utr' })),
  };
}

const svc = new SettlementService();

describe('allocation: groups to settlement batches', () => {
  it('binds only groups that carry a settlement UTR (utr: key)', () => {
    const groups = [
      group('g1', 'utr:UTRB'), // has a bank leg -> settled
      group('g2', 'mov:gateway', { amount: 5000 }), // no UTR -> never settled
    ];
    const s = svc.bindToSettlements(groups);
    expect(s).toHaveLength(1);
    expect(s[0].groupKeys).toEqual(['utr:UTRB']);
    expect(s[0].amountPaise).toBe(10000);
    expect(s[0].status).toBe('RECONCILED');
  });

  it('each group allocates exactly one settlement batch (one-to-one, no double count)', () => {
    const groups = [group('a', 'utr:A'), group('b', 'utr:B'), group('c', 'utr:C')];
    const s = svc.bindToSettlements(groups);
    expect(s).toHaveLength(groups.length);
    const seen = new Set(s.map((x) => x.groupKeys[0]));
    expect(seen.size).toBe(groups.length);
  });

  it('allocation honours an explicit amount override', () => {
    const s = svc.bindToSettlements([group('g', 'utr:ZZ')], { amountPaise: 4321 });
    expect(s[0].amountPaise).toBe(4321);
  });

  it('a group with no settlement leg produces no settlement', () => {
    const s = svc.bindToSettlements([group('g', 'netted:grp-fee', { amount: 4800 })]);
    expect(s).toHaveLength(0);
  });
});

describe('allocation: settlement lag aggregates', () => {
  it('lagStats averages the per-settlement lags', () => {
    const s = svc.bindToSettlements(
      [group('a', 'utr:A'), group('b', 'utr:B')],
      { settledAt: '2026-08-14' },
    );
    s[0].lagDays = 1;
    s[1].lagDays = 3;
    const stats = svc.lagStats(s);
    expect(stats.count).toBe(2);
    expect(stats.avgLagDays).toBe(2);
    expect(stats.minLagDays).toBe(1);
    expect(stats.maxLagDays).toBe(3);
    expect(svc.matchedLags(s)).toEqual([1, 3]);
  });

  it('empty lag stats are all zero', () => {
    const stats = svc.lagStats([]);
    expect(stats).toEqual({ avgLagDays: 0, minLagDays: 0, maxLagDays: 0, count: 0 });
  });
});

describe('allocation: deterministic ledger Q&A', () => {
  it('answers UTR and total-amount questions over the settled ledger', () => {
    const s = svc.bindToSettlements([group('a', 'utr:UTR1'), group('b', 'utr:UTR2')], {
      settledAt: '2026-08-14',
    });
    expect(svc.settleQuery(s, 'which utrs exist')).toContain('UTR1');
    expect(svc.settleQuery(s, 'total settled amount')).toContain('200');
  });
});
