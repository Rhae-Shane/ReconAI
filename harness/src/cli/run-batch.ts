/**
 * run-batch.ts — reads the seeded 81-record batch, runs CloseEngine, writes
 * `report.json` + `report.csv`, and prints the headless summary:
 *
 *   records=81 · sources=4 · resolved=NN% · exceptions=N · precision=0.XX · recall=0.XX
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Batch } from '../core/types.js';
import { CloseEngine } from '../core/close.js';
import { HeuristicJudge } from '../core/judge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const OUT_DIR = resolve(__dirname, '../../output');
const BATCH_FILE = resolve(DATA_DIR, 'batch.json');

export function run(): void {
  const batch: Batch = JSON.parse(readFileSync(BATCH_FILE, 'utf8'));
  const judge = new HeuristicJudge();
  const engine = new CloseEngine(undefined, judge);
  const report = engine.run(batch);

  const bid = report.batchId ?? 'batch';
  mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = resolve(OUT_DIR, `${bid}-report.json`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  const csvPath = resolve(OUT_DIR, `${bid}-report.csv`);
  writeFileSync(csvPath, toCsv(report), 'utf8');

  const t = report.totals;
  console.log(
    `records=${t.records} · sources=${t.sources} · resolved=${t.resolvedPct}% · ` +
      `exceptions=${t.exceptionCount} · precision=${report.precision.toFixed(2)} · ` +
      `recall=${report.recall.toFixed(2)}`,
  );
  console.log(`  groups=${t.groups} · matched=${t.matched} · auditEvents=${report.auditCount}`);
  const b = report.breakdown;
  console.log(
    `  Matched: ${b.matched}   Partial: ${b.partial}   Unresolved: ${b.unresolved}   ` +
      `Match Rate: ${((b.matchRate ?? 0) * 100).toFixed(2)}%`,
  );
  console.log('  unresolved breakdown (ref, expected, actual, diff, reason, confidence, status):');
  for (const u of report.unresolved) {
    console.log(
      `    ${u.ref.padEnd(14)} exp=${u.expectedPaise} act=${u.actualPaise} ` +
        `diff=${u.differencePaise} ${u.reason.padEnd(16)} conf=${u.confidence.toFixed(2)} ${u.status}`,
    );
  }
  console.log('  per-source match rate:');
  for (const s of report.perSource) {
    console.log(
      `    ${s.source.padEnd(18)} total=${s.total} matched=${s.matched} ` +
        `rate=${(s.matchRate * 100).toFixed(0).padStart(3)}% exceptions=${s.exceptionCount}`,
    );
  }
  console.log('  exceptions:');
  for (const e of report.exceptions) {
    console.log(`    [${e.reasonCode.padEnd(16)}] ${e.recordId ?? e.recordJson.id} — ${e.rationale}`);
  }
  console.log(`  wrote ${jsonPath}`);
  console.log(`  wrote ${csvPath}`);
}

function toCsv(report: ReturnType<CloseEngine['run']>): string {
  const header = 'reasonCode,recordId,counterparty,amountPaise,rationale,candidateIds';
  const lines = report.exceptions.map((e) => {
    const rec = e.recordJson as { counterparty?: string; amountPaise?: number };
    return [
      e.reasonCode,
      e.recordId ?? '',
      rec.counterparty ?? '',
      rec.amountPaise ?? '',
      JSON.stringify(e.rationale),
      e.candidateIds.join('|'),
    ]
      .map((c) => `"${String(c ?? '').replaceAll('"', '""')}"`)
      .join(',');
  });
  return [header, ...lines].join('\n');
}

if (process.argv[1]?.endsWith('run-batch.ts')) {
  run();
}
