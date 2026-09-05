/**
 * adversarial.ts - property-based, mutation, and chaos test building-blocks.
 * Property  : netting conservation. For every valid settlement
 *             gross - fee - taxOnFee - refund + adjustment === net (within
 *             tolerance). generateValidSettlement / generateCorruptSettlement
 *             stream thousands of seeded pseudo-random cases so tests can assert
 *             the invariant holds on every valid case and breaks on every
 *             corrupted one (a seeded PRNG keeps these reproducible).
 * Mutation   : mutate amount/date/reference, duplicate, strip a fee, insert a
 *             refund. Detection is exercised against the deterministic engine.
 * Chaos      : providers that throw, an idempotency EffectSink, and a helper
 *             running effects exactly-once even when the provider fails.
 * Everything here is pure/deterministic - no network.
 */
import type { FinRecord } from './types.js';
import type { LLMProvider } from './model.js';

// ---- Seeded PRNG (mulberry32) ----
/** Deterministic 32-bit PRNG. `seed` may be any 32-bit signed integer. */
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

/** Uniform integer in [min, maxExclusive). */
export function randInt(rand: () => number, min: number, maxExclusive: number): number {
  return min + Math.floor(rand() * (maxExclusive - min));
}

// ---------------------------------------------------------------------------
// Property: the netting conservation law
// ---------------------------------------------------------------------------

/** The five legs of the settlement identity plus the observed net. */
export interface SettlementMath {
  grossPaise: number; // >= 0
  feePaise: number; // >= 0
  taxOnFeePaise: number; // >= 0
  refundPaise: number; // >= 0
  adjustmentPaise: number; // signed
  netPaise: number; // observed settlement
  tolerance: number; // paise, default 50
}

export const DEFAULT_TOLERANCE = 50;

/** gross - fee - taxOnFee - refund + adjustment (the identity's RHS). */
export function netIdentityOf(m: SettlementMath): number {
  return m.grossPaise - m.feePaise - m.taxOnFeePaise - m.refundPaise + m.adjustmentPaise;
}

/** actual - expected; ~0 for a balanced net. */
export function varianceOf(m: SettlementMath): number {
  return m.netPaise - netIdentityOf(m);
}

/** True when the observed net agrees with the identity within tolerance. */
export function isBalanced(m: SettlementMath): boolean {
  return Math.abs(varianceOf(m)) <= m.tolerance;
}

/** Throw unless the netting invariant holds. */
export function assertBalanced(m: SettlementMath): void {
  if (!isBalanced(m)) {
    throw new Error(
      `netting invariant violated: variance ${varianceOf(m)} exceeds tolerance ${m.tolerance} ` +
        `(gross ${m.grossPaise} fee ${m.feePaise} tax ${m.taxOnFeePaise} refund ${m.refundPaise} ` +
        `adj ${m.adjustmentPaise} expected ${netIdentityOf(m)} net ${m.netPaise})`,
    );
  }
}

/** Build a valid (balanced) settlement using a seeded PRNG. */
export function generateValidSettlement(rand: () => number): SettlementMath {
  const grossPaise = randInt(rand, 500, 2_000_001); // 5 paise .. 20k rupees
  const feePaise = randInt(rand, 0, Math.floor(grossPaise / 10));
  const taxOnFeePaise = randInt(rand, 0, Math.floor(feePaise / 5) + 1);
  const refundPaise = randInt(rand, 0, Math.floor(grossPaise / 3));
  // signed adjustment, small relative to gross
  const adjustmentPaise = randInt(rand, -Math.floor(grossPaise / 10), Math.floor(grossPaise / 10) + 1);
  const netPaise = grossPaise - feePaise - taxOnFeePaise - refundPaise + adjustmentPaise;
  return { grossPaise, feePaise, taxOnFeePaise, refundPaise, adjustmentPaise, netPaise, tolerance: DEFAULT_TOLERANCE };
}

/** Pick a random leg to corrupt. */
export type CorruptLeg = 'gross' | 'fee' | 'tax' | 'refund' | 'adjustment' | 'net';

export const CORRUPT_LEGS: readonly CorruptLeg[] = [
  'gross',
  'fee',
  'tax',
  'refund',
  'adjustment',
  'net',
];

/** Corrupt one leg so the identity breaks beyond tolerance. */
export function corruptLeg(m: SettlementMath, leg: CorruptLeg, deltaPaise: number): SettlementMath {
  const c = { ...m };
  switch (leg) {
    case 'gross':
      c.grossPaise = Math.max(0, c.grossPaise + deltaPaise);
      break;
    case 'fee':
      c.feePaise = Math.max(0, c.feePaise + deltaPaise);
      break;
    case 'tax':
      c.taxOnFeePaise = Math.max(0, c.taxOnFeePaise + deltaPaise);
      break;
    case 'refund':
      c.refundPaise = Math.max(0, c.refundPaise + deltaPaise);
      break;
    case 'adjustment':
      c.adjustmentPaise += deltaPaise;
      break;
    case 'net':
      c.netPaise += deltaPaise;
      break;
  }
  return c;
}

/** Build a provably-corrupt settlement (identity broken beyond tolerance). */
export function generateCorruptSettlement(rand: () => number): SettlementMath {
  const valid = generateValidSettlement(rand);
  const leg = CORRUPT_LEGS[randInt(rand, 0, CORRUPT_LEGS.length)];
  const delta = (m: SettlementMath) => m.tolerance + randInt(rand, 1, 10_000) + 1;
  return corruptLeg(valid, leg, delta(valid));
}

// ---------------------------------------------------------------------------
// Mutation testing: mutate a valid record so the engine must detect the change
// ---------------------------------------------------------------------------

/** A FieldNode that must be detected by the reconciliation engine. */
export function mutateAmount(rec: FinRecord, deltaPaise: number): FinRecord {
  return { ...rec, amountPaise: rec.amountPaise + deltaPaise };
}

/** Shift the value date outside the grouping it used to belong to. */
export function mutateDate(rec: FinRecord, ts: string): FinRecord {
  return { ...rec, ts };
}

/** Break the cross-source reference so the record no longer shares a key. */
export function mutateReference(rec: FinRecord, sourceRef: string): FinRecord {
  return { ...rec, sourceRef, utr: undefined, gatewayRef: undefined, orderRef: undefined };
}

/** Duplicate a record (idempotency collision: same source + sourceRef). */
export function duplicateRecord(rec: FinRecord): FinRecord {
  return { ...rec, id: `${rec.id}-dup`, description: `dup-of-${rec.id}` };
}

/** Remove a FEE record from a set of records (the net must then break). */
export function removeFees(records: FinRecord[]): FinRecord[] {
  return records.filter((r) => r.kind !== 'FEE');
}

/** Insert a REFUND record into a set of records (shifts the net). */
export function insertRefund(records: FinRecord[], refund: FinRecord): FinRecord[] {
  return [...records, refund];
}

// ---------------------------------------------------------------------------
// Chaos: providers that throw + idempotency guard for financial effects
// ---------------------------------------------------------------------------

/** An LLM that always throws (simulates a down provider / no model reachable). */
export class ThrowingProvider implements LLMProvider {
  constructor(private message = 'chaos: provider unavailable') {}

  // `messages` is intentionally unused; the provider fails regardless.
  async complete(_messages: unknown[]): Promise<string> {
    throw new Error(this.message);
  }
}

/** An LLM that throws with probability `failRate` from a seeded PRNG. */
export class FlakyProvider implements LLMProvider {
  constructor(
    private rand: () => number,
    private failRate: number,
    private respond: (messages: unknown[]) => string = () => 'ok',
  ) {}

  async complete(messages: unknown[]): Promise<string> {
    if (this.rand() < this.failRate) throw new Error('chaos: flaky provider failure');
    return this.respond(messages);
  }
}

/**
 * Idempotency guard for financial effects. `apply` returns false for a duplicate
 * id, so a settlement amount can never be booked twice no matter how many times
 * an operation retries.
 */
export class EffectSink {
  private applied = new Set<string>();
  private totalPaise = 0;

  /** Apply exactly-once. Returns true on first application, false on duplicates. */
  apply(id: string, amountPaise: number): boolean {
    if (this.applied.has(id)) return false;
    this.applied.add(id);
    this.totalPaise += amountPaise;
    return true;
  }

  count(): number {
    return this.applied.size;
  }

  sumPaise(): number {
    return this.totalPaise;
  }

  has(id: string): boolean {
    return this.applied.has(id);
  }
}

export interface Effect {
  id: string;
  amountPaise: number;
}

/**
 * Run a list of financial effects exactly-once even when the executor throws.
 * An effect that fails (by `shouldThrow` or executor error) is left un-applied
 * and recorded in `failed` for a human retry — it is NEVER applied twice.
 */
export async function applyEffectsIdempotently(
  effects: Effect[],
  execute: (e: Effect) => Promise<void>,
  shouldThrow: (e: Effect) => boolean = () => false,
): Promise<{ applied: string[]; failed: string[]; totalPaise: number }> {
  const applied: string[] = [];
  const failed: string[] = [];
  let total = 0;
  for (const e of effects) {
    if (shouldThrow(e)) {
      failed.push(e.id); // leave for human retry, never double-book
      continue;
    }
    try {
      await execute(e);
      applied.push(e.id);
      total += e.amountPaise;
    } catch {
      failed.push(e.id);
    }
  }
  return { applied, failed, totalPaise: total };
}
