/**
 * agent.test.ts — Phase 2: the headless agent tool loop (agent-driver.ts).
 *
 * With no model (and no API key) in the harness, we assert the two contracts the
 * agent layer must honour without a real model in the loop:
 *   1. TOOL-CALL ORDERING — the controller invokes the tool surface in the fixed
 *      canonical order, and never asserts a number the engine didn't compute.
 *   2. THE CLOSE CONTROL — `closeRun` refuses to finalize the books while any
 *      exception is still OPEN (PENDING_EXCEPTIONS), so an unresolved batch can
 *      never be presented as a clean close. That is the honesty moment, headless.
 */
import { describe, it, expect } from 'vitest';
import { generateBatch } from '../src/cli/generate-batch.js';
import {
  AGENT_TOOL_ORDER,
  buildCloseAgentTools,
  runCloseAgent,
} from '../src/cli/agent-driver.js';
import { CloseEngine, type CloseContext } from '../src/core/close.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { ExceptionLedger } from '../src/core/exception.js';

const batch = generateBatch();

describe('agent tool-call ordering', () => {
  const run = runCloseAgent(batch, new HeuristicJudge());

  it('invokes the tools in the canonical controller order', () => {
    expect(run.trace.map((t) => t.name)).toEqual([...AGENT_TOOL_ORDER]);
  });

  it('every non-terminal tool returned ok (engine numbers, no invented values)', () => {
    for (const step of run.trace.filter((t) => t.name !== 'closeRun')) {
      expect(step.result.ok, `${step.name} should be ok`).toBe(true);
    }
  });

  it('reconciliation reports the engine-matched composition (incl. netted)', () => {
    const recon = run.trace.find((t) => t.name === 'runReconciliation')!.result;
    expect(recon.groups).toBe(22); // 15 exact + 1 normalized + 6 netted
    expect(recon.resolvedPct).toBeCloseTo(81.48, 1);
    const perSource = recon.perSource as Array<{ source: string; matched: number }>;
    // bank-utr now matches 15 clean/pass-tolerance settlements + 6 netted = 21 (approx per report)
    expect(perSource.find((s) => s.source === 'bank-utr')!.matched).toBe(22);
  });

  it('forecast and tax tool results come from the engine context', () => {
    const fc = run.trace.find((t) => t.name === 'forecastWindow')!.result;
    expect((fc.series as unknown[]).length).toBe(7);
    const tax = run.trace.find((t) => t.name === 'matchTaxLine')!.result;
    expect((tax.total as number)).toBeGreaterThan(0);
  });
});

describe('closeRun control (the honesty moment)', () => {
  it('refuses to finalize while exceptions remain OPEN', () => {
    const run = runCloseAgent(batch, new HeuristicJudge());
    expect(run.finalized).toBe(false);
    expect(run.finalizeRefused).toBe(true);
    const close = run.trace.find((t) => t.name === 'closeRun')!.result;
    expect(close.ok).toBe(false);
    expect(close.code).toBe('PENDING_EXCEPTIONS');
    expect(close.openExceptions).toBe(run.report.totals.exceptionCount);
  });

  it('finalizes cleanly once every exception is resolved (no pending)', () => {
    const engine = new CloseEngine(undefined, new HeuristicJudge());
    const report = engine.run(batch);
    const ctx = report.__ctx!;
    // Mark all exceptions reviewed so the run has zero OPEN — a clean close.
    const tools = buildCloseAgentTools({
      ...ctx,
      ledger: resolvedLedger(ctx),
    });
    const closeRun = tools.find((t) => t.name === 'closeRun')!;
    const result = closeRun.exec({});
    expect(result.ok).toBe(true);
    expect(result.report).toMatchObject({ matchRatePct: 81.48, groups: 22, exceptions: 0 });
  });

  it('a FORCED low-confidence record is surfaced, not hidden, and blocks close', () => {
    // Rebuild the ledger so a real LOW_CONFIDENCE record exists among OPEN items.
    const engine = new CloseEngine(undefined, new HeuristicJudge());
    const report = engine.run(batch);
    const lowConf = report.exceptions.filter((e) => e.reasonCode === 'LOW_CONFIDENCE');
    expect(lowConf.length).toBeGreaterThan(0);
    // and every exception remains OPEN -> closeRun still refused
    const ctx = report.__ctx!;
    const tools = buildCloseAgentTools(ctx);
    const closeRun = tools.find((t) => t.name === 'closeRun')!;
    expect(closeRun.exec({})).toMatchObject({ ok: false, code: 'PENDING_EXCEPTIONS' });
  });
});

/** A CloseContext whose ledger has zero OPEN exceptions (all resolved). */
function resolvedLedger(ctx: CloseContext): ExceptionLedger {
  const ledger = new ExceptionLedger(ctx.ledger.all[0]?.runId ?? 'run');
  for (const e of ctx.ledger.all) {
    ledger.add(null, e.reasonCode, e.rationale, e.candidateIds, {}, 'RESOLVED');
  }
  return ledger;
}
