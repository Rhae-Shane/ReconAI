/**
 * ledger.test.ts — the honest exception ledger: append-only, never-deleted,
 * per-code queries, and the P1 enrichment fields (expected/actual/variance/ai).
 */
import { describe, it, expect } from 'vitest';
import { ExceptionLedger } from '../src/core/exception.js';
import type { FinRecord } from '../src/core/types.js';

const rec: FinRecord = {
  id: 'r1',
  source: 'bank-utr',
  kind: 'SETTLEMENT',
  sourceRef: 'UTR-1',
  ts: '2026-08-14',
  amountPaise: -4800,
  currency: 'INR',
  utr: 'UTR-1',
};

describe('ExceptionLedger: append-only store', () => {
  it('add() appends and count() reflects total, never deleting prior rows', () => {
    const ledger = new ExceptionLedger('run-1');
    const e1 = ledger.add(rec, 'AMOUNT_MISMATCH', 'amounts differ');
    const e2 = ledger.add(rec, 'DUPLICATE', 'duplicate row');
    expect(ledger.count()).toBe(2);
    expect(ledger.all).toHaveLength(2);
    expect(ledger.all[0]).toBe(e1);
    expect(ledger.all[1]).toBe(e2);
    expect(e1.runId).toBe('run-1');
  });

  it('byCode() filters to one reason code (still never mutates the store)', () => {
    const ledger = new ExceptionLedger();
    ledger.add(rec, 'NO_KEY', 'orphan');
    ledger.add(rec, 'NO_KEY', 'orphan 2');
    ledger.add(rec, 'DUPLICATE', 'dup');
    expect(ledger.byCode('NO_KEY')).toHaveLength(2);
    expect(ledger.byCode('DUPLICATE')).toHaveLength(1);
    expect(ledger.count()).toBe(3); // byCode did not drop anything
  });

  it('carries the enriched P1 fields (expected/actual/variance/ai)', () => {
    const ledger = new ExceptionLedger();
    const e = ledger.add(
      rec,
      'LOW_CONFIDENCE',
      'near match but below threshold',
      ['r2'],
      {
        matchType: 'PARTIAL',
        expectedPaise: rec.amountPaise,
        actualPaise: -4700,
        variancePaise: rec.amountPaise - -4700,
        confidence: 0.66,
        aiReasoning: 'suggested a near-amount partner; needs human review',
        reviewerDecision: 'OVERRIDE',
      },
    );
    expect(e.matchType).toBe('PARTIAL');
    expect(e.expectedPaise).toBe(-4800);
    expect(e.actualPaise).toBe(-4700);
    expect(e.variancePaise).toBe(-100);
    expect(e.status).toBe('OPEN');
    expect(e.reviewerDecision).toBe('OVERRIDE');
    expect(e.candidateIds).toEqual(['r2']);
    expect(e.recordJson.id).toBe('r1');
  });
});
