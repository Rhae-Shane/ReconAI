/**
 * Foreign-exchange helpers for the Controller (Workstream W2-D — multi-entity + currency/FX).
 *
 * Lets the close loop scope reconciliation data to legal entities and convert non-base-currency
 * amounts to the base currency (INR paise). Like the rest of the Redis layer this is no-op-safe:
 * when Redis is unconfigured `setFxRate` returns `false`, `listFxRates` returns `[]`, and
 * `getFxRate` returns `null` — the app keeps working locally / in CI without any credential.
 */

import { jsonGet, jsonSet, redisKey } from "@/lib/ops/redis";

export interface FxRate {
  base: string;
  quote: string;
  rate: number;
  date: string;
}

/** Rates are stored as a list under `close:fx`, one entry per (base, quote, date). */
const FX_RATES_KEY = redisKey("close", "fx");

/** Uppercase composite identity for a rate row: base|quote|date. */
function rateKey(r: Pick<FxRate, "base" | "quote" | "date">): string {
  return `${r.base.toUpperCase()}|${r.quote.toUpperCase()}|${r.date}`;
}

/**
 * Persist an FX rate (upsert by base/quote/date). No-op-safe: returns false when Redis is
 * unconfigured or the write fails.
 */
export async function setFxRate(rate: FxRate): Promise<boolean> {
  const list = (await jsonGet<FxRate[]>(FX_RATES_KEY)) ?? [];
  const key = rateKey(rate);
  const idx = list.findIndex((r) => rateKey(r) === key);
  if (idx >= 0) list[idx] = rate;
  else list.push(rate);
  return jsonSet(FX_RATES_KEY, list);
}

/**
 * Fetch a rate for the (base, quote) pair, tolerant of either orientation (base<->quote swapped).
 * When several rows match, returns the one whose `date` is closest to today ("closest by date").
 * Returns null when Redis is unconfigured or no matching pair exists.
 */
export async function getFxRate(base: string, quote: string): Promise<FxRate | null> {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();
  const candidates = (await listFxRates()).filter(
    (r) =>
      (r.base.toUpperCase() === b && r.quote.toUpperCase() === q) ||
      (r.base.toUpperCase() === q && r.quote.toUpperCase() === b),
  );
  if (candidates.length === 0) return null;
  const now = Date.now();
  candidates.sort((a, b2) => Math.abs(new Date(a.date).getTime() - now) - Math.abs(new Date(b2.date).getTime() - now));
  return candidates[0];
}

/** List all stored FX rates. Empty when Redis is unconfigured/unreachable. */
export async function listFxRates(): Promise<FxRate[]> {
  const list = await jsonGet<FxRate[]>(FX_RATES_KEY);
  return list ?? [];
}

/**
 * Convert an amount (in integer paise, sign preserved) from one currency to another.
 *
 * `rate` is the from->to exchange factor (how many `to` units one `from` unit buys), so the
 * forward conversion multiplies. The reverse direction (/ `1/rate`, i.e. how many `from` units
 * one `to` unit buys) is available by passing the reciprocal — callers wanting the inverse pass
 * `1 / rate` as the factor.
 *
 * A non-positive/non-finite rate is guarded and returns 0; a same-currency conversion passes
 * the amount through unchanged.
 */
export function convert(amountPaise: number, from: string, to: string, rate: number): number {
  if (rate <= 0 || !Number.isFinite(rate)) return 0;
  if (from === to) return amountPaise;
  // Forward direction: multiply by the from->to factor.
  return Math.round(amountPaise * rate);
}
