/**
 * sod.ts — Segregation of Duties helpers for critical exception resolution.
 *
 * ApproverPolicy already enforces requestedBy !== approver for adjustment workflows.
 * This module strengthens the exception resolve path specifically: the person who
 * submits a resolution must not be the person who approves it when the exception
 * is critical / high-risk.
 */
import type { ReasonCode } from '../core/types.js';

/** Reason codes that are always treated as material / high-risk. */
export const CRITICAL_REASON_CODES: ReadonlySet<ReasonCode> = new Set([
  'AMOUNT_MISMATCH',
  'DUPLICATE',
]);

/**
 * Absolute variance band (paise) at or above which an exception is critical.
 * Aligned with MaterialityEngine's default mandatoryApproval (₹1,000).
 */
export const CRITICAL_VARIANCE_PAISE = 10_00_00;

export interface CriticalExceptionInput {
  reasonCode?: ReasonCode | string;
  variancePaise?: number;
  /** When explicitly set, wins over heuristic classification. */
  critical?: boolean;
}

/**
 * Whether an exception is material / high-risk and therefore requires SoD
 * (resolvedBy !== approvedBy) before it can be fully resolved.
 */
export function isCriticalException(exc: CriticalExceptionInput): boolean {
  if (typeof exc.critical === 'boolean') return exc.critical;
  if (exc.reasonCode && CRITICAL_REASON_CODES.has(exc.reasonCode as ReasonCode)) {
    return true;
  }
  if (exc.variancePaise !== undefined && Math.abs(exc.variancePaise) >= CRITICAL_VARIANCE_PAISE) {
    return true;
  }
  return false;
}

/**
 * Enforce segregation of duties: the resolver cannot also be the approver.
 * Throws when the same actor attempts both roles (or either id is missing).
 */
export function assertSegregationOfDuties(resolvedBy: string, approvedBy: string): void {
  const resolver = resolvedBy?.trim();
  const approver = approvedBy?.trim();
  if (!resolver || !approver) {
    throw new Error(
      'segregation of duties: resolvedBy and approvedBy are both required to approve a critical exception',
    );
  }
  if (resolver === approver) {
    throw new Error(
      `segregation of duties: ${approver} resolved this exception and cannot approve it`,
    );
  }
}
