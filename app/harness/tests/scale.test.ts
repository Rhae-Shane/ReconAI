/**
 * scale.test.ts — P2 "Proof": 100 / 1K / 10K scale study.
 *
 * CloseEngine over deterministic generateScaledBatch batches must complete,
 * account for every record, keep precision = recall = 1.0, and surface the
 * review's killer metric: deterministic-vs-AI-call reduction. Because the bench
 * runs under HeuristicJudge (which resolves every flap deterministically),
 * aiResolved is always 0 -> deterministicResolved% = 100 and
 * llmCallsAvoided = candidates.
 *
 * All outcome numbers are deterministic (fixed seed), so the thresholds below
 * are measured (npm run benchmark), not guessed.
 */
import { describe, it, expect } from 'vitest';
import { generateScaledBatch } from '../src/cli/generate-batch.js';
import { CloseEngine } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { runBench, BENCH_N, SIZES } from '../src/cli/benchmark.js';

const N = BENCH_N;
const batch = generateScaledBatch(N);

describe('scaled benchmark study (100 / 1K / 10K)', () => {
  it('runBench(100) returns finite duration and enough records', () => {
    const m = runBench(100);
    expect(Number.isFinite(m.durationMs)).toBe(true);
    expect(m.durationMs).toBeGreaterThan(0);
    expect(m.records).toBeGreaterThanOrEqual(100);
  });

  it('runBench reports the headline deterministic-vs-AI metric at 100/1K/10K', () => {
    const expected = new Map<number, { matched: number; candidates: number; exceptions: number }>([
      [100, { matched: 72, candidates: 20, exceptions: 28 }],
      [1000, { matched: 720, candidates: 200, exceptions: 280 }],
      [10000, { matched: 7200, candidates: 2000, exceptions: 2800 }],
    ]);
    for (const size of SIZES) {
      const m = runBench(size);
      const exp = expected.get(size)!;
      expect(m.size).toBe(size);
      expect(m.records).toBe(size);
      expect(m.matched).toBe(exp.matched);
      expect(m.aiResolved).toBe(0); // HeuristicJudge: no AI calls, ever
      expect(m.candidates).toBe(exp.candidates);
      expect(m.exceptions).toBe(exp.exceptions);
      // killer metric: deterministic-first resolution means no LLM spend
      expect(m.deterministicResolvedPct).toBe(100);
      expect(m.llmCallsAvoided).toBe(exp.candidates);
      expect(m.durationMs).toBeGreaterThan(0);
    }
  });

  it('generates exactly 1000 records with a label for every record', () => {
    const total = batch.sources.reduce((a, s) => a + s.rows.length, 0);
    expect(total).toBe(1000);
    expect(Object.keys(batch.labels!)).toHaveLength(1000);
  });

  it('CloseEngine completes and accounts for every record', () => {
    const report = new CloseEngine(undefined, new HeuristicJudge()).run(batch);
    const b = report.breakdown;
    expect(b.records).toBe(1000);
    expect(b.matched + b.partial + b.unresolved).toBe(b.records);
    expect(b.matchRate).toBeGreaterThan(0);
    expect(b.matchRate).toBeLessThanOrEqual(1);
    expect(b.matched).toBeGreaterThan(0);
    // unresolved lines match the unresolved count
    expect(report.unresolved).toHaveLength(b.unresolved);
  });

  it('has exact + netted matches at scale (NETTED groups present)', () => {
    const report = new CloseEngine(undefined, new HeuristicJudge()).run(batch);
    const methods = new Set(report.__ctx!.groups.map((g) => g.method));
    expect(methods.has('EXACT')).toBe(true);
    expect(methods.has('NETTED')).toBe(true);
    const netted = report.__ctx!.groups.filter((g) => g.method === 'NETTED');
    expect(netted.length).toBeGreaterThanOrEqual(1);
    for (const g of netted) expect(g.confidence).toBeGreaterThanOrEqual(0.98);
  });

  it('keeps precision and recall at 1.00 at scale', () => {
    const report = new CloseEngine(undefined, new HeuristicJudge()).run(batch);
    expect(report.precision).toBe(1);
    expect(report.recall).toBe(1);
  });
});
