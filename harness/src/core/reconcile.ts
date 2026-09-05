/**
 * reconcile.ts — ReconciliationEngine: deterministic multi-source matching.
 *
 * Passes, in order:
 *   1. exactKeys()  — records sharing a canonical identifier (utr / gatewayRef
 *      / orderRef) union into a group; confidence 1.0 (0.98 if amounts differ
 *      within tolerance).
 *   2. normalizedKeys() — residual records matching after case/space/zero-pad
 *      normalization; confidence 0.95.
 *   3. NETTED — a component whose amounts disagree BEYOND tolerance but is fully
 *      explained by a linked gateway fee: gross (invoice / payment) ===
 *      settlement + fee(s), within `paiseTolerance`. Such a component is
 *      surfaced as a NETTED match group (confidence 0.98) instead of a blind
 *      AMOUNT_MISMATCH conflict. A fee is NEVER guessed — netting only fires when
 *      a FEE-kind record is actually present in the component AND the arithmetic
 *      balances. The fee line stays visible inside the group.
 *
 * A component whose members disagree on amount beyond `paiseTolerance` and is
 * NOT explained by a fee is surfaced as a conflicted set (AMOUNT_MISMATCH),
 * never guessed. Whatever remains is a `flap` (unmatched residual) for the judge.
 */
import type {
  Candidate,
  FinanceConfig,
  FinRecord,
  MatchGroup,
  MatchLink,
  MatchMethod,
  MatchType,
  NettingBreakdown,
} from './types.js';
import { resolveConfig } from './config.js';
import { compileRules, type CompiledRule, simulate } from './compiler.js';

/** Union-find over record ids and canonical key strings. */
class DSU {
  private parent = new Map<string, string>();

  find(x: string): string {
    let root = x;
    while (this.parent.get(root) !== root) {
      const p = this.parent.get(root);
      if (p === undefined) {
        this.parent.set(root, root);
        break;
      }
      root = p;
    }
    this.parent.set(root, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** Canonical (exact) cross-source identifiers for a record. */
export function canonicalKeys(rec: FinRecord): string[] {
  const keys: string[] = [];
  if (rec.utr) keys.push(`utr:${rec.utr}`);
  if (rec.gatewayRef) keys.push(`gateway:${rec.gatewayRef}`);
  if (rec.orderRef) keys.push(`order:${rec.orderRef}`);
  if (rec.source === 'gst-invoices') keys.push(`inv:${rec.sourceRef}`);
  return keys;
}

/** Strip case/space/punctuation + leading-zero padding so refs compare equal. */
export function normalizeRef(s: string): string {
  const clean = s
    .toUpperCase()
    .replace(/[^A-Z0-9:]/g, '');
  // Collapse leading zeros inside digit runs: UTR00123 -> UTR123
  return clean.replace(/^(.*?)(\d+)$/, (_m, pre, digits: string) => {
    const n = parseInt(digits, 10);
    return `${pre}${Number.isFinite(n) ? String(n) : digits}`;
  });
}

export function normalizedKeys(rec: FinRecord): string[] {
  return canonicalKeys(rec).map(normalizeRef);
}

function dateEpoch(iso: string): number {
  return Math.round(new Date(iso.slice(0, 10) + 'T00:00:00Z').getTime() / 86400000);
}

export function dateDelta(a: string, b: string): number {
  return Math.abs(dateEpoch(a) - dateEpoch(b));
}

function fuzzyEquals(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  return (x.includes(y) || y.includes(x)) && Math.min(x.length, y.length) >= 4;
}

export interface LinkResult {
  groups: MatchGroup[];
  /** Conflicted components (same key, amounts beyond tolerance) -> AMOUNT_MISMATCH. */
  conflicted: FinRecord[];
  /** Unmatched residuals for the judge. */
  remaining: FinRecord[];
}

/**
 * Build candidate pairings for one flap against every other record, for the
 * judge to arbitrate residual ambiguity.
 */
export function buildCandidates(
  flap: FinRecord,
  all: FinRecord[],
  cfg: FinanceConfig,
): Candidate[] {
  const out: Candidate[] = [];
  for (const other of all) {
    if (other.id === flap.id) continue;
    const amountDiff = Math.abs(flap.amountPaise - other.amountPaise);
    if (amountDiff > cfg.paiseTolerance) continue; // only near-amount candidates
    const flapKeys = new Set(normalizedKeys(flap));
    const otherKeys = normalizedKeys(other);
    const normRefOk = otherKeys.some((k) => flapKeys.has(k));
    out.push({
      flapId: flap.id,
      matchRecordId: other.id,
      amountDiff,
      dateOk: dateDelta(flap.ts, other.ts) <= cfg.dateWindowDays,
      counterpartyOk: fuzzyEquals(flap.counterparty, other.counterparty),
      normRefOk,
      flapText: flap.counterparty ?? flap.description,
      matchText: other.counterparty ?? other.description,
    });
  }
  // Most-specific first so the judge prefers identifier-backed candidates.
  out.sort((a, b) => Number(b.normRefOk) - Number(a.normRefOk));
  return out;
}

export class ReconciliationEngine {
  private cfg: FinanceConfig;
  /** Optional compiled rules — the programmable half of the DSL/compiler workstream. */
  private rules: CompiledRule[];

  constructor(cfg?: Partial<FinanceConfig>, rules?: CompiledRule[]) {
    this.cfg = resolveConfig(cfg);
    this.rules = rules ?? [];
  }

  /**
   * Optional entry point: run the compiled rules first to pre-consume the records
   * they deterministically own, then let the classic passes handle the residual.
   */
  ruled(records: FinRecord[]): LinkResult {
    if (this.rules.length === 0) return this.link(records);
    const consumed = new Set<string>();
    const groups: MatchGroup[] = [];
    for (const rule of this.rules) {
      const matched = records.filter((r) => consumed.has(r.id) === false && rule.predicate({ runId: '', records, groups }) && rule.match.some((f) => (r as unknown as Record<string, unknown>)[f] !== undefined && (r as unknown as Record<string, unknown>)[f] !== null && (r as unknown as Record<string, unknown>)[f] !== ''));
      for (const r of matched) {
        consumed.add(r.id);
        groups.push({
          id: `grp-rule-${rule.id}-${r.id}`,
          key: rule.net.gross[0] ?? `${rule.id}:${r.id}`,
          method: 'NETTED',
          matchType: 'FEE_NETTED',
          confidence: rule.score({ runId: '', records, groups }) || 0.98,
          reason: `compiled rule "${rule.id}" matched ${r.id}`,
          amountPaise: r.amountPaise,
          recordIds: [r.id],
          links: [{ recordId: r.id, matchedOn: `rule:${rule.id}`, matchType: 'FEE_NETTED' }],
        });
      }
    }
    const remaining = records.filter((r) => !consumed.has(r.id));
    const rest = this.link(remaining);
    return { groups: [...groups, ...rest.groups], conflicted: rest.conflicted, remaining: rest.remaining };
  }

  /** Pass 1: union records that share any canonical (exact) key. */
  exactKeys(records: FinRecord[]): Map<string, FinRecord[]> {
    return this.pass(records, canonicalKeys, false);
  }

  /** Pass 2: union residuals that share a normalized key. */
  normalizedKeysPass(records: FinRecord[]): Map<string, FinRecord[]> {
    return this.pass(records, normalizedKeys, true);
  }

  private pass(
    records: FinRecord[],
    keyFn: (r: FinRecord) => string[],
    _normalized: boolean,
  ): Map<string, FinRecord[]> {
    const dsu = new DSU();
    const recNodes: string[] = [];
    for (const r of records) {
      dsu.find(r.id);
      recNodes.push(r.id);
      for (const k of keyFn(r)) {
        dsu.find(k);
        dsu.union(r.id, k);
      }
    }
    const byRoot = new Map<string, FinRecord[]>();
    const seen = new Set<string>();
    for (const r of records) {
      const root = dsu.find(r.id);
      if (byRoot.has(root)) byRoot.get(root)!.push(r);
      else byRoot.set(root, [r]);
    }
    void seen;
    void recNodes;
    return byRoot;
  }

  private groupFromComponent(
    members: FinRecord[],
    method: MatchMethod,
    confidence: number,
  ): MatchGroup | null {
    const id = `grp-${members
      .map((m) => m.id)
      .sort()
      .join('-')}`;
    const span = amountSpan(members);
    if (span > this.cfg.paiseTolerance) return null; // conflicted
    const conf =
      method === 'EXACT' && span === 0 ? this.cfg.exactThreshold : confidence;
    const representative = primaryRecord(members);
    const key = representative.utr
      ? `utr:${representative.utr}`
      : `mov:${members
          .map((m) => m.source)
          .sort()
          .join('-')}:${representative.id}`;
    const matchType: MatchType = method === 'EXACT' ? 'EXACT' : 'NORMALIZED';
    const links: MatchLink[] = members.map((m) => ({
      recordId: m.id,
      matchedOn: matchReason(m, members),
      matchType,
    }));
    return {
      id,
      key,
      method,
      matchType,
      confidence: conf,
      reason: `${method.toLowerCase()}:key (${members.length} records)`,
      amountPaise: representative.amountPaise,
      recordIds: members.map((m) => m.id),
      links,
    };
  }

  /**
   * Financial netting. Given a component whose members' amounts disagree BEYOND
   * `paiseTolerance` (so `groupFromComponent` refused to merge it), try to
   * rescue it as a real settlement-math net — the review's P0 identity:
   *
   *   netExpected = gross − gatewayFee − taxOnFee − refund + adjustment
   *   variance    = actualSettlement − netExpected   (≈ 0 → balanced net)
   *
   * When the arithmetic balances within tolerance, the component is a NETTED
   * match with an explicit `NettingBreakdown` and a specific match type
   * (ADJUSTMENT_NETTED / REFUND_NETTED / FEE_NETTED). Returns null when the
   * component is NOT net-explained — it must remain an AMOUNT_MISMATCH.
   *
   * Never guesses: a component only nets when it actually CONTAINS the driving
   * FEE / REFUND / ADJUSTMENT records AND the identity balances. Every netting
   * field is populated only from records actually present in the group.
   */
  nettedGroup(members: FinRecord[]): MatchGroup | null {
    const fees = members.filter((m) => m.kind === 'FEE');
    const refunds = members.filter((m) => m.kind === 'REFUND');
    const adjustments = members.filter((m) => m.kind === 'ADJUSTMENT');
    const hasDriver = fees.length > 0 || refunds.length > 0 || adjustments.length > 0;
    if (!hasDriver) return null; // nothing to net against -> conflict, never a guess
    const settlements = members.filter(
      (m) => m.kind === 'SETTLEMENT' || m.source === 'bank-utr',
    );
    if (!settlements.length) return null;
    const bases = members.filter(
      (m) =>
        m.kind !== 'FEE' &&
        m.kind !== 'REFUND' &&
        m.kind !== 'ADJUSTMENT' &&
        m.kind !== 'SETTLEMENT' &&
        m.source !== 'bank-utr',
    );
    if (!bases.length) return null;

    const base = bases.reduce((a, b) =>
      Math.abs(b.amountPaise) > Math.abs(a.amountPaise) ? b : a,
    );
    const grossPaise = Math.abs(base.amountPaise);
    const feePaise = fees.reduce((a, f) => a + Math.abs(f.amountPaise), 0);
    const taxOnFeePaise = fees.reduce((a, f) => a + Math.abs(f.feeTaxPaise ?? 0), 0);
    const refundPaise = refunds.reduce((a, r) => a + Math.abs(r.amountPaise), 0);
    const adjustmentPaise = adjustments.reduce(
      (a, ad) => a + ad.amountPaise,
      0,
    ); // signed
    const netExpectedPaise =
      grossPaise - feePaise - taxOnFeePaise - refundPaise + adjustmentPaise;
    const actualSettlementPaise = settlements.reduce(
      (a, s) => a + Math.abs(s.amountPaise),
      0,
    );
    const variancePaise = actualSettlementPaise - netExpectedPaise;
    if (Math.abs(variancePaise) > this.cfg.paiseTolerance) return null;

    const matchType: MatchType = adjustments.length
      ? 'ADJUSTMENT_NETTED'
      : refunds.length
        ? 'REFUND_NETTED'
        : 'FEE_NETTED';

    const id = `grp-${members
      .map((m) => m.id)
      .sort()
      .join('-')}`;
    const key = base.utr ? `utr:${base.utr}` : `netted:${id}`;
    const netting: NettingBreakdown = {
      grossPaise,
      feePaise,
      taxOnFeePaise,
      refundPaise,
      adjustmentPaise,
      netExpectedPaise,
      actualSettlementPaise,
      variancePaise,
    };
    return {
      id,
      key,
      method: 'NETTED',
      matchType,
      confidence: 0.98,
      reason: `netted: gross ${grossPaise} − fee ${feePaise} − tax ${taxOnFeePaise} − refund ${refundPaise} + adjustment ${adjustmentPaise} = expected ${netExpectedPaise} ≡ settled ${actualSettlementPaise} (variance ${variancePaise}, ${members.length} records)`,
      amountPaise: base.amountPaise,
      recordIds: members.map((m) => m.id),
      links: members.map((m) => ({
        recordId: m.id,
        matchedOn: linkReason(m),
        matchType: linkMatchType(m, matchType),
      })),
      netting,
    };
  }

  /** Try normal merge; if it conflicts, try fee netting; else mark conflicted. */
  private absorbComponent(
    members: FinRecord[],
    method: MatchMethod,
    conf: number,
    groups: MatchGroup[],
    conflicted: FinRecord[],
    consumed: Set<string>,
  ): void {
    const g = this.groupFromComponent(members, method, conf);
    if (g) {
      groups.push(g);
      for (const m of members) consumed.add(m.id);
      return;
    }
    // Amounts disagree beyond tolerance. Possibly explained by a linked fee.
    const netted = this.nettedGroup(members);
    if (netted) {
      groups.push(netted);
      for (const m of members) consumed.add(m.id);
    } else {
      for (const m of members) conflicted.push(m);
      for (const m of members) consumed.add(m.id);
    }
  }

  /**
   * Run exact + normalized passes and produce groups, conflicted sets, and
   * remaining flaps.
   */
  link(records: FinRecord[]): LinkResult {
    const exact = this.exactKeys(records);
    const groups: MatchGroup[] = [];
    const conflicted: FinRecord[] = [];
    const consumed = new Set<string>();

    for (const members of exact.values()) {
      if (members.length < 2) continue;
      this.absorbComponent(members, 'EXACT', 0.98, groups, conflicted, consumed);
    }

    const residuals = records.filter((r) => !consumed.has(r.id));
    const normalized = this.normalizedKeysPass(residuals);
    for (const members of normalized.values()) {
      if (members.length < 2) continue;
      this.absorbComponent(members, 'NORMALIZED', 0.95, groups, conflicted, consumed);
    }

    const remaining = records.filter((r) => !consumed.has(r.id));
    return { groups, conflicted, remaining };
  }
}

export function amountSpan(members: FinRecord[]): number {
  const signed = members.map((m) => m.amountPaise);
  return Math.max(...signed) - Math.min(...signed);
}

/** The record whose signed amount best represents the group. */
export function primaryRecord(members: FinRecord[]): FinRecord {
  return members.reduce((best, m) =>
    Math.abs(m.amountPaise) > Math.abs(best.amountPaise) ? m : best,
  );
}

/** How a netted-group member participates in the money flow. */
function linkReason(m: FinRecord): string {
  switch (m.kind) {
    case 'FEE':
      return 'fee';
    case 'REFUND':
      return 'refund';
    case 'ADJUSTMENT':
      return 'adjustment';
    case 'SETTLEMENT':
      return 'utr';
    default:
      return m.source === 'bank-utr' ? 'utr' : 'gross';
  }
}

/** Per-link matchType inside a netted group: a driver keeps its own type. */
function linkMatchType(m: FinRecord, defaultType: MatchType): MatchType {
  switch (m.kind) {
    case 'FEE':
      return 'FEE_NETTED';
    case 'REFUND':
      return 'REFUND_NETTED';
    case 'ADJUSTMENT':
      return 'ADJUSTMENT_NETTED';
    default:
      return defaultType;
  }
}

function matchReason(member: FinRecord, group: FinRecord[]): string {
  const others = group.filter((m) => m.id !== member.id);
  for (const o of others) {
    if (member.utr && o.utr && normalizeRef(member.utr) === normalizeRef(o.utr))
      return 'utr';
    if (member.utr && o.utr && member.utr === o.utr) return 'utr';
  }
  for (const o of others) {
    if (
      (member.gatewayRef || member.orderRef) &&
      canonicalKeys(member).some((k) => canonicalKeys(o).includes(k))
    )
      return 'ref';
  }
  return 'amountWindow';
}
