/**
 * explain.test.ts — unit coverage for buildMatchExplanation (FEE_NETTED + AI).
 */
import { describe, expect, it } from 'vitest';
import { buildMatchExplanation, displayMethodLabel } from '../src/core/explain.js';
import type { ExplainableGroup, ExplainableRecord } from '../src/core/explain.js';

const INV: ExplainableRecord = {
  id: 'INV-1',
  sourceRef: 'INV-10001',
  kind: 'INVOICE',
  amountPaise: 1_000_000,
  counterparty: 'Acme',
  ts: '2026-08-14',
};
const FEE: ExplainableRecord = {
  id: 'FEE-1',
  sourceRef: 'fee_1',
  kind: 'FEE',
  amountPaise: -15_000,
  feeTaxPaise: 2_700,
  counterparty: 'Acme',
  ts: '2026-08-14',
};
const STL: ExplainableRecord = {
  id: 'STL-1',
  sourceRef: 'UTR9',
  kind: 'SETTLEMENT',
  amountPaise: 982_300,
  counterparty: 'Acme',
  ts: '2026-08-14',
};

const feeNetted: ExplainableGroup = {
  id: 'grp_0',
  key: 'UTR9',
  method: 'NETTED',
  matchType: 'FEE_NETTED',
  confidence: 0.99,
  reason: 'netted:fee',
  amountPaise: 1_000_000,
  links: [
    { recordId: INV.id, matchedOn: 'gross', matchType: 'FEE_NETTED' },
    { recordId: FEE.id, matchedOn: 'fee', matchType: 'FEE_NETTED' },
    { recordId: STL.id, matchedOn: 'utr', matchType: 'FEE_NETTED' },
  ],
  netting: {
    grossPaise: 1_000_000,
    feePaise: 15_000,
    taxOnFeePaise: 2_700,
    refundPaise: 0,
    adjustmentPaise: 0,
    netExpectedPaise: 982_300,
    actualSettlementPaise: 982_300,
    variancePaise: 0,
  },
};

describe('displayMethodLabel', () => {
  it('maps FEE_NETTED to FEE_NETTING', () => {
    expect(displayMethodLabel('FEE_NETTED', 'NETTED')).toBe('FEE_NETTING');
  });
});

describe('buildMatchExplanation', () => {
  it('explains a FEE_NETTED group with arithmetic breakdown', () => {
    const expl = buildMatchExplanation(feeNetted, [INV, FEE, STL]);
    expect(expl.kind).toBe('deterministic');
    expect(expl.method).toBe('FEE_NETTING');
    expect(expl.aiUsed).toBe(false);
    expect(expl.invoiceRef).toBe('INV-10001');
    expect(expl.grossPaise).toBe(1_000_000);
    expect(expl.feePaise).toBe(15_000);
    expect(expl.taxOnFeePaise).toBe(2_700);
    expect(expl.expectedPaise).toBe(982_300);
    expect(expl.settlementPaise).toBe(982_300);
    expect(expl.differencePaise).toBe(0);
    expect(expl.confidence).toBe(0.99);
    expect(expl.humanReviewRequired).toBe(false);
    expect(expl.linkedRefs).toHaveLength(3);
  });

  it('explains an AI residual match with failed stages + signals', () => {
    const aiGroup: ExplainableGroup = {
      id: 'grp_ai',
      key: 'near:pay_x',
      method: 'JUDGED',
      matchType: 'AI_RESOLVED',
      confidence: 0.78,
      reason: 'judge: amount similarity + counterparty + date window',
      amountPaise: 50_000,
      links: [
        { recordId: 'a', matchedOn: 'judge', matchType: 'AI_RESOLVED' },
        { recordId: 'b', matchedOn: 'judge', matchType: 'AI_RESOLVED' },
      ],
      aiProvenance: {
        decisionId: 'dec_1',
        model: 'gpt-4o-mini',
        promptVersion: 'reconciliation-v3',
        inputHash: 'abc',
        output: 'LIKELY MATCH',
        confidence: 0.78,
        timestamp: '2026-08-14T12:00:00.000Z',
        humanReviewRequired: true,
      },
    };
    const records: ExplainableRecord[] = [
      { id: 'a', sourceRef: 'pay_x', kind: 'PAYMENT', amountPaise: 50_000, counterparty: 'Acme', ts: '2026-08-14' },
      { id: 'b', sourceRef: 'UTR_x', kind: 'SETTLEMENT', amountPaise: 49_800, counterparty: 'Acme', ts: '2026-08-14' },
    ];
    const expl = buildMatchExplanation(aiGroup, records);
    expect(expl.kind).toBe('ai');
    expect(expl.aiUsed).toBe(true);
    expect(expl.failedStages).toEqual(['EXACT', 'NORMALIZED', 'FEE_NETTING']);
    expect(expl.verdict).toBe('PROBABLE MATCH');
    expect(expl.humanReviewRequired).toBe(true);
    expect(expl.signals.amountSimilarity).toBe(true);
    expect(expl.signals.counterparty).toBe(true);
    expect(expl.provenance?.decisionId).toBe('dec_1');
  });

  it('still explains EXACT groups without netting', () => {
    const exact: ExplainableGroup = {
      id: 'grp_e',
      key: 'UTR1',
      method: 'EXACT',
      matchType: 'EXACT',
      confidence: 1,
      reason: 'exact:utr',
      amountPaise: 10_000,
      links: [
        { recordId: 'p', matchedOn: 'gatewayRef', matchType: 'EXACT' },
        { recordId: 's', matchedOn: 'utr', matchType: 'EXACT' },
      ],
    };
    const records: ExplainableRecord[] = [
      { id: 'p', sourceRef: 'pay_1', kind: 'PAYMENT', amountPaise: 10_000 },
      { id: 's', sourceRef: 'UTR1', kind: 'SETTLEMENT', amountPaise: 10_000 },
    ];
    const expl = buildMatchExplanation(exact, records);
    expect(expl.kind).toBe('deterministic');
    expect(expl.method).toBe('EXACT');
    expect(expl.aiUsed).toBe(false);
    expect(expl.grossPaise).toBeUndefined();
    expect(expl.linkedRefs.map((r) => r.sourceRef)).toEqual(['pay_1', 'UTR1']);
  });
});
