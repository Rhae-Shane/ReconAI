import { differenceInCalendarDays, parseISO } from "date-fns";

/** One aging bucket: number of rows and summed *signed* paise that fell due in the window. */
export interface AgingBucket {
  bucket: string;
  count: number;
  amountPaise: number;
}

/**
 * Bucket receivable/payable rows by days-overdue relative to `asOfIso`.
 *
 * When `bucketLabels.length === 4` the standard buckets are used, aligned to the labels:
 *   0-30, 31-60, 61-90, 90+ days overdue.
 * Rows due in the future (negative days) land in the 0-30 bucket. Each row's paise sign is
 * preserved (the function never swaps signs), so inflow rows stay positive and outflow negative.
 * Date arithmetic is done in UTC calendar days for determinism - no timezone drift.
 *
 * For any other label count, rows are distributed into equally-spaced 30-day buckets (deterministic).
 */
export function ageBuckets(
  rows: Array<{ dateIso: string; amountPaise: number }>,
  asOfIso: string,
  bucketLabels: string[],
): AgingBucket[] {
  const buckets: AgingBucket[] = bucketLabels.map((bucket) => ({ bucket, count: 0, amountPaise: 0 }));
  if (buckets.length === 0) return buckets;

  const asOf = parseISO(asOfIso);
  const isFour = bucketLabels.length === 4;

  for (const row of rows) {
    const daysDue = differenceInCalendarDays(asOf, parseISO(row.dateIso));

    let index: number;
    if (isFour) {
      // Standard aging windows, matching the 0-30/31-60/61-90/90+ labels exactly.
      if (daysDue <= 30) index = 0;
      else if (daysDue <= 60) index = 1;
      else if (daysDue <= 90) index = 2;
      else index = 3;
    } else {
      // Fallback: evenly-spaced 30-day buckets for arbitrary label counts.
      index = Math.min(bucketLabels.length - 1, Math.floor(Math.max(0, daysDue) / 30));
    }

    buckets[index].count += 1;
    buckets[index].amountPaise += row.amountPaise;
  }

  return buckets;
}

/**
 * Working-capital health metrics in days.
 *
 *   DSO = receivables / (revenue / periodDays)
 *   DPO = payables / (cogs / periodDays)
 *   cashConversionDays = DSO - DPO
 *
 * A negative cash-conversion cycle means the business collects cash before paying suppliers.
 * All denominators are guarded - a zero revenue or COGS yields 0 for the affected metric.
 */
export function dsoDpo(opts: {
  receivablesPaise: number;
  payablesPaise: number;
  revenuePaise: number;
  cogsPaise: number;
  periodDays: number;
}): { dsoDays: number; dpoDays: number; cashConversionDays: number } {
  const { receivablesPaise, payablesPaise, revenuePaise, cogsPaise, periodDays } = opts;
  const pd = Math.max(1, periodDays);

  const dsoDays = revenuePaise === 0 ? 0 : receivablesPaise / (revenuePaise / pd);
  const dpoDays = cogsPaise === 0 ? 0 : payablesPaise / (cogsPaise / pd);

  return { dsoDays, dpoDays, cashConversionDays: dsoDays - dpoDays };
}
