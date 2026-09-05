/**
 * config.ts — FinanceConfig defaults + resolution helper (SPEC §5).
 */
import type { FinanceConfig } from './types.js';

export const DEFAULTS: FinanceConfig = {
  paiseTolerance: 50, // ≤ ₹0.50 amount difference allowed (fee/rounding)
  dateWindowDays: 1, // value dates within 1 day of each other
  resolveThreshold: 0.7, // min judge confidence to count a residual match as resolved
  exactThreshold: 1.0, // hard key equality
  normalizedThreshold: 0.95, // key equality after normalization
  maxExceptionAge: 5, // exceptions auto-flagged for a human after 5 days
};

/**
 * Merge user overrides onto the defaults. Overrides are applied shallowly so
 * partial configs (per-tenant `financeCfg`) just work.
 */
export function resolveConfig(overrides?: Partial<FinanceConfig>): FinanceConfig {
  return { ...DEFAULTS, ...(overrides ?? {}) };
}
