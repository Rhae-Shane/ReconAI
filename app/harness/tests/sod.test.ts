/**
 * sod.test.ts — Segregation of Duties for critical exception resolution.
 */
import { describe, it, expect } from 'vitest';
import {
  assertSegregationOfDuties,
  isCriticalException,
  CRITICAL_VARIANCE_PAISE,
} from '../src/control/sod.js';

describe('isCriticalException', () => {
  it('treats AMOUNT_MISMATCH and DUPLICATE as critical', () => {
    expect(isCriticalException({ reasonCode: 'AMOUNT_MISMATCH' })).toBe(true);
    expect(isCriticalException({ reasonCode: 'DUPLICATE' })).toBe(true);
  });

  it('treats |variance| at/above threshold as critical', () => {
    expect(isCriticalException({ variancePaise: CRITICAL_VARIANCE_PAISE })).toBe(true);
    expect(isCriticalException({ variancePaise: -CRITICAL_VARIANCE_PAISE })).toBe(true);
    expect(isCriticalException({ variancePaise: CRITICAL_VARIANCE_PAISE - 1 })).toBe(false);
  });

  it('does not mark ordinary reason codes critical without large variance', () => {
    expect(isCriticalException({ reasonCode: 'NO_KEY' })).toBe(false);
    expect(isCriticalException({ reasonCode: 'LOW_CONFIDENCE', variancePaise: 50 })).toBe(false);
  });

  it('honours an explicit critical flag', () => {
    expect(isCriticalException({ reasonCode: 'NO_KEY', critical: true })).toBe(true);
    expect(isCriticalException({ reasonCode: 'AMOUNT_MISMATCH', critical: false })).toBe(false);
  });
});

describe('assertSegregationOfDuties', () => {
  it('allows distinct resolver and approver', () => {
    expect(() => assertSegregationOfDuties('accountant.demo', 'owner.demo')).not.toThrow();
  });

  it('throws when the same person resolves and approves', () => {
    expect(() => assertSegregationOfDuties('reviewer.solo', 'reviewer.solo')).toThrow(
      /segregation of duties/,
    );
  });

  it('throws when either actor is missing', () => {
    expect(() => assertSegregationOfDuties('', 'owner.demo')).toThrow(/required/);
    expect(() => assertSegregationOfDuties('accountant.demo', '  ')).toThrow(/required/);
  });
});
