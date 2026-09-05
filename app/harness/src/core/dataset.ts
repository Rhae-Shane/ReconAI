/**
 * dataset.ts — deterministic synthetic-data helpers for the batch generator.
 * Uses a seeded PRNG so the 52-record batch is fully reproducible.
 */

/** Small, fast, seeded PRNG (mulberry32). Deterministic for a fixed seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function intInclusive(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

const PAISE_TO_RUPEES = 100;

/** Format integer paise as a rupee amount (number) for raw export rows. */
export function rupeeAmount(paise: number): number {
  return Number((paise / PAISE_TO_RUPEES).toFixed(2));
}

export const SEED = 42;
export const VALUE_DATE = '2026-08-14';

export const CUSTOMERS = [
  'Acme Retail Pvt Ltd',
  'Brightway Traders',
  'Zenith Foods',
  'Northwind Exports',
  'Cloudline Tech Pvt Ltd',
  'Fresco Bakers',
  'Kites Retail',
  'Summit Logistics',
  'Orbit Media Works',
  'GreenLeaf Organics',
];

/**
 * P0 settlement identity the batch generator seeds its netting scenarios from
 * (mirrors reconcile.ts `nettedGroup`):
 *
 *   netExpected = gross − fee − taxOnFee − refund + adjustment
 *   variance    = actualSettlement − netExpected   (≈ 0 within paiseTolerance)
 *
 * Every generator netting scenario is emitted so this identity balances to a
 * zero-variance settlement.
 */
export function netExpected(
  grossPaise: number,
  feePaise = 0,
  taxOnFeePaise = 0,
  refundPaise = 0,
  adjustmentPaise = 0,
): number {
  return grossPaise - feePaise - taxOnFeePaise - refundPaise + adjustmentPaise;
}

/**
 * FEE+GST netting seed: gross ₹10,000, gateway TDR ₹150, GST-on-fee ₹27 →
 * net settlement ₹9,823 (= gross − fee − tax). `settlementPaise` is exactly
 * `netExpected(gross, fee, tax)` so the seeded batch nets with variance 0.
 * The generator emits the FEE amount as −₹150 (the TDR) and carries the ₹27
 * GST as `feeTaxPaise` on the row; ingest preserves it so the engine's
 * `nettedGroup` surfaces `taxOnFeePaise = ₹27` in the NettingBreakdown.
 */
export const GST_NET = {
  grossPaise: 1_000_000, // ₹10,000 gross invoice / payment
  feePaise: 15_000, // ₹150 gateway TDR (outflow)
  taxOnFeePaise: 2_700, // ₹27 GST charged ON the gateway fee
  settlementPaise: 982_300, // ₹9,823 net settlement credited to the bank
} as const;
