/**
 * forecast.ts — CashForecaster.project: derive a settlement-lag distribution
 * from matched lags and project forward cash with a confidence band.
 *
 * Model (deliberately simple + auditable): if we have matched settlement lags,
 * the matched inflow is scheduled to arrive spread evenly across the window;
 * each projected point is marked `reconciledIn` when that grounding exists.
 * Without matched lags no inflow is projected and confidence is low.
 */
import type { ForecastDatum } from './types.js';

export interface ProjectOptions {
  totalScheduledInflow?: number; // paise, matched/gated
  startDate?: string; // ISO "YYYY-MM-DD"
}

export class CashForecaster {
  /**
   * @param windowDays number of forward days to project (inclusive)
   * @param matchedLags settlement-lag distribution from matched groups (days)
   * @param currentBalance opening balance in paise
   */
  project(
    windowDays: number,
    matchedLags: number[],
    currentBalance: number,
    opts: ProjectOptions = {},
  ): ForecastDatum[] {
    const reconciledIn = matchedLags.length > 0;
    const totalScheduled = opts.totalScheduledInflow ?? 0;
    const perDay = reconciledIn && totalScheduled > 0 ? totalScheduled / windowDays : 0;
    const start = new Date((opts.startDate ?? today()).slice(0, 10) + 'T00:00:00Z');
    const out: ForecastDatum[] = [];
    let bal = currentBalance;
    for (let i = 1; i <= windowDays; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const deltaPaise = Math.round(perDay);
      bal += deltaPaise;
      // Confidence is grounded in how much of the projection rests on matched
      // inflow vs. ungrounded assumptions.
      const confidence = reconciledIn ? 0.9 : 0.2;
      out.push({
        date: d.toISOString().slice(0, 10),
        balancePaise: Math.round(bal),
        deltaPaise,
        confidence,
        reconciledIn,
      });
    }
    return out;
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
