/**
 * model.test.ts — difficulty-tier ModelRouter (deterministic-first) and the
 * ModelRegistry promotion gauntlet / evaluation platform.
 */
import { describe, it, expect } from 'vitest';
import {
  ModelRouter,
  ModelRegistry,
  ROUTER_DEFAULTS,
  riskFromAmount,
} from '../src/core/model.js';

describe('ModelRouter: deterministic-first tier routing', () => {
  const router = new ModelRouter(); // aiEnabled: false by default

  it('no AI key -> no-model tier; human only on a high-risk residual', () => {
    const low = router.route({ ruleDeterminism: 0.4, amountPaise: 500 });
    expect(low.tier).toBe('no-model');
    expect(low.manualReview).toBe(false);

    const high = router.route({ ruleDeterminism: 0.4, amountPaise: 2_000_000 });
    expect(high.tier).toBe('no-model');
    expect(high.manualReview).toBe(true);
  });

  it('a fully deterministic rule never spends an AI call even with AI enabled', () => {
    const enabled = new ModelRouter({ aiEnabled: true });
    const d = enabled.route({ ruleDeterminism: 0.99, amountPaise: 3_000_000 });
    expect(d.tier).toBe('no-model');
    expect(d.estimatedCost).toBe(0);
  });

  it('routes the residual by risk when AI is enabled', () => {
    const enabled = new ModelRouter({ aiEnabled: true });
    expect(enabled.route({ ruleDeterminism: 0.5, amountPaise: 100 }).tier).toBe('small');
    expect(enabled.route({ ruleDeterminism: 0.5, amountPaise: 200_000 }).tier).toBe('large');
    expect(enabled.route({ ruleDeterminism: 0.5, amountPaise: 2_000_000 }).tier).toBe(
      'strongest+human',
    );
  });

  it('strongest+human always forces a manual review (AI is a suggestion)', () => {
    const d = new ModelRouter({ aiEnabled: true }).route({
      ruleDeterminism: 0.2,
      riskLevel: 'HIGH',
    });
    expect(d.tier).toBe('strongest+human');
    expect(d.manualReview).toBe(true);
  });

  it('riskFromAmount maps paise money-at-stake thresholds', () => {
    expect(riskFromAmount(100, ROUTER_DEFAULTS)).toBe('LOW');
    expect(riskFromAmount(500_000, ROUTER_DEFAULTS)).toBe('MEDIUM');
    expect(riskFromAmount(1_000_000, ROUTER_DEFAULTS)).toBe('HIGH');
  });

  it('cost/latency hooks are tier-ordered (stronger model is pricier)', () => {
    const r = new ModelRouter({ aiEnabled: true });
    expect(r.costOf('strongest+human')).toBeGreaterThan(r.costOf('small'));
    expect(r.latencyOf('large')).toBeGreaterThan(r.latencyOf('small'));
    expect(r.costOf('no-model')).toBe(0);
  });
});

describe('ModelRegistry: promotion gauntlet + metrics', () => {
  it('registers at staging, enforces min samples, cannot skip stages', () => {
    const reg = new ModelRegistry();
    reg.register('m1');
    expect(reg.get('m1')!.stage).toBe('staging');
    expect(() => reg.promote('m1')).toThrow(); // 0 samples < min

    for (let i = 0; i < 6; i++) {
      reg.recordMetrics('m1', { precision: 1, overridden: false, costDelta: 1, latencyMs: 10 });
    }
    reg.promote('m1');
    expect(reg.get('m1')!.stage).toBe('shadow');
    reg.promote('m1');
    reg.promote('m1');
    expect(reg.get('m1')!.stage).toBe('production');
    expect(() => reg.promote('m1')).toThrow(); // already production
  });

  it('tracks precision/override/cost/latency running aggregates', () => {
    const reg = new ModelRegistry();
    reg.register('m2');
    reg.recordMetrics('m2', { precision: 1, overridden: false, costDelta: 10, latencyMs: 100 });
    reg.recordMetrics('m2', { precision: 0, overridden: true, costDelta: 5, latencyMs: 300 });
    const me = reg.get('m2')!.metrics;
    expect(me.sampleCount).toBe(2);
    expect(me.cost).toBe(15);
    expect(me.precision).toBe(0.5);
    expect(me.overrideRate).toBe(0.5);
    expect(me.latencyMs).toBe(200);
  });

  it('best(stage) picks highest precision model with evidence', () => {
    const reg = new ModelRegistry();
    reg.register('A');
    reg.register('B');
    for (let i = 0; i < 6; i++) {
      reg.recordMetrics('A', { precision: 0.9, overridden: false, costDelta: 5, latencyMs: 10 });
      reg.recordMetrics('B', { precision: 0.95, overridden: false, costDelta: 5, latencyMs: 10 });
    }
    expect(reg.best('staging')!.id).toBe('B');
    expect(reg.best('production')).toBeNull(); // nothing promoted yet
  });

  it('isReady reflects an attached provider; demote steps one stage back', () => {
    const reg = new ModelRegistry();
    reg.register('x');
    expect(reg.isReady('x')).toBe(false);
    for (let i = 0; i < 6; i++)
      reg.recordMetrics('x', { precision: 1, overridden: false, costDelta: 0, latencyMs: 1 });
    reg.promote('x');
    reg.promote('x');
    reg.demote('x');
    expect(reg.get('x')!.stage).toBe('shadow');
  });
});
