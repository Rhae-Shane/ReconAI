/**
 * policy.ts — PolicyEngine: the gate that decides what a reconciliation action
 * MAY do. The AI/agent proposes, explains and classifies the residual; it never
 * decides what it is allowed to do — the policy does. This is the enforcement
 * half of "deterministic-first": exact → normalized → fee-netted → residual,
 * with AI arbitrating only the residual, and only when a key is configured.
 *
 * A rule's action is the maximum authority the actor is granted. Rules are
 * evaluated in registration order (earlier = higher priority) so the first
 * matching rule wins for any single decision.
 */
import type { MatchType } from '../core/types.js';

/** The set of permitted policy actions — the ceilings of authority. */
export type PolicyAction =
  | 'AUTO_RESOLVE'
  | 'HUMAN_REVIEW'
  | 'BLOCK_CLOSE'
  | 'REQUIRE_TWO_APPROVERS'
  | 'FORBID_DIRECT_ACTION';

/** Who is acting. A policy can tighten or forbid based on this. */
export type ActorRole = 'SYSTEM' | 'AGENT' | 'USER' | 'APPROVER' | 'ADMIN';

/** The families of decision an actor might be proposing. */
export type DecisionKind =
  | 'RESOLVE_MATCH'
  | 'NETTED'
  | 'PARTIAL'
  | 'FUZZY'
  | 'AI_RESOLVED'
  | 'WRITEOFF'
  | 'ADJUSTMENT'
  | 'CLOSE';

/** The decision under consideration. Money is integer paise, signed. */
export interface CandidateDecision {
  id: string;
  kind: DecisionKind;
  matchType: MatchType;
  amountPaise: number; // signed: + inflow, - outflow
  currency?: string;
  groupKey?: string;
}

/** Everything the policy needs to know about a pending decision. */
export interface DecisionContext {
  candidate: CandidateDecision;
  /** Residual variance in paise (signed; positive = shortfall). */
  variance: number;
  /** Proposer confidence in the decision, 0..1. */
  confidence: number;
  /** True when a deterministic rule (exact/normalized/netted) already matched. */
  deterministicRuleMatched: boolean;
  /** True when this decision leaves an exception-ledger entry open. */
  unresolvedOpen: boolean;
  /** Proposed net adjustment in paise (signed) for adjustment/writeoff kinds. */
  adjustmentAmount: number;
  /** Who is acting. */
  actorRole: ActorRole;
}

export interface PolicyRule {
  id: string;
  name: string;
  action: PolicyAction;
  condition: (ctx: DecisionContext) => boolean;
}

const ACTION_PRIORITY: Record<PolicyAction, number> = {
  FORBID_DIRECT_ACTION: 0,
  BLOCK_CLOSE: 1,
  REQUIRE_TWO_APPROVERS: 2,
  HUMAN_REVIEW: 3,
  AUTO_RESOLVE: 4,
};

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  /** Register a rule. Earliest-registered rules evaluate first (highest priority). */
  addRule(rule: PolicyRule): this {
    this.rules.push(rule);
    return this;
  }

  /** Bulk-register a rule set, preserving order. */
  addRules(rules: PolicyRule[]): this {
    for (const r of rules) this.addRule(r);
    return this;
  }

  get all(): ReadonlyArray<PolicyRule> {
    return this.rules;
  }

  /**
   * Evaluate a decision context. Returns every matching rule, highest priority
   * first (registration order). The caller adopts the action of the FIRST match.
   */
  evaluate(ctx: DecisionContext): PolicyRule[] {
    return this.rules.filter((r) => {
      try {
        return r.condition(ctx);
      } catch {
        return false; // a failing predicate must not silently grant authority
      }
    });
  }

  /** The action that governs this decision, or null if no rule matched. */
  governingAction(ctx: DecisionContext): PolicyAction | null {
    const match = this.evaluate(ctx)[0];
    return match ? match.action : null;
  }

  /** True when a rule grants AUTOMATED resolution authority for this decision. */
  canAutoResolve(ctx: DecisionContext): boolean {
    const action = this.governingAction(ctx);
    return action === 'AUTO_RESOLVE';
  }

  /** True when any matching rule blocks — no action may proceed. */
  isBlocked(ctx: DecisionContext): boolean {
    return this.evaluate(ctx).some(
      (r) => r.action === 'BLOCK_CLOSE' || r.action === 'FORBID_DIRECT_ACTION',
    );
  }

  /** True when the governing action demands a second human approver. */
  requiresTwoApprovers(ctx: DecisionContext): boolean {
    return this.governingAction(ctx) === 'REQUIRE_TWO_APPROVERS';
  }

  /** Ranked action list for diagnostics (most permissive first). */
  actionRank(action: PolicyAction): number {
    return ACTION_PRIORITY[action];
  }
}
