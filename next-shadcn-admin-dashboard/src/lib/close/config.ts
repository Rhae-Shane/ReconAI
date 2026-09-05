import type { FinanceConfig } from "./types";

/**
 * Finance-ops tolerance model (SPEC §5). These are what turn arbitrary "matching" into
 * credible accounting, and are configurable per tenant via `financeCfg`.
 */
export const DEFAULT_FINANCE_CONFIG: FinanceConfig = {
  paiseTolerance: 50, // allow ≤ ₹0.50 amount difference (fee / rounding)
  dateWindowDays: 1, // allow value dates within 1 day
  resolveThreshold: 0.7, // min judge confidence to count a residual match resolved
  exactThreshold: 1.0, // hard key equality
  normalizedThreshold: 0.95, // key equality after normalization
  maxExceptionAgeDays: 5, // auto-flag exceptions unresolved for 5 days
  currency: "INR",
};

export function getFinanceConfig(overrides?: Partial<FinanceConfig>): FinanceConfig {
  return { ...DEFAULT_FINANCE_CONFIG, ...overrides };
}

/** Format an integer paise amount as an INR currency string. */
export function formatPaise(paise: number, currency = "INR"): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  return `${sign}${new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(rupees)}`;
}

export function formatPaiseCompact(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  if (rupees >= 1_00_00_000) return `${sign}₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (rupees >= 1_00_000) return `${sign}₹${(rupees / 1_00_000).toFixed(2)}L`;
  if (rupees >= 1_000) return `${sign}₹${(rupees / 1_000).toFixed(1)}K`;
  return `${sign}₹${rupees.toFixed(0)}`;
}
