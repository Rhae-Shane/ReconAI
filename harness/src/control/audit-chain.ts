/**
 * audit-chain.ts — cryptographic append-only audit chain.
 *
 * Each link stores its payload's hash and the previous link's hash, then chains
 * them: hash_n = H(previousHash_n || payloadHash_n). Because every hash depends
 * on the entire history, any inserted, removed or mutated link breaks the chain
 * and verifyChain() trips. Inspectable, tamper-evident provenance for every
 * control decision.
 */
import { createHash, randomUUID } from 'node:crypto';

/** A human-readable event payload carried by a chain link. */
export interface AuditChainEvent {
  id?: string;
  action: string;
  runId?: string;
  actorType?: string;
  actorId?: string;
  recordId?: string;
  detail?: Record<string, unknown>;
  createdAt?: string;
}

/** One immutable verified link in the chain. */
export interface ChainLink {
  index: number;
  previousHash: string;
  payloadHash: string;
  /** SHA-256 hex of previousHash || payloadHash. */
  hash: string;
  createdAt: string;
  payload: AuditChainEvent;
}

export type ChainVerification = {
  valid: boolean;
  /** Index of the first broken link, when invalid (0-based), else -1. */
  brokenAt: number;
  reason?: string;
};

/** The fixed genesis anchor. A chain with zero links is trivially valid. */
export const GENESIS_HASH = '0'.repeat(64);

/** Hash a UTF-8 string (used for the canonical payload, JSON). */
function sha256Text(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Hash hex-encoded input (used for the previousHash||payloadHash concat). */
function sha256Hex(hex: string): string {
  return createHash('sha256').update(hex, 'hex').digest('hex');
}

/** Deterministic canonical serialization (sorted keys) so hashing is stable. */
function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export class AuditChain {
  private links: ChainLink[] = [];

  /** Append an event and return the new link. Always succeeds (append-only). */
  append(event: AuditChainEvent): ChainLink {
    const createdAt = event.createdAt ?? new Date().toISOString();
    const payload: AuditChainEvent = { ...event, createdAt };
    const payloadHash = sha256Text(canonical(payload));
    const previousHash = this.links.length > 0 ? this.links[this.links.length - 1].hash : GENESIS_HASH;
    const link: ChainLink = {
      index: this.links.length,
      previousHash,
      payloadHash,
      hash: sha256Hex(previousHash + payloadHash),
      createdAt,
      payload,
    };
    this.links.push(link);
    return link;
  }

  /** Convenience: append with an auto-generated id. */
  appendEvent(action: string, init: Omit<AuditChainEvent, 'action'> = {}): ChainLink {
    const event: AuditChainEvent = { action, ...init };
    if (!event.id) event.id = `evt-${randomUUID()}`;
    return this.append(event);
  }

  get all(): ReadonlyArray<ChainLink> {
    return this.links;
  }

  get length(): number {
    return this.links.length;
  }

  lastHash(): string {
    return this.links.length > 0 ? this.links[this.links.length - 1].hash : GENESIS_HASH;
  }

  /** Events only, for shoving into an existing AuditEngine. */
  events(): AuditChainEvent[] {
    return this.links.map((l) => l.payload);
  }

  /**
   * Verify integrity of this chain. Returns false on any break. The most severe
   * mistake is treating a tampered chain as valid, so this is strict about both
   * the intra-link hash and the adjacency (previousHash) continuity.
   */
  verify(): boolean {
    return verifyChain(this.links).valid;
  }

  verifyDetailed(): ChainVerification {
    return verifyChain(this.links);
  }

  clear(): void {
    this.links = [];
  }
}

/**
 * Verify an arbitrary list of links — the standalone "audit integrity" check.
 * Walks the chain forward from the genesis anchor; returns false (with the
 * first broken index) if a link's own hash does not match its payload, or if
 * it does not reference the hash of the link before it.
 */
export function verifyChain(links: ReadonlyArray<ChainLink>): ChainVerification {
  if (links.length === 0) return { valid: true, brokenAt: -1 };

  let expectedPrevious = GENESIS_HASH;
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.index !== i) {
      return { valid: false, brokenAt: i, reason: `index discontinuity: expected ${i}, got ${link.index}` };
    }
    if (link.previousHash !== expectedPrevious) {
      return {
        valid: false,
        brokenAt: i,
        reason: `previousHash mismatch: link ${i} does not chain to link ${i - 1}`,
      };
    }
    const recomputedPayloadHash = sha256Text(canonical(link.payload));
    if (link.payloadHash !== recomputedPayloadHash) {
      return { valid: false, brokenAt: i, reason: `payloadHash mismatch on link ${i}` };
    }
    const recomputedHash = sha256Hex(link.previousHash + link.payloadHash);
    if (link.hash !== recomputedHash) {
      return { valid: false, brokenAt: i, reason: `hash mismatch on link ${i}` };
    }
    expectedPrevious = link.hash;
  }
  return { valid: true, brokenAt: -1 };
}

/** Verify a single link in isolation (payload ↔ hash self-consistency). */
export function verifyLink(link: ChainLink): boolean {
  const computed = sha256Text(canonical(link.payload));
  return (
    link.payloadHash === computed &&
    link.hash === sha256Hex(link.previousHash + link.payloadHash)
  );
}
