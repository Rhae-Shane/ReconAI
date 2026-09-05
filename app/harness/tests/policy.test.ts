/**
 * policy.test.ts — the deterministic-first policy surface:
 *  - the router's AI-safety policy (no AI without a key, no AI on a decided rule,
 *    strongest+human always has a human, AI is only ever a suggestion);
 *  - the netting policy (a fee only nets when a FEE record drives the math);
 *  - the resolve-threshold policy (the judge never silently crosses it).
 */
import { describe, it, expect } from 'vitest';
import { ModelRouter, ModelRegistry } from '../src/core/model.js';
import { ReconciliationEngine, buildCandidates } from '../src/core/reconcile.js';
import { HeuristicJudge } from '../src/core/judge.js';
import { DEFAULTS } from '../src/core/config.js';
import type { FinRecord, SourceKind } from '../src/core/types.js';

describe('router AI-safety policy', () => {
  it('without a configured key the router can never escalate to an AI tier', () => {
    const r = new ModelRouter(); // aiEnabled:false
    for (const input of [
      { ruleDeterminism: 0, riskLevel: 'HIGH' as const, amountPaise: 9_999_999 },
      { ruleDeterminism: 0, riskLevel: 'LOW' as const, amountPaise: 1 },
    ]) {
      expect(r.route(input).tier).toBe('no-model');
    }
  });

  it('AI can only suggest; it never self-approves or executes (no such surface)', () => {
    // The registry exposes no method that lets a model approve itself or apply a
    // financial effect — promote() is driven purely by recorded metrics.
    const reg = new ModelRegistry();
    const m = reg.register('m');
    expect(typeof (m as { approve?: unknown }).approve).toBe('undefined');
    expect(typeof (m as { execute?: unknown }).execute).toBe('undefined');
  });

  it('strongest+human always pairs an AI suggestion with human review', () => {
    const r = new ModelRouter({ aiEnabled: true });
    for (const d of [
      r.route({ ruleDeterminism: 0.1, riskLevel: 'HIGH' }),
      r.route({ ruleDeterminism: 0.4, amountPaise: 2_000_000 }),
    ]) {
      expect(d.tier).toBe('strongest+human');
      expect(d.manualReview).toBe(true);
    }
  });

  it('a fully deterministic rule is routed away from AI (deterministic-resolved)', () => {
    // The killer review metric: deterministic-resolved cases must NOT burn an AI call.
    const r = new ModelRouter({ aiEnabled: true });
    const d = r.route({ ruleDeterminism: 0.96, amountPaise: 1_000_000 });
    expect(d.tier).toBe('no-model');
    expect(d.estimatedCost).toBe(0);
  });
});

describe('registry policy: promote only on evidence, track override rate', () => {
  it('overrideRate is the trust signal the platform records per model', () => {
    const reg = new ModelRegistry();
    reg.register('m');
    reg.recordMetrics('m', { precision: 0.8, overridden: true, costDelta: 2, latencyMs: 10 });
    reg.recordMetrics('m', { precision: 1, overridden: false, costDelta: 2, latencyMs: 10 });
    expect(reg.get('m')!.metrics.overrideRate).toBe(0.5);
  });

  it('cannot promote to production without passing the min-samples gate', () => {
    const reg = new ModelRegistry();
    reg.register('m');
    for (let i = 0; i < 4; i++) {
      reg.recordMetrics('m', { precision: 1, overridden: false, costDelta: 0, latencyMs: 0 });
    }
    expect(() => reg.promote('m')).toThrow(); // 4 < min 5
  });
});

describe('netting policy', () => {
  const engine = new ReconciliationEngine();
  function rec(partial: Partial<FinRecord> & { id: string; kind: FinRecord['kind'] }): FinRecord {
    return {
      id: partial.id,
      source: (partial.source ?? 'razorpay-gateway') as SourceKind,
      kind: partial.kind,
      sourceRef: partial.sourceRef ?? partial.id,
      ts: partial.ts ?? '2026-08-14',
      amountPaise: partial.amountPaise ?? 0,
      currency: partial.currency ?? 'INR',
      utr: partial.utr,
      gatewayRef: partial.gatewayRef,
      orderRef: partial.orderRef,
    };
  }

  const gross = rec({ id: 'g', kind: 'PAYMENT', amountPaise: 5000, utr: 'UTRU' });
  const settled = rec({
    id: 's',
    kind: 'SETTLEMENT',
    source: 'bank-utr',
    amountPaise: 4800,
    utr: 'UTRU',
  });
  const fee = rec({ id: 'f', kind: 'FEE', amountPaise: -200, utr: 'UTRU' });

  it('a fee nets ONLY when a FEE-kind record drives the component', () => {
    // with the fee co-located -> FEE_NETTED
    const withFee = engine.nettedGroup([gross, settled, fee]);
    expect(withFee).not.toBeNull();
    expect(withFee!.matchType).toBe('FEE_NETTED');
    expect(Math.abs(withFee!.netting!.variancePaise)).toBeLessThanOrEqual(DEFAULTS.paiseTolerance);

    // without any driver -> null (never guessed from a bare amount hole)
    expect(engine.nettedGroup([gross, settled])).toBeNull();
  });

  it('a FEE record with no settlement leg cannot net', () => {
    expect(engine.nettedGroup([gross, fee])).toBeNull(); // no settlement present
    expect(engine.nettedGroup([settled, fee])).toBeNull(); // no base/gross present
  });
});

describe('resolve-threshold policy', () => {
  it('judge confidence never silently crosses the resolve threshold on text alone', () => {
    // Reuse the engine's candidate model: two equal-amount, matching-counterparty
    // records with NO identifier. NO_REF_CAP must sit below resolveThreshold.
    const flap: FinRecord = {
      id: 'flap',
      source: 'razorpay-gateway',
      kind: 'PAYMENT',
      sourceRef: 'P1',
      ts: '2026-08-14',
      amountPaise: 1000,
      currency: 'INR',
      counterparty: 'Acme',
      description: 'Acme',
    };
    const partner: FinRecord = {
      id: 'bnk',
      source: 'bank-utr',
      kind: 'SETTLEMENT',
      sourceRef: 'B1',
      ts: '2026-08-14',
      amountPaise: 1000,
      currency: 'INR',
      counterparty: 'Acme',
      description: 'Acme',
    };
    const judge = new HeuristicJudge();
    const candidates = buildCandidates(flap, [flap, partner], DEFAULTS);
    const result = judge.judgeCandidates(candidates, 'residual');
    expect(result.confidence).toBeLessThan(DEFAULTS.resolveThreshold);
    expect(HeuristicJudge.NO_REF_CAP).toBeLessThan(DEFAULTS.resolveThreshold);
  });
});
