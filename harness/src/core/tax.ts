/**
 * tax.ts — TaxMatcher: map raw lines to GST/HSN categories + ledger accounts.
 * Rule-based by default; an optional judge fallback arbitrates ambiguous
 * descriptions.
 */
import type { FinRecord, TaxCategory, TaxLineMatch } from './types.js';

export const DEFAULT_CATEGORIES: TaxCategory[] = [
  { code: '998314', label: 'Business Services' },
  { code: '998313', label: 'Subscription / Software Services' },
  { code: '998212', label: 'Hardware / Equipment' },
  { code: '998361', label: 'Consulting / Professional Services' },
  { code: '998399', label: 'Support & Maintenance' },
];

interface Rule {
  pattern: RegExp;
  category: TaxCategory;
}

const RULES: Rule[] = [
  {
    pattern: /saas|subscription|software|license|crm|cloud/i,
    category: { code: '998313', label: 'Subscription / Software Services' },
  },
  {
    pattern: /laptop|hardware|equipment|device|mac|server/i,
    category: { code: '998212', label: 'Hardware / Equipment' },
  },
  {
    pattern: /consult|advis|professional|legal|audit/i,
    category: { code: '998361', label: 'Consulting / Professional Services' },
  },
  {
    pattern: /maintenance|support|amc|service/i,
    category: { code: '998314', label: 'Support & Maintenance' },
  },
  {
    pattern: /hosting|infra|bandwidth|data/i,
    category: { code: '998313', label: 'Subscription / Software Services' },
  },
];

export interface JudgeLike {
  (line: FinRecord, categories: TaxCategory[]): TaxLineMatch | null;
}

export class TaxMatcher {
  constructor(
    private categories: TaxCategory[] = DEFAULT_CATEGORIES,
    private judgeFallback?: JudgeLike,
  ) {}

  /** Match a single line by rule; falls back to the judge for ambiguous text. */
  match(line: FinRecord): TaxLineMatch {
    const haystack = [line.description, text(line.raw?.item), text(line.raw?.hsn)].join(' ');
    const hit = RULES.find((r) => r.pattern.test(haystack));
    if (hit) {
      return {
        recordId: line.id,
        categoryCode: hit.category.code,
        categoryLabel: hit.category.label,
        matchedBy: 'RULE',
        confidence: 0.95,
        reason: `rule:${hit.category.code} (${hit.category.label})`,
      };
    }
    if (this.judgeFallback) {
      const judged = this.judgeFallback(line, this.categories);
      if (judged) return judged;
    }
    return {
      recordId: line.id,
      categoryCode: null,
      categoryLabel: undefined,
      matchedBy: 'JUDGED',
      confidence: 0.3,
      reason: 'no rule match; judge could not attribute a category',
    };
  }
}

function text(v: unknown): string {
  return v === undefined || v === null ? '' : String(v);
}
