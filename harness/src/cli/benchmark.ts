/**
 * benchmark.ts — Honest CloseEngine performance at 100 / 1K / 10K.
 *
 * Runs CloseEngine over deterministic generateScaledBatch batches under
 * HeuristicJudge (no LLM). Measures wall time with process.hrtime.bigint().
 *
 * Run via `npm run benchmark` (or `npm run bench`).
 */
import { CloseEngine } from '../core/close.js';
import { HeuristicJudge } from '../core/judge.js';
import { generateScaledBatch } from './generate-batch.js';

export const BENCH_N = 1000;
export const SIZES: number[] = [100, 1000, 10000];

export interface BenchMetrics {
  size: number;
  durationMs: number;
  records: number;
  matched: number;
  candidates: number; // flaps the judge arbitrated
  aiResolved: number; // flaps actually sent to the AI judge
  exceptions: number;
  deterministicResolvedPct: number;
  llmCallsAvoided: number;
}

export function runBench(n: number = BENCH_N): BenchMetrics {
  const batch = generateScaledBatch(n);
  const engine = new CloseEngine(undefined, new HeuristicJudge());
  const start = process.hrtime.bigint();
  const report = engine.run(batch);
  const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

  const matched = report.breakdown.matched;
  const candidates = report.judge.candidates;
  const aiResolved = report.judge.resolved;
  const deterministicResolvedPct = matched > 0 ? (100 * (matched - aiResolved)) / matched : 0;
  const llmCallsAvoided = candidates - aiResolved;

  return {
    size: n,
    durationMs,
    records: report.totals.records,
    matched,
    candidates,
    aiResolved,
    exceptions: report.totals.exceptionCount,
    deterministicResolvedPct,
    llmCallsAvoided,
  };
}

function formatRecords(n: number): string {
  return n.toLocaleString('en-US');
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatThroughput(records: number, durationMs: number): string {
  const perSec = durationMs > 0 ? (records / durationMs) * 1000 : 0;
  return `${Math.round(perSec).toLocaleString('en-US')}/sec`;
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

function main(): void {
  // Warmup — discard (JIT / allocator settle)
  runBench(100);

  const colRecords = 14;
  const colTime = 14;

  console.log('RECONAI PERFORMANCE BENCHMARK');
  console.log('');
  console.log(`${pad('Records', colRecords)}${pad('Time', colTime)}Throughput`);

  for (const n of SIZES) {
    const r = runBench(n);
    console.log(
      `${pad(formatRecords(r.size), colRecords)}${pad(formatTime(r.durationMs), colTime)}${formatThroughput(r.records, r.durationMs)}`,
    );
  }

  console.log('');
  console.log('HeuristicJudge · deterministic · no LLM · fixed seed (generateScaledBatch)');
}

if (process.argv[1]?.endsWith('benchmark.ts')) {
  main();
}
