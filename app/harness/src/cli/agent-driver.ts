/**
 * agent-driver.ts — headless agent tool loop over CloseEngine.
 *
 * Phase 2. The harness is framework-agnostic (zero runtime deps), so instead
 * of the Vercel AI SDK loop it drives the *same logical tool surface* the app's
 * Claude agent uses (SPEC §6: ingestSource, runReconciliation, judgeCandidates,
 * settlementQuery, forecastWindow, matchTaxLine, fileException, closeRun) as a
 * deterministic orchestrator. Every number a tool returns comes from the engine —
 * the "agent" only narrates, it never invents a value. It works with
 * HeuristicJudge when no API key is present (and the harness never requires one).
 *
 * The interesting assertion this file makes is the CLOSE control: `closeRun`
 * refuses to finalize the books while any exception is still OPEN. After the
 * deterministic run there are always honest exceptions (the seeded batch has 12),
 * so the driver's close attempt returns `PENDING_EXCEPTIONS` and prints the
 * report — match rate + the open exception list — rather than pretending a clean
 * close. That is the honesty moment, proven headlessly.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Batch,
  CloseReport,
  FinRecord,
  MatchGroup,
} from '../core/types.js';
import { CloseEngine, type CloseContext } from '../core/close.js';
import { HeuristicJudge, type Judge } from '../core/judge.js';
import { buildCandidates } from '../core/reconcile.js';
import { DEFAULTS } from '../core/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');
const BATCH_FILE = resolve(DATA_DIR, 'batch.json');

/** The canonical tool-call order the controller agent follows. */
export const AGENT_TOOL_ORDER = [
  'ingestSource',
  'runReconciliation',
  'judgeCandidates',
  'settlementQuery',
  'forecastWindow',
  'matchTaxLine',
  'fileException',
  'closeRun',
] as const;

export type ToolResult = { ok: boolean; code?: string; message?: string } & Record<string, unknown>;

export interface AgentTool {
  name: string;
  description: string;
  /** Concrete args used by the driver for a real run. */
  exampleArgs: Record<string, unknown>;
  exec: (args: Record<string, unknown>) => ToolResult;
}

export interface ToolCallRecord {
  name: string;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface AgentRun {
  report: CloseReport;
  trace: ToolCallRecord[];
  /** True when closeRun accepted finalization (i.e. zero OPEN exceptions). */
  finalized: boolean;
  /** True when closeRun was refused because exceptions were still pending. */
  finalizeRefused: boolean;
}

export function buildCloseAgentTools(ctx: CloseContext): AgentTool[] {
  const recordsBySource = (source: FinRecord['source']) => ctx.records.filter((r) => r.source === source).length;

  const perfSource = () => {
    const matchedIds = new Set(ctx.groups.flatMap((g) => g.recordIds));
    return [...new Set(ctx.records.map((r) => r.source))].map((source) => {
      const recs = ctx.records.filter((r) => r.source === source);
      const matched = recs.filter((r) => matchedIds.has(r.id)).length;
      return {
        source,
        total: recs.length,
        matched,
        matchRate: recs.length ? Number(((matched / recs.length) * 100).toFixed(1)) : 0,
      };
    });
  };

  /** Residual records the judge must arbitrate (from the honest exception set). */
  const flapRecords = () => {
    const ids = new Set(
      ctx.ledger.all
        .filter((e) => e.reasonCode === 'LOW_CONFIDENCE' || e.reasonCode === 'PARTIAL_FLAP')
        .map((e) => e.recordId)
        .filter((id): id is string => Boolean(id)),
    );
    return ctx.records.filter((r) => ids.has(r.id));
  };

  return [
    {
      name: 'ingestSource',
      description: 'Count normalized records per source (ingest is deterministic + idempotent).',
      exampleArgs: {},
      exec: () => ({
        ok: true,
        counts: {
          'razorpay-gateway': recordsBySource('razorpay-gateway'),
          'bank-utr': recordsBySource('bank-utr'),
          'erp-orders': recordsBySource('erp-orders'),
          'gst-invoices': recordsBySource('gst-invoices'),
        },
      }),
    },
    {
      name: 'runReconciliation',
      description: 'Deterministic EXACT -> NORMALIZED passes over the ingested set.',
      exampleArgs: { method: 'FULL' },
      exec: () => ({
        ok: true,
        groups: ctx.groups.length,
        flaps: flapRecords().length,
        perSource: perfSource(),
        resolvedPct: resolvePct(ctx.records, ctx.groups),
      }),
    },
    {
      name: 'judgeCandidates',
      description: 'Judge residual candidate sets; returns confidence + reason per candidacy.',
      exampleArgs: { recordIds: [] },
      exec: (args) => {
        const targets = (args.recordIds as string[] | undefined) ?? [];
        const judge: Judge = new HeuristicJudge();
        const decisions = targets.map((id) => {
          const rec = ctx.records.find((r) => r.id === id);
          if (!rec) return { recordId: id, confidence: 0, reason: 'unknown record', resolved: false };
          const candidates = buildCandidates(rec, ctx.records, DEFAULTS);
          const d = judge.judgeCandidates(candidates, 'residual');
          return {
            recordId: id,
            confidence: d.confidence,
            reason: d.reason,
            resolved: d.confidence >= DEFAULTS.resolveThreshold,
          };
        });
        return { ok: true, decisions };
      },
    },
    {
      name: 'settlementQuery',
      description: 'Natural-language query over the settled ledger (engine-computed).',
      exampleArgs: { query: 'which UTRs settled on 14 Aug?' },
      exec: (args) => {
        const q = String(args.query ?? '');
        const settled = ctx.settlements;
        if (/utr/i.test(q)) {
          const utrs = settled.map((s) => s.utr).filter((u): u is string => Boolean(u));
          return { ok: true, answer: `${utrs.length} settlement UTR(s): ${utrs.slice(0, 6).join(', ')}${utrs.length > 6 ? ', …' : ''}` };
        }
        const total = settled.reduce((a, s) => a + s.amountPaise, 0);
        return { ok: true, answer: `Total settled across ${settled.length} batch(es): ₹${(total / 100).toFixed(2)}` };
      },
    },
    {
      name: 'forecastWindow',
      description: 'Project forward cash over the next N days with a confidence band + grounding.',
      exampleArgs: { days: 7 },
      exec: (args) => {
        const days = Number(args.days ?? 7);
        const series = ctx.forecast.slice(0, days);
        return {
          ok: true,
          days: series.length,
          series,
          groundedRecords: series.filter((f) => f.reconciledIn).length,
        };
      },
    },
    {
      name: 'matchTaxLine',
      description: 'Map lines to GST/HSN categories (rules first).',
      exampleArgs: { recordIds: [] },
      exec: (args) => {
        const want = new Set((args.recordIds as string[] | undefined) ?? []);
        const selected = want.size ? ctx.taxMatches.filter((t) => want.has(t.recordId)) : ctx.taxMatches;
        return {
          ok: true,
          matched: countBy(selected, (t) => t.matchedBy),
          total: ctx.taxMatches.length,
        };
      },
    },
    {
      name: 'fileException',
      description: 'Honestly file unresolved records with a reason code (never a silent drop).',
      exampleArgs: {},
      exec: () => {
        const open = ctx.ledger.all.filter((e) => e.status === 'OPEN');
        const byCode = countBy(open, (e) => e.reasonCode);
        return { ok: true, totalOpen: open.length, byCode };
      },
    },
    {
      name: 'closeRun',
      description:
        'TERMINAL action — finalize and emit the CloseReport. REFUSES while exceptions are still OPEN.',
      exampleArgs: {},
      exec: () => {
        const open = ctx.ledger.all.filter((e) => e.status === 'OPEN').length;
        if (open > 0) {
          return {
            ok: false,
            code: 'PENDING_EXCEPTIONS',
            message: `${open} exception(s) are still OPEN. File or resolve them before closing the books.`,
            openExceptions: open,
          };
        }
        return {
          ok: true,
          report: {
            matchRatePct: resolvePct(ctx.records, ctx.groups),
            groups: ctx.groups.length,
            exceptions: 0,
          },
        };
      },
    },
  ];
}

/** Run every tool in canonical order and collect the trace. */
export function runCloseAgent(batch: Batch, judge?: Judge): AgentRun {
  const engine = new CloseEngine(undefined, judge ?? new HeuristicJudge());
  const report = engine.run(batch);
  const ctx = report.__ctx!;
  const tools = new Map(buildCloseAgentTools(ctx).map((t) => [t.name, t]));

  const trace: ToolCallRecord[] = [];
  for (const name of AGENT_TOOL_ORDER) {
    const tool = tools.get(name);
    if (!tool) continue;
    const args = tool.exampleArgs;
    const result = tool.exec(args);
    trace.push({ name, args, result });
  }

  const close = trace.find((t) => t.name === 'closeRun')?.result;
  return {
    report,
    trace,
    finalized: close?.ok === true,
    finalizeRefused: close?.code === 'PENDING_EXCEPTIONS',
  };
}

export function printAgentRun(run: AgentRun): void {
  const t = run.report.totals;
  console.log(`AGENT DRIVER · ${run.report.batchId ?? 'batch'}`);
  console.log(
    `records=${t.records} · sources=${t.sources} · resolved=${t.resolvedPct}% · exceptions=${t.exceptionCount} · ` +
      `precision=${run.report.precision.toFixed(2)} · recall=${run.report.recall.toFixed(2)}`,
  );
  console.log('tool trace:');
  for (const step of run.trace) {
    const status = step.result.ok ? 'ok' : `refused:${step.result.code}`;
    console.log(`  ${step.name.padEnd(18)} ${status}`);
  }
  console.log(
    `CLOSE CONTROL → ${run.finalizeRefused ? 'refused (PENDING_EXCEPTIONS): books left open, exceptions visible' : run.finalized ? 'finalized' : 'no closeRun call'}`,
  );
  console.log('  open exceptions:');
  run.report.exceptions.forEach((e) => {
    console.log(`    [${e.reasonCode.padEnd(16)}] ${e.recordId ?? e.recordJson.id} — ${e.rationale}`);
  });
}

function resolvePct(records: FinRecord[], groups: MatchGroup[]): number {
  const matched = new Set(groups.flatMap((g) => g.recordIds)).size;
  return records.length ? Math.round((matched / records.length) * 10000) / 100 : 0;
}

function countBy<T>(items: T[], key: (t: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    const k = key(it);
    if (k) out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function main(): void {
  const batch: Batch = JSON.parse(readFileSync(BATCH_FILE, 'utf8'));
  const run = runCloseAgent(batch, new HeuristicJudge());
  printAgentRun(run);
}

if (process.argv[1]?.endsWith('agent-driver.ts')) {
  main();
}
