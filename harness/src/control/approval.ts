/**
 * approval.ts — Approval workflow for financially significant actions.
 *
 * Enforces the human-control layer: single vs dual approval by magnitude, and
 * segregation of duties — the requester can never approve their own request
 * (attempting to does not silently pass; it throws). The lifecycle state is
 * tracked by the ApproverPolicy; the ApprovalRequest itself stays an immutable
 * record of WHAT was asked and WHO approved it, so the trail is auditable.
 */
import { randomUUID } from 'node:crypto';
import type { AuditChainEvent } from './audit-chain.js';

export {
  assertSegregationOfDuties,
  isCriticalException,
  CRITICAL_REASON_CODES,
  CRITICAL_VARIANCE_PAISE,
} from './sod.js';
export type { CriticalExceptionInput } from './sod.js';

export enum ApprovalState {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  REVIEWED = 'REVIEWED',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
  REJECTED = 'REJECTED',
}

export type ApprovalType = 'adjustment' | 'close' | 'writeoff' | 'manual_match';

export interface ApprovalRequest {
  id: string;
  runId: string;
  type: ApprovalType;
  /** Signed integer paise. */
  amountPaise: number;
  requestedBy: string;
  /** Distinct actor ids, one per approval granted (never includes request). */
  approvedBy: string[];
  createdAt: string;
}

export interface ApproverConfig {
  /** |amountPaise| >= this requires two distinct approvers. Infinity = always single. */
  dualApprovalAbovePaise: number;
  /** Types that always require dual approval, regardless of amount. */
  requireDualForTypes?: readonly ApprovalType[];
}

const DEFAULT_CONFIG: ApproverConfig = {
  dualApprovalAbovePaise: Number.POSITIVE_INFINITY,
  requireDualForTypes: [],
};

export class ApproverPolicy {
  private config: ApproverConfig;
  /** id → lifecycle state. Unknown ids are treated as DRAFT. */
  private states = new Map<string, ApprovalState>();

  constructor(config: Partial<ApproverConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** How many distinct approvers a request needs: 1 or 2. */
  requiredApprovals(req: Pick<ApprovalRequest, 'type' | 'amountPaise'>): 1 | 2 {
    if (this.config.requireDualForTypes?.includes(req.type)) return 2;
    if (Math.abs(req.amountPaise) >= this.config.dualApprovalAbovePaise) return 2;
    return 1;
  }

  /** DRAFT → SUBMITTED. */
  submit(req: ApprovalRequest): ApprovalRequest {
    this.assertState(req, ApprovalState.DRAFT);
    this.states.set(req.id, ApprovalState.SUBMITTED);
    return req;
  }

  /** SUBMITTED → REVIEWED (optional human review checkpoint). */
  review(req: ApprovalRequest): ApprovalRequest {
    this.assertState(req, ApprovalState.SUBMITTED);
    this.states.set(req.id, ApprovalState.REVIEWED);
    return req;
  }

  /**
   * Grant one approval. Enforces segregation of duties (requester can never
   * approve their own request) and dual-approval cardinality. An actor may only
   * approve once per request.
   */
  approve(req: ApprovalRequest, approver: string): ApprovalRequest {
    const current = this.state(req);
    if (current === ApprovalState.APPROVED || current === ApprovalState.POSTED) {
      throw new Error(`approval ${req.id} already ${current}, cannot approve again`);
    }
    if (current === ApprovalState.REJECTED) {
      throw new Error(`approval ${req.id} was rejected, cannot approve`);
    }
    if (approver === req.requestedBy) {
      throw new Error(
        `segregation of duties: ${approver} requested ${req.id} and cannot approve it`,
      );
    }
    if (req.approvedBy.includes(approver)) {
      throw new Error(`${approver} has already approved ${req.id}`);
    }
    const approvedBy = [...req.approvedBy, approver];
    const next = approvedBy.length >= this.requiredApprovals(req)
      ? ApprovalState.APPROVED
      : ApprovalState.REVIEWED;
    // Mutate the request's approvedBy so the audit trail reflects reality; the
    // request object itself stays a plain record of who asked and who approved.
    (req as { approvedBy: string[] }).approvedBy = approvedBy;
    this.states.set(req.id, next);
    return req;
  }

  /** APPROVED → POSTED, once all required approvals are in. */
  post(req: ApprovalRequest): ApprovalRequest {
    this.assertState(req, ApprovalState.APPROVED);
    this.states.set(req.id, ApprovalState.POSTED);
    return req;
  }

  /** → REJECTED. Also segregated: requester cannot reject their own request. */
  reject(req: ApprovalRequest, actor: string): ApprovalRequest {
    const current = this.state(req);
    if (current === ApprovalState.APPROVED || current === ApprovalState.POSTED) {
      throw new Error(`approval ${req.id} already ${current}, cannot reject`);
    }
    if (actor === req.requestedBy) {
      throw new Error(
        `segregation of duties: ${actor} requested ${req.id} and cannot reject it`,
      );
    }
    this.states.set(req.id, ApprovalState.REJECTED);
    return req;
  }

  /** Read the current lifecycle state (unknown ids read as DRAFT). */
  state(req: ApprovalRequest): ApprovalState {
    return this.states.get(req.id) ?? ApprovalState.DRAFT;
  }

  isApproved(req: ApprovalRequest): boolean {
    const s = this.state(req);
    return s === ApprovalState.APPROVED || s === ApprovalState.POSTED;
  }

  reset(): void {
    this.states.clear();
  }

  private assertState(req: ApprovalRequest, expected: ApprovalState): void {
    const actual = this.state(req);
    if (actual !== expected) {
      throw new Error(`approval ${req.id} is ${actual}, expected ${expected}`);
    }
  }
}

/** Convenience factory for a fresh DRAFT request. */
export function createApprovalRequest(input: {
  runId: string;
  type: ApprovalType;
  amountPaise: number;
  requestedBy: string;
}): ApprovalRequest {
  return {
    id: `apr-${randomUUID()}`,
    runId: input.runId,
    type: input.type,
    amountPaise: input.amountPaise,
    requestedBy: input.requestedBy,
    approvedBy: [],
    createdAt: new Date().toISOString(),
  };
}

/** Emit an audit-chain event describing an approval transition. */
export function approvalAuditEvent(
  req: ApprovalRequest,
  action: string,
  state: ApprovalState,
): AuditChainEvent {
  return {
    action,
    runId: req.runId,
    actorType: 'SYSTEM',
    actorId: 'approver-policy',
    recordId: req.id,
    detail: {
      type: req.type,
      amountPaise: req.amountPaise,
      requestedBy: req.requestedBy,
      approvedBy: req.approvedBy,
      state,
    },
  };
}
