/**
 * model.ts — the model-agnostic AI layer: provider interfaces, a difficulty-tier
 * router, and the model registry (the AI evaluation platform).
 *
 * Deterministic-first principle (SPEC review P2 "deterministic-resolved vs AI-call
 * reduction"): AI is OPTIONAL and may only arbitrate the RESIDUAL left by the
 * deterministic passes (exact → normalized → fee-netted). The router decides, by
 * rule determinism + risk + amount, whether any model is consulted at all, and if
 * so which tier. The registry records precision/override-rate/cost/latency and
 * only promotes a model through staging → shadow → canary → production after it
 * has proven itself — it can never approve itself or execute financial effects
 * (there is structurally no method for that here; see ledger/audit for effects).
 */
import type { Judge } from './judge.js';

/** One message in an LLM chat turn. Trivially portable across providers. */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Any text LLM (Anthropic, OpenAI, Llama, ...). Returns raw text. */
export interface LLMProvider {
  complete(messages: ChatMessage[]): Promise<string>;
}

/** Any embedding model. Returns a fixed-size dense vector. */
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

/**
 * The residual judge is our existing Judge contract (HeuristicJudge by default,
 * or a Claude-backed judge). We alias it so the AI layer speaks one vocabulary.
 */
export type JudgeProvider = Judge;

/**
 * Difficulty tier the router can select. `no-model` means no AI is consulted
 * (deterministic rule suffices, or no key is configured).
 */
export type DifficultyTier = 'no-model' | 'small' | 'large' | 'strongest+human';

/** Risk classification used to pick the tier. */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

// ---------------------------------------------------------------------------
// ModelRouter
// ---------------------------------------------------------------------------

/** Cost/latency hooks let the caller plug in real accounting per tier. */
export type CostHook = (tier: DifficultyTier) => number;
export type LatencyHook = (tier: DifficultyTier) => number;

export interface RouterConfig {
  /** Amount (paise) at or above which risk is escalated (money at stake). */
  highRiskPaise: number;
  /** `ruleDeterminism >= this` ⇒ the residual is fully decided by a rule. */
  deterministicRuleCutoff: number;
  /** False when no provider key is configured (AI disabled). */
  aiEnabled: boolean;
  costFor: CostHook;
  latencyFor: LatencyHook;
}

export const DEFAULT_MODEL_COST: Record<DifficultyTier, number> = {
  'no-model': 0,
  small: 1,
  large: 5,
  'strongest+human': 20,
};

export const DEFAULT_MODEL_LATENCY_MS: Record<DifficultyTier, number> = {
  'no-model': 0,
  small: 300,
  large: 1200,
  'strongest+human': 3000,
};

export const ROUTER_DEFAULTS: RouterConfig = {
  highRiskPaise: 1_000_000, // ₹10,000
  deterministicRuleCutoff: 0.95,
  aiEnabled: false,
  costFor: (t) => DEFAULT_MODEL_COST[t],
  latencyFor: (t) => DEFAULT_MODEL_LATENCY_MS[t],
};

export interface RouteInput {
  /** How much (0..1) of this residual is settled by deterministic rules alone. */
  ruleDeterminism: number;
  /** Explicit risk override; otherwise derived from `amountPaise`. */
  riskLevel?: RiskLevel;
  /** Signed magnitude (paise) of the money at stake. */
  amountPaise?: number;
}

export interface RouterDecision {
  tier: DifficultyTier;
  riskLevel: RiskLevel;
  /** True when the residual must be reviewed by a human (AI suggestion only). */
  manualReview: boolean;
  estimatedCost: number;
  estimatedLatencyMs: number;
  rationale: string;
}

/** Derive risk from money at stake (paise). */
export function riskFromAmount(amountPaise: number | undefined, cfg: RouterConfig): RiskLevel {
  if (amountPaise === undefined) return 'LOW';
  const a = Math.abs(amountPaise);
  if (a >= cfg.highRiskPaise) return 'HIGH';
  if (a >= cfg.highRiskPaise / 10) return 'MEDIUM';
  return 'LOW';
}

/**
 * Routes a residual to a difficulty tier. Deterministic-first policy:
 *
 *  1. No AI key configured        → `no-model` (human only if high risk).
 *  2. Rule fully deterministic    → `no-model` (AI is never needed for a decided rule).
 *  3. Otherwise by risk: LOW → small, MEDIUM → large, HIGH → strongest+human (manual).
 *
 * The router can only *suggest* a tier and flag manual review — it cannot
 * configure effects, mend ledger truth, or bypass policy.
 */
export class ModelRouter {
  private cfg: RouterConfig;

  constructor(cfg?: Partial<RouterConfig>) {
    this.cfg = { ...ROUTER_DEFAULTS, ...(cfg ?? {}) };
  }

  route(input: RouteInput): RouterDecision {
    const determinism = clamp01(input.ruleDeterminism);
    const riskLevel = input.riskLevel ?? riskFromAmount(input.amountPaise, this.cfg);
    const root = `determinism=${determinism.toFixed(2)} risk=${riskLevel}`;

    if (!this.cfg.aiEnabled) {
      const manualReview = riskLevel === 'HIGH' && determinism < this.cfg.deterministicRuleCutoff;
      return {
        tier: 'no-model',
        riskLevel,
        manualReview,
        estimatedCost: 0,
        estimatedLatencyMs: 0,
        rationale: `${root}: AI disabled (no key) → no-model${manualReview ? ', human review' : ''}`,
      };
    }

    // A fully deterministic rule needs no model — don't spend an AI call on it.
    if (determinism >= this.cfg.deterministicRuleCutoff) {
      return {
        tier: 'no-model',
        riskLevel,
        manualReview: false,
        estimatedCost: 0,
        estimatedLatencyMs: 0,
        rationale: `${root}: rule fully deterministic → no-model (no AI call)`,
      };
    }

    switch (riskLevel) {
      case 'HIGH':
        return this.decide('strongest+human', riskLevel, true, determinism);
      case 'MEDIUM':
        return this.decide('large', riskLevel, false, determinism);
      default:
        return this.decide('small', riskLevel, false, determinism);
    }
  }

  /** Per-decision cost for the selected tier (delegates to the cost hook). */
  costOf(tier: DifficultyTier): number {
    return this.cfg.costFor(tier);
  }

  /** Per-decision latency for the selected tier (delegates to the latency hook). */
  latencyOf(tier: DifficultyTier): number {
    return this.cfg.latencyFor(tier);
  }

  private decide(
    tier: DifficultyTier,
    riskLevel: RiskLevel,
    manualReview: boolean,
    determinism: number,
  ): RouterDecision {
    return {
      tier,
      riskLevel,
      manualReview,
      estimatedCost: this.cfg.costFor(tier),
      estimatedLatencyMs: this.cfg.latencyFor(tier),
      rationale: `determinism=${determinism.toFixed(2)} risk=${riskLevel} → ${tier}${
        manualReview ? ' + human review' : ''
      }`,
    };
  }
}

// ---------------------------------------------------------------------------
// ModelRegistry — the AI evaluation platform
// ---------------------------------------------------------------------------

export type RegistryStage = 'staging' | 'shadow' | 'canary' | 'production';

export const STAGE_ORDER: readonly RegistryStage[] = [
  'staging',
  'shadow',
  'canary',
  'production',
];

/** Aggregate metrics recorded for one registered model (updated in place). */
export interface ModelMetrics {
  /** Running precision (0..1). */
  precision: number;
  /** Fraction of this model's decisions a human/judge overrode (0..1). */
  overrideRate: number;
  /** Cumulative cost across recorded samples. */
  cost: number;
  /** Running average latency (ms). */
  latencyMs: number;
  /** Number of decisions recorded. */
  sampleCount: number;
}

export interface RegisteredModel {
  id: string;
  version: string;
  stage: RegistryStage;
  provider: LLMProvider | null;
  metrics: ModelMetrics;
  registeredAt: string;
  notes?: string;
}

export function emptyMetrics(): ModelMetrics {
  return { precision: 0, overrideRate: 0, cost: 0, latencyMs: 0, sampleCount: 0 };
}

export interface RegisterOptions {
  provider?: LLMProvider | null;
  notes?: string;
}

/** One decision observation to fold into a model's aggregate metrics. */
export interface MetricsSample {
  precision: number; // 0..1 for this decision
  overridden: boolean;
  costDelta: number;
  latencyMs: number;
}

/**
 * Central registry + promotion gauntlet. A model enters at `staging`, must be
 * promoted one stage at a time (shadow → canary) before it can reach `production`.
 * Metrics (precision, override rate, cost, latency) are the evidence used to
 * promote; a model that is expensive, wrong, or frequently overridden stays put.
 */
export class ModelRegistry {
  private models = new Map<string, RegisteredModel>();
  private versionCounter = 0;

  constructor(private minPromoteSamples = 5) {}

  /** Register a model at `staging`, or return it if already registered. */
  register(id: string, opts: RegisterOptions = {}): RegisteredModel {
    const existing = this.models.get(id);
    if (existing) return existing; // stable registry — same id is one lineage
    this.versionCounter += 1;
    const model: RegisteredModel = {
      id,
      version: `${id}@v${this.versionCounter}`,
      stage: 'staging',
      provider: opts.provider ?? null,
      metrics: emptyMetrics(),
      registeredAt: new Date().toISOString(),
      notes: opts.notes,
    };
    this.models.set(id, model);
    return model;
  }

  /** True when the model has a provider attached (i.e. can actually be called). */
  isReady(id: string): boolean {
    return this.models.get(id)?.provider != null;
  }

  get(id: string): RegisteredModel | undefined {
    return this.models.get(id);
  }

  all(): RegisteredModel[] {
    return [...this.models.values()];
  }

  inStage(stage: RegistryStage): RegisteredModel[] {
    return this.all().filter((m) => m.stage === stage);
  }

  /**
   * Fold one decision sample into the model's running metrics. `overridden`
   * drives overrideRate (the trust check); `precision` drives the champion pick.
   */
  recordMetrics(id: string, sample: MetricsSample): RegisteredModel {
    const m = this.require(id);
    const n = m.metrics.sampleCount;
    const s = m.metrics;
    s.latencyMs = (s.latencyMs * n + sample.latencyMs) / (n + 1);
    s.cost += sample.costDelta;
    s.overrideRate = (s.overrideRate * n + (sample.overridden ? 1 : 0)) / (n + 1);
    s.precision = (s.precision * n + clamp01(sample.precision)) / (n + 1);
    s.sampleCount = n + 1;
    return m;
  }

  /**
   * Promote one stage forward through the gauntlet. Refuses to skip stages and
   * refuses to promote a model with too few samples (not yet evaluated).
   */
  promote(id: string): RegisteredModel {
    const m = this.require(id);
    const idx = STAGE_ORDER.indexOf(m.stage);
    if (idx >= STAGE_ORDER.length - 1)
      throw new Error(`model ${id} already at ${m.stage}; cannot promote`);
    if (m.metrics.sampleCount < this.minPromoteSamples)
      throw new Error(`model ${id} has ${m.metrics.sampleCount}/${this.minPromoteSamples} samples; promote later`);
    m.stage = STAGE_ORDER[idx + 1];
    return m;
  }

  /** Step one stage backward (e.g. a canary regresses to shadow after an incident). */
  demote(id: string): RegisteredModel {
    const m = this.require(id);
    const idx = STAGE_ORDER.indexOf(m.stage);
    if (idx <= 0) throw new Error(`model ${id} already at ${m.stage}; cannot demote`);
    m.stage = STAGE_ORDER[idx - 1];
    return m;
  }

  /**
   * The best-evaluated model in a stage — the registry's champion pick. Highest
   * precision first; ties broken by lowest override rate, then fewest samples.
   */
  best(stage: RegistryStage): RegisteredModel | null {
    const candidates = this.inStage(stage).filter((m) => m.metrics.sampleCount > 0);
    if (!candidates.length) return null;
    return candidates.reduce((a, b) => {
      const cmp = b.metrics.precision - a.metrics.precision;
      if (cmp !== 0) return cmp > 0 ? b : a;
      const o = a.metrics.overrideRate - b.metrics.overrideRate;
      if (o !== 0) return o > 0 ? a : b;
      return a.metrics.sampleCount <= b.metrics.sampleCount ? a : b;
    });
  }

  private require(id: string): RegisteredModel {
    const m = this.models.get(id);
    if (!m) throw new Error(`unknown model: ${id}`);
    return m;
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
