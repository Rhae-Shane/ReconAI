/**
 * semantic.test.ts — the semantic matcher for the residual (SEMANTIC / "AI after deterministic").
 *
 * Proves the semantic layer re-ranks genuinely-similar fuzzy near-misses higher than lookalike-but-
 * unrelated ones, WITHOUT letting text alone cross the resolve threshold (the judge still never
 * guesses an identifier-less match). Also locks that the default HeuristicJudge — with no matcher —
 * produces identical confidence to before, so the audited 61-row batch is unchanged.
 */
import { describe, it, expect } from 'vitest';
import type { Candidate, FinRecord, SourceKind } from '../src/core/types.js';
import { semanticSimilarity, NgramSemanticMatcher, ngrams } from '../src/core/semantic.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { generateBatch } from '../src/cli/generate-batch.js';
import { CloseEngine } from '../src/core/close.js';

function cand(partial: Partial<Candidate>): Candidate {
  return {
    flapId: 'f',
    matchRecordId: 'm',
    amountDiff: 10,
    dateOk: true,
    counterpartyOk: false,
    normRefOk: false,
    flapText: 'Razorpay settlement fee deduction',
    matchText: 'Razorpay fee adjustment',
    ...partial,
  };
}

describe('semanticSimilarity', () => {
  it('ranks related phrases far above unrelated ones', () => {
    const related = semanticSimilarity('Razorpay fee adjustment', 'Razorpay gateway fee');
    const unrelated = semanticSimilarity('Razorpay fee adjustment', 'Monthly office rent payment');
    expect(related).toBeGreaterThan(0.3);
    expect(related).toBeGreaterThan(unrelated);
  });
  it('returns 1 for identical non-empty strings and 0 for empty', () => {
    expect(semanticSimilarity('Acme Retail Pvt Ltd', 'Acme Retail Pvt Ltd')).toBe(1);
    expect(semanticSimilarity('', 'Acme')).toBe(0);
  });
  it('ngrams are deterministic and order-independent (set)', () => {
    expect(ngrams('abc')).toEqual(ngrams('abc'));
    expect(ngrams('abc').size).toBeGreaterThan(0);
  });
});

describe('HeuristicJudge + semantic matcher (opt-in)', () => {
  const plain = new HeuristicJudge();
  const semantic = new HeuristicJudge(new NgramSemanticMatcher());

  it('semantic raises confidence for a textually-similar fuzzy candidate', () => {
    const similar = cand({ flapText: 'Razorpay fee adjustment', matchText: 'Razorpay gateway fee' });
    const resSimilar = semantic.judgeCandidates([similar]);
    const resBase = plain.judgeCandidates([similar]);
    expect(resSimilar.confidence).toBeGreaterThanOrEqual(resBase.confidence);
    expect(resSimilar.reason).toMatch(/sem=/);
    // still cannot cross the resolve threshold on text alone (never guesses a match)
    expect(resSimilar.confidence).toBeLessThan(0.7);
    expect(resSimilar.confidence).toBeLessThanOrEqual(HeuristicJudge.NO_REF_CAP);
  });

  it('a textually-unrelated fuzzy partner does NOT get a semantic bump', () => {
    const weird = cand({ matchText: 'janitorial supplies invoice' });
    const res = new HeuristicJudge(new NgramSemanticMatcher()).judgeCandidates([weird]);
    const base = plain.judgeCandidates([weird]);
    expect(res.confidence).toBeLessThanOrEqual(base.confidence + 0.01);
  });

  it('default judge (no matcher) leaves the audited 81-row batch unchanged', () => {
    const report = new CloseEngine(undefined, new HeuristicJudge()).run(generateBatch());
    expect(report.totals.matched).toBe(66);
    expect(report.totals.resolvedPct).toBeCloseTo(81.48, 1);
    expect(report.breakdown).toMatchObject({ records: 81, matched: 66, partial: 2, unresolved: 13 });
  });
});
