/**
 * materiality.ts — MaterialityEngine: classes a residual variance by its size so
 * the controller knows whether it may ride (auto-accept), needs a glance
 * (monitor), must be seen by a human (require-review) or needs formal approval
 * (require-approval). Deterministic and threshold-driven — no AI judgement here.
 *
 * Money is integer paise, signed. Magnitude of the variance drives the class.
 */
export type MaterialityLevel =
  | 'auto-accept'
  | 'monitor'
  | 'require-review'
  | 'require-approval';

/** Absolute (currency-native) escalation bands, all in paise. */
export interface AbsoluteThresholds {
  /** |variance| < autoAccept → auto-accept (no human). */
  autoAccept: number;
  /** |variance| < monitor → glance, no action required. */
  monitor: number;
  /** |variance| < review → a human must review. */
  review: number;
  /** |variance| >= mandatoryApproval → formal dual-sign approval required. */
  mandatoryApproval: number;
}

export interface MaterialityPolicy {
  absoluteThresholds: AbsoluteThresholds;
  /** Fraction of the base amount (0..1) that escalates a level. */
  percentageThreshold: number;
  /** Optional per-currency overrides of the absolute bands. */
  currencySpecific?: Record<string, Partial<AbsoluteThresholds>>;
}

/** Order for comparing strictness: later entries are stricter/higher. */
const LEVEL_ORDER: readonly MaterialityLevel[] = [
  'auto-accept',
  'monitor',
  'require-review',
  'require-approval',
];

const LEVEL_INDEX: Record<MaterialityLevel, number> = {
  'auto-accept': 0,
  monitor: 1,
  'require-review': 2,
  'require-approval': 3,
};

export function isStricter(a: MaterialityLevel, b: MaterialityLevel): boolean {
  return LEVEL_INDEX[a] > LEVEL_INDEX[b];
}

export function stricterOf(a: MaterialityLevel, b: MaterialityLevel): MaterialityLevel {
  return isStricter(a, b) ? a : b;
}

export interface MaterialityOutcome {
  level: MaterialityLevel;
  /** True when the level is stricter than auto-accept → a human is involved. */
  needsHuman: boolean;
  /** True when the level demands formal approver sign-off. */
  requiresApproval: boolean;
  /** Which threshold (absolute or percentage) actually drove the decision. */
  driver: 'absolute' | 'percentage' | 'both';
}

const DEFAULT_POLICY: MaterialityPolicy = {
  absoluteThresholds: {
    autoAccept: 0,
    monitor: 1_00, // < ₹1 → ride
    review: 1_00_00, // < ₹100 → glance
    mandatoryApproval: 10_00_00, // >= ₹1,000 → formal approval
  },
  percentageThreshold: 0.01, // >1% of base escalates
};

export class MaterialityEngine {
  private policy: MaterialityPolicy;

  constructor(policy: Partial<MaterialityPolicy> = {}) {
    this.policy = {
      ...DEFAULT_POLICY,
      ...policy,
      absoluteThresholds: {
        ...DEFAULT_POLICY.absoluteThresholds,
        ...policy.absoluteThresholds,
      },
    };
  }

  /** Absolute band for a currency, applying any per-currency override. */
  bandsFor(currency?: string): AbsoluteThresholds {
    const base = this.policy.absoluteThresholds;
    const over = currency ? this.policy.currencySpecific?.[currency] : undefined;
    return over ? { ...base, ...over } : base;
  }

  /**
   * Classify a variance using both the absolute bands and the percentage band.
   * `basePaise` (the money a decision concerns) is needed for the percentage
   * leg; when absent, only the absolute leg applies. The stricter of the two
   * legs wins.
   */
  classify(variancePaise: number, basePaise?: number, currency?: string): MaterialityOutcome {
    const abs = Math.abs(variancePaise);
    const bands = this.bandsFor(currency);

    let byAbsolute: MaterialityLevel;
    if (abs < bands.autoAccept) byAbsolute = 'auto-accept';
    else if (abs < bands.monitor) byAbsolute = 'monitor';
    else if (abs < bands.review) byAbsolute = 'require-review';
    else byAbsolute = 'require-approval';

    let byPercentage: MaterialityLevel = 'auto-accept';
    let activeRatio = 0;
    if (basePaise !== undefined && basePaise > 0) {
      activeRatio = abs / basePaise;
      const p = this.policy.percentageThreshold;
      if (activeRatio >= p) byPercentage = 'require-approval';
      else if (activeRatio >= p / 2) byPercentage = 'require-review';
      else if (activeRatio >= p / 10) byPercentage = 'monitor';
    }

    const level = stricterOf(byAbsolute, byPercentage);
    let driver: 'absolute' | 'percentage' | 'both' = 'absolute';
    if (byPercentage !== 'auto-accept' && byAbsolute !== byPercentage) driver = 'percentage';
    else if (byPercentage !== 'auto-accept' && byAbsolute === byPercentage) driver = 'both';

    return {
      level,
      needsHuman: level !== 'auto-accept',
      requiresApproval: level === 'require-approval',
      driver,
    };
  }

  /**
   * Apply the policy to a variance and decide whether a residual needs a human.
   * Convenience used by the residual handler: auto-accept → ride, otherwise a
   * human review (or, at the top band, approval) is required.
   */
  mergeInto(variancePaise: number, basePaise?: number, currency?: string): MaterialityOutcome {
    return this.classify(variancePaise, basePaise, currency);
  }
}
