/**
 * evaluation.test.ts — AI evaluation metrics + model-to-model comparison.
 */
import { describe, it, expect } from 'vitest';
import {
  evaluate,
  compareModels,
  HIGHER_IS_BETTER,
} from '../src/core/evaluation.js';
import type {
  AiDecision,
  GroundTruthDecision,
} from '../src/core/evaluation.js';

const GT: GroundTruthDecision[] = [
  { recordId: 'r1', positive: true },
  { recordId: 'r2', positive: true },
  { recordId: 'r3', positive: false },
  { recordId: 'r4', positive: false },
];

const D: AiDecision[] = [
  { recordId: 'r1', decision: true, confidence: 0.9, overridden: false, cost: 2, latencyMs: 100 },
  { recordId: 'r2', decision: false, confidence: 0.3, overridden: false, cost: 2, latencyMs: 100 }, // FN
  { recordId: 'r3', decision: true, confidence: 0.8, overridden: true, cost: 2, latencyMs: 100 }, // FP
  { recordId: 'r4', decision: false, confidence: 0.2, overridden: false, cost: 2, latencyMs: 100 },
];

describe('evaluate: binary AI metrics', () => {
  it('computes the confusion matrix + precision/recall', () => {
    const rep = evaluate(D, GT, { datasetVersion: 'v1' });
    expect(rep.datasetVersion).toBe('v1');
    expect(rep.n).toBe(4);
    expect(rep.tp).toBe(1);
    expect(rep.fp).toBe(1);
    expect(rep.tn).toBe(1);
    expect(rep.fn).toBe(1);
    expect(rep.precision).toBeCloseTo(1 / 2, 5);
    expect(rep.recall).toBeCloseTo(1 / 2, 5);
    expect(rep.falsePositiveRate).toBeCloseTo(1 / 2, 5);
    expect(rep.falseNegativeRate).toBeCloseTo(1 / 2, 5);
  });

  it('computes Brier calibration and override rate', () => {
    const rep = evaluate(D, GT, { datasetVersion: 'v1' });
    // outcomes: r1=1 -> (0.9-1)^2=0.01, r2=1 -> (0.3-1)^2=0.49,
    //            r3=0 -> (0.8)^2=0.64,  r4=0 -> (0.2)^2=0.04  => mean 1.18/4
    expect(rep.calibrationBrier).toBeCloseTo(1.18 / 4, 5);
    expect(rep.overrideRate).toBeCloseTo(1 / 4, 5);
  });

  it('accumulates cost and average latency', () => {
    const rep = evaluate(D, GT, { datasetVersion: 'v1' });
    expect(rep.totalCost).toBe(8);
    expect(rep.avgLatencyMs).toBe(100);
  });

  it('returns zeroes for an empty (unlabelled) eval', () => {
    const rep = evaluate([{ recordId: 'zz', decision: true, confidence: 1, overridden: false, cost: 0, latencyMs: 0 }], GT, { datasetVersion: 'v0' });
    expect(rep.n).toBe(0);
    expect(rep.precision).toBe(0);
    expect(rep.recall).toBe(0);
  });
});

describe('compareModels: which model is better per metric', () => {
  const good = evaluate(
    [
      { recordId: 'a', decision: true, confidence: 0.9, overridden: false, cost: 1, latencyMs: 50 },
      { recordId: 'b', decision: false, confidence: 0.1, overridden: false, cost: 1, latencyMs: 50 },
    ],
    [
      { recordId: 'a', positive: true },
      { recordId: 'b', positive: false },
    ],
    { datasetVersion: 'ds@48' },
  );
  const bad = evaluate(
    [
      { recordId: 'a', decision: false, confidence: 0.2, overridden: true, cost: 10, latencyMs: 900 },
      { recordId: 'b', decision: true, confidence: 0.8, overridden: false, cost: 10, latencyMs: 900 },
    ],
    [
      { recordId: 'a', positive: true },
      { recordId: 'b', positive: false },
    ],
    { datasetVersion: 'ds@48' },
  );

  it('tags every comparison with the dataset version it used', () => {
    expect(good.datasetVersion).toBe('ds@48');
    expect(bad.datasetVersion).toBe('ds@48');
    expect(good).not.toBe(bad);
  });

  it('picks A as better on higher-is-better and lower-is-better metrics', () => {
    const cmp = compareModels(good, bad);
    expect(cmp.overall).toBe('a');
    expect(cmp.byMetric.precision).toBe('a');
    expect(cmp.byMetric.recall).toBe('a');
    expect(cmp.byMetric.calibrationBrier).toBe('a'); // lower Brier is better
    expect(cmp.byMetric.totalCost).toBe('a'); // lower cost is better
    expect(cmp.byMetric.avgLatencyMs).toBe('a');
    expect(cmp.byMetric.overrideRate).toBe('a');
    expect(HIGHER_IS_BETTER.has('precision')).toBe(true);
  });

  it('better/worse report mirror images', () => {
    const cmp = compareModels(good, bad);
    expect(cmp.better).toContain('precision');
    expect(cmp.worse).not.toContain('precision');
    const rev = compareModels(bad, good);
    expect(rev.overall).toBe('b');
    expect(rev.worse).toContain('precision');
  });

  it('identical evaluations are an overall tie', () => {
    const cmp = compareModels(good, good);
    expect(cmp.overall).toBe('tie');
  });
});
