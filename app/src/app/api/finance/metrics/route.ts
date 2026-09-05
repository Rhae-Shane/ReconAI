import { NextResponse } from "next/server";

import { formatISO, subDays } from "date-fns";

import { ensureLiveClose, getRecords } from "@/lib/close/store";
import { type AgingBucket, ageBuckets, dsoDpo } from "@/lib/finance/aging";

export const runtime = "nodejs";

const BUCKET_LABELS = ["0-30", "31-60", "61-90", "90+"];
const PERIOD_DAYS = 30;

interface DemoRow {
  dateIso: string;
  amountPaise: number;
}

/**
 * Deterministic receivables demo rows (used only when the store has no aggregatable invoice rows).
 * Offsets and paise are fixed constants so the same request always returns the same numbers.
 */
function demoReceivables(asOf: Date): DemoRow[] {
  const iso = (offsetDays: number) =>
    formatISO(subDays(asOf, offsetDays).setUTCHours(0, 0, 0, 0), { representation: "complete" });
  return [
    { dateIso: iso(5), amountPaise: 4_20_000 },
    { dateIso: iso(18), amountPaise: 2_90_000 },
    { dateIso: iso(42), amountPaise: 1_55_000 },
    { dateIso: iso(75), amountPaise: 95_000 },
    { dateIso: iso(120), amountPaise: 60_000 },
  ];
}

/**
 * Deterministic payables demo set - the store has no payable (money-we-owe) semantics, so this is
 * always derived, fixed-constant data. NOTE: this is not real source data; see `derived.payablesSource`.
 */
function demoPayables(asOf: Date): DemoRow[] {
  const iso = (offsetDays: number) =>
    formatISO(subDays(asOf, offsetDays).setUTCHours(0, 0, 0, 0), { representation: "complete" });
  return [
    { dateIso: iso(10), amountPaise: 2_40_000 },
    { dateIso: iso(25), amountPaise: 1_80_000 },
    { dateIso: iso(55), amountPaise: 1_20_000 },
  ];
}

/** GET /api/finance/metrics - aging buckets (receivables + payables) and DSO/DPO/cash-conversion readout. */
export async function GET() {
  const asOf = new Date();
  const asOfIso = asOf.toISOString();

  // Receivables come from reachable INVOICE rows in the deterministic close dataset where possible.
  await ensureLiveClose();
  const invoices = getRecords("run_today").filter((r) => r.kind === "INVOICE" && (r.amountPaise ?? 0) > 0);
  const receivables: DemoRow[] =
    invoices.length > 0 ? invoices.map((r) => ({ dateIso: r.ts, amountPaise: r.amountPaise })) : demoReceivables(asOf);

  const payables = demoPayables(asOf);

  const aging = ageBuckets(receivables, asOfIso, BUCKET_LABELS);
  const payablesAging = ageBuckets(payables, asOfIso, BUCKET_LABELS);

  const receivablesPaise = receivables.reduce((s, r) => s + r.amountPaise, 0);
  const payablesPaise = payables.reduce((s, r) => s + r.amountPaise, 0);

  // Revenue = invoiced receivables over the period; COGS = a fixed 80% of payables (derived).
  const revenuePaise = receivablesPaise;
  const cogsPaise = Math.round(payablesPaise * 0.8);

  const metrics = dsoDpo({
    receivablesPaise,
    payablesPaise,
    revenuePaise,
    cogsPaise,
    periodDays: PERIOD_DAYS,
  });

  return NextResponse.json({
    asOf: asOfIso,
    periodDays: PERIOD_DAYS,
    aging,
    payablesAging,
    dsoDpo: metrics,
    derived: {
      receivablesSource: invoices.length > 0 ? "dataset" : "demo",
      payablesSource: "demo",
      revenuePaise,
      cogsPaise,
    },
  });
}

export type { AgingBucket };
