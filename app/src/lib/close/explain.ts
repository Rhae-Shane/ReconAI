/**
 * App-facing match explanation helpers.
 *
 * Prefer the harness implementation (`controller-harness/core/explain`) as the
 * single source of truth; this module re-exports it and adds a thin typed
 * wrapper around local MatchGroup / FinRecord shapes.
 */
export type {
  BuildMatchExplanationOptions,
  ExplainableGroup,
  ExplainableRecord,
  LinkedRecordRef,
  MatchExplanation,
  MatchFailedStage,
  MatchSignals,
} from "controller-harness/core/explain";
export { displayMethodLabel } from "controller-harness/core/explain";

import {
  type BuildMatchExplanationOptions,
  buildMatchExplanation as buildCore,
  type MatchSignals,
} from "controller-harness/core/explain";

import { DEFAULT_FINANCE_CONFIG } from "./config";
import type { FinRecord, MatchGroup } from "./types";

/** Build a drawer-ready explanation for a MatchGroup using linked FinRecords. */
export function buildMatchExplanation(
  group: MatchGroup,
  records: FinRecord[],
  options: BuildMatchExplanationOptions = {},
): ReturnType<typeof buildCore> {
  return buildCore(group, records, {
    resolveThreshold: options.resolveThreshold ?? DEFAULT_FINANCE_CONFIG.resolveThreshold,
  });
}

/** Signal labels shown in the AI explanation drawer. */
export const SIGNAL_LABELS: Record<keyof MatchSignals, string> = {
  amountSimilarity: "Amount similarity",
  date: "Date",
  reference: "Reference",
  counterparty: "Counterparty",
};

export function activeSignalLabels(signals: MatchSignals): string[] {
  return (Object.keys(SIGNAL_LABELS) as Array<keyof MatchSignals>)
    .filter((k) => signals[k])
    .map((k) => SIGNAL_LABELS[k]);
}
