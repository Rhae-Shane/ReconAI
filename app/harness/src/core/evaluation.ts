/**
 * evaluation.ts — AI evaluation metrics for the residual resolver.
 *
 * Every evaluated run is stamped with a `datasetVersion` so a model's scores can
 * be compared across data releases and over time (the registry consumes these to
 * drive promotion). Metrics are computed on the binary class "should this residual
 * be resolved/matched as positive":
 *
 *   precision            TP / (TP + FP)
 *   recall               TP / (TP + FN)
 *   falsePositiveRate    FP / (FP + TN)
 *   falseNegativeRate    FN / (FN + TP)
 *   calibrationBrier     mean squared error (confidence − outcome)²  (lower=better)
 *   overrideRate         overridden / n   (trust check, lower=better)
 *   cost / latency       cumulative cost, average latency
 */
export type MetricName =
  | 'precision'
  | 'recall'
  | 'falsePositiveRate'
  | 'falseNegativeRate'
  | 'calibrationBrier'
  | 'overrideRate'
  | 'totalCost'
  | 'avgLatencyMs';

/** Metrics that are better when HIGHER (+/-). */
export const HIGHER_IS_BETTER: ReadonlySet<MetricName> = new Set(['precision', 'recall']);

/** One AI decision, as recorded by the evaluator. */
export interface AiDecision {
  recordId: string;
  /** Predicted positive (resolve/match this residual). */
  decision: boolean;
  /** Model confidence in the decision (0..1). */
  confidence: number;
  /** True when a human/judge overrode this AI decision. */
  overridden: boolean;
  /** Cost incurred for this decision (tokens / rupees). */
  cost: number;
  /** Latency of this decision (ms). */
  latencyMs: number;
}

/** Ground-truth outcome for one record. */
export interface GroundTruthDecision {
  recordId: string;
  /** True when the residual *should* have been resolved as positive. */
  positive: boolean;
}

export interface EvaluateOptions {
  /** Dataset release tag stamped on every evaluation. */
  datasetVersion: string;
}

export interface EvaluationReport {
  datasetVersion: string;
  n: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  /** Brier score: mean squared error of confidence vs outcome (0..1). */
  calibrationBrier: number;
  overrideRate: number;
  totalCost: number;
  avgLatencyMs: number;
}

/**
 * Compute the metric set for a batch of AI decisions against ground truth.
 * `decisions` and `groundTruth` are matched by `recordId`; decisions without a
 * row in ground truth are counted against the evaluator as unpacked (skipped).
 */
export function evaluate(
  decisions: AiDecision[],
  groundTruth: GroundTruthDecision[],
  opts: EvaluateOptions,
): EvaluationReport {
  const truth = new Map(groundTruth.map((g) => [g.recordId, g.positive]));

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let brier = 0;
  let overridden = 0;
  let cost = 0;
  let latency = 0;
  let n = 0;

  for (const d of decisions) {
    if (!truth.has(d.recordId)) continue; // only score labelled records
    const positive = truth.get(d.recordId)!;
    const predicted = d.decision;
    const outcome = positive ? 1 : 0;
    brier += (clamp01(d.confidence) - outcome) ** 2;
    if (predicted && positive) tp++;
    else if (predicted && !positive) fp++;
    else if (!predicted && !positive) tn++;
    else fn++; // !predicted && positive
    if (d.overridden) overridden++;
    cost += d.cost;
    latency += d.latencyMs;
    n++;
  }

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const fpr = fp + tn === 0 ? 0 : fp / (fp + tn);
  const fnr = fn + tp === 0 ? 0 : fn / (fn + tp);

  return {
    datasetVersion: opts.datasetVersion,
    n,
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    falsePositiveRate: fpr,
    falseNegativeRate: fnr,
    calibrationBrier: n === 0 ? 0 : brier / n,
    overrideRate: n === 0 ? 0 : overridden / n,
    totalCost: cost,
    avgLatencyMs: n === 0 ? 0 : latency / n,
  };
}

export interface ModelComparison {
  overall: 'a' | 'b' | 'tie';
  /** Which model wins each metric ('tie' when equal or both zero). */
  byMetric: Record<MetricName, 'a' | 'b' | 'tie'>;
  /** Metrics where A strictly beat B. */
  better: MetricName[];
  /** Metrics where A strictly lost to B. */
  worse: MetricName[];
}

export const ALL_METRICS: readonly MetricName[] = [
  'precision',
  'recall',
  'falsePositiveRate',
  'falseNegativeRate',
  'calibrationBrier',
  'overrideRate',
  'totalCost',
  'avgLatencyMs',
];

/**
 * Compare two evaluations model-to-model. For each metric the better value is the
 * higher one when it is in HIGHER_IS_BETTER, otherwise the lower one. `overall`
 * is decided by majority of metrics one model strictly won.
 */
export function compareModels(a: EvaluationReport, b: EvaluationReport): ModelComparison {
  const byMetric = {} as Record<MetricName, 'a' | 'b' | 'tie'>;
  let aWins = 0;
  let bWins = 0;

  for (const m of ALL_METRICS) {
    const av = a[m];
    const bv = b[m];
    let winner: 'a' | 'b' | 'tie' = 'tie';
    if (av !== bv) {
      const aBetter = HIGHER_IS_BETTER.has(m) ? av > bv : av < bv;
      winner = aBetter ? 'a' : 'b';
    }
    byMetric[m] = winner;
    if (winner === 'a') aWins++;
    else if (winner === 'b') bWins++;
  }

  const overall = aWins > bWins ? 'a' : bWins > aWins ? 'b' : 'tie';
  const better = ALL_METRICS.filter((m) => byMetric[m] === 'a');
  const worse = ALL_METRICS.filter((m) => byMetric[m] === 'b');

  return { overall, byMetric, better, worse };
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
