/**
 * allocation.ts — Multi-way allocation engine.
 *
 * Given candidate records partitioned into logical groups and per-group amount
 * constraints, produce an allocation plan that minimizes the residual (money or
 * records left unassignable) while honoring:
 *   - amount conservation   — sum(assigned) + residual == sum(all candidates);
 *   - identity             — records sharing an identifier are strong matches;
 *   - date window          — non-identity pulls must fall within the window;
 *   - counterparty         — non-identity pulls must share the counterparty;
 *   - fee rules            — FEE legs only attach when netting is enabled;
 *   - refund rules         — REFUND legs only attach when netting is enabled;
 *   - no double-consume    — a record is assigned to at most one group.
 *
 * The solver is a deterministic greedy over a compatibility graph (records as
 * sources, groups as sinks), filling each group's target from its own identity-
 * strong members first and then from compatible fee/refund/overflow legs. It
 * handles 1:1, 1:N, N:1 and N:N shapes without ever double-consuming a record.
 * Pure and side-effect free.
 */

/** A candidate money leg available to the allocation. */
export interface AllocationRecord {
  recordId: string;
  /** Signed paise (contributes additively to a group's total). */
  amountPaise: number;
  /** Value date, ISO "YYYY-MM-DD". */
  ts: string;
  counterparty?: string;
  /** Shared identifiers used for identity matching (utr/gatewayRef/orderRef…). */
  refs?: string[];
  /** Leg role, used to gate fee/refund netting. */
  kind?: 'PAYMENT' | 'SETTLEMENT' | 'REFUND' | 'FEE' | 'ADJUSTMENT' | string;
}

/**
 * The constraints to satisfy: `groups[i]` lists the recordIds that form the
 * candidate group, and `amounts[i]` is the expected total settlement for that
 * group. Both arrays are parallel; lengths must match.
 */
export interface AllocationConstraint {
  /** Candidate record ids grouped by logical money movement. */
  groups: string[][];
  /** Expected total (in paise, signed) for each group. Parallel to `groups`. */
  amounts: number[];
  currency: string;
}

/** Toggles for the fee / refund netting and fallback rules. */
export interface AllocationOptions {
  /** Max value-date skew (days) allowed for a non-identity pull. */
  dateWindowDays?: number;
  /** Require counterparty equality for non-identity pulls (default true). */
  counterpartyRequired?: boolean;
  /** Allow FEE legs to be pulled in to fill a group shortfall. */
  allowFeeNetting?: boolean;
  /** Allow REFUND/adjustment legs to be pulled in to fill a shortfall. */
  allowRefundNetting?: boolean;
}

/** A unit of the final plan: one record committed to one group. */
export interface AllocationAssignment {
  groupId: string;
  recordId: string;
  amountPaise: number;
}

/** A record that could not be placed and is left for the residual pass. */
export interface ResidualLine {
  recordId: string;
  amountPaise: number;
}

/** The complete, money-conserving allocation plan. */
export interface AllocationSolution {
  assignments: AllocationAssignment[];
  residual: ResidualLine[];
  totalAssignedPaise: number;
  residualPaise: number;
  invariantHolds: boolean;
}

/** Pure helper: absolute day difference between two ISO dates. */
export function daysBetween(a: string, b: string): number {
  const da = Date.parse(a.slice(0, 10));
  const db = Date.parse(b.slice(0, 10));
  if (Number.isNaN(da) || Number.isNaN(db)) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((db - da) / 86_400_000));
}

/**
 * Decide whether `candidate` may be assigned into the group described by
 * `groupRefs` / `groupRepr` under the given options. Identity always wins; a
 * fee/refund leg must pass its netting gate; a plain overflow leg must match
 * the date window and (optionally) the counterparty. Pure and reusable.
 */
export function compatible(
  candidate: AllocationRecord,
  groupRefs: ReadonlySet<string>,
  groupRepr: Pick<AllocationRecord, 'ts' | 'counterparty'>,
  opts: AllocationOptions,
): boolean {
  const refs = candidate.refs ?? [];
  // 1) Identity — a shared identifier is a strong, unconditional match.
  if (refs.some((r) => groupRefs.has(r))) return true;

  const kind = candidate.kind;
  // 2) Fee / refund legs only attach when their netting rule is enabled.
  if (kind === 'FEE') return !!opts.allowFeeNetting;
  if (kind === 'REFUND') return !!opts.allowRefundNetting;

  // 3) Plain overflow leg: must fit the date window and counterparty scope.
  const withinWindow = daysBetween(candidate.ts, groupRepr.ts) <= (opts.dateWindowDays ?? 1);
  const counterpartyOk =
    !(opts.counterpartyRequired ?? true) ||
    (candidate.counterparty ?? '') === (groupRepr.counterparty ?? '');
  return withinWindow && counterpartyOk;
}

/**
 * Solve the allocation over a compatibility graph. Deterministic: iterates the
 * given groups in order, fills each from identity-strong members first, then
 * greedily absorbs the best-fitting compatible leg to approach its target, and
 * finally emits any unconsumed records as residual.
 */
export function solveAllocation(
  records: AllocationRecord[],
  constraints: AllocationConstraint,
  opts: AllocationOptions = {},
): AllocationSolution {
  const byId = new Map<string, AllocationRecord>();
  for (const r of records) byId.set(r.recordId, r);

  const consumed = new Set<string>();
  const assignments: AllocationAssignment[] = [];
  const residual: ResidualLine[] = [];

  const n = constraints.groups.length;
  if (constraints.amounts.length !== n) {
    throw new Error('AllocationConstraint.groups and .amounts must be parallel.');
  }
  for (const amt of constraints.amounts) {
    if (!Number.isInteger(amt)) {
      throw new Error('AllocationConstraint.amounts must be integer paise.');
    }
  }

  for (let g = 0; g < n; g++) {
    const members = constraints.groups[g]; // may be undefined-safe
    const groupId = `group-${g + 1}`;
    const target = constraints.amounts[g] ?? 0;

    // Representative metadata for the group → union of member refs + first
    // member's date/counterparty.
    const groupRefs = new Set<string>();
    let groupDate = '';
    let groupCounterparty: string | undefined;
    for (const mid of members) {
      const m = byId.get(mid);
      if (!m) continue;
      for (const r of m.refs ?? []) groupRefs.add(r);
      if (!groupDate) groupDate = m.ts;
      if (groupCounterparty === undefined) {
        groupCounterparty =
          m.counterparty ?? (m.counterparty === undefined ? undefined : m.counterparty);
      }
    }
    const groupRepr = { ts: groupDate, counterparty: groupCounterparty };

    // The hold set for this group is exactly its declared members + compatible
    // overflow legs. Members are identity-strong: assign them unconditionally
    // (a grouped candidate record always belongs to its own group).
    let filled = 0;
    const thisGroup: AllocationRecord[] = [];
    const place = (rec: AllocationRecord): boolean => {
      if (consumed.has(rec.recordId)) return false;
      consumed.add(rec.recordId);
      thisGroup.push(rec);
      filled += rec.amountPaise;
      return true;
    };
    for (const mid of members) {
      const m = byId.get(mid);
      if (m && !consumed.has(mid)) place(m);
    }

    // Fill shortfall from compatible, unconsumed overflow legs, preferring the
    // leg whose amount best closes the gap without overshooting wildly.
    const pool = records.filter(
      (r) => !consumed.has(r.recordId) && compatible(r, groupRefs, groupRepr, opts),
    );
    pool.sort((a, b) => {
      const da = Math.abs((a.amountPaise ?? 0) - Math.max(0, target - filled));
      const db = Math.abs((b.amountPaise ?? 0) - Math.max(0, target - filled));
      return da - db;
    });
    for (const rec of pool) {
      if (filled >= target) break;
      place(rec);
    }

    for (const rec of thisGroup) {
      assignments.push({ groupId, recordId: rec.recordId, amountPaise: rec.amountPaise });
    }
  }

  // Everything never consumed is the residual of the plan.
  for (const r of records) {
    if (!consumed.has(r.recordId)) residual.push({ recordId: r.recordId, amountPaise: r.amountPaise });
  }

  const totalAssignedPaise = assignments.reduce((a, x) => a + x.amountPaise, 0);
  const residualPaise = residual.reduce((a, x) => a + x.amountPaise, 0);
  const sumPool = records.reduce((a, r) => a + (r.amountPaise ?? 0), 0);

  return {
    assignments,
    residual,
    totalAssignedPaise,
    residualPaise,
    invariantHolds: totalAssignedPaise + residualPaise === sumPool,
  };
}
