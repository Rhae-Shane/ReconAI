import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ensureLiveClose, getRecords, getTaxMatches } from "@/lib/close/store";
import { type GstB2bRow, gst2bSummary, reconcileGst2BByInvoice } from "@/lib/finance/gst";

import { ItcChart } from "./_components/itc-chart";
import { TaxMatchTable } from "./_components/tax-match-table";

/** Deterministic 15-char placeholder GSTIN from a counterparty name (no real PII). */
function demoGstin(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10) || "unnamed";
  return `27${slug.padEnd(13, "0").slice(0, 13)}`;
}

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Derive the internal supplier-invoice ledger from the GST-source records in the current
 * close run. The demo dataset carries no invoice-level GSTIN, so a deterministic placeholder
 * GSTIN is derived per counterparty and clearly labelled as demo/placeholder on screen.
 */
function internalRows(records: ReturnType<typeof getRecords>): GstB2bRow[] {
  return records
    .filter((r) => r.source === "gst")
    .map((r) => {
      const total = Math.abs(r.amountPaise);
      const taxable = Math.round(total / 1.18);
      return {
        supplierGstin: demoGstin(r.counterparty ?? r.sourceRef),
        invoiceNo: r.sourceRef,
        invoiceDate: r.ts.slice(0, 10),
        taxablePaise: taxable,
        taxPaise: total - taxable,
        totalPaise: total,
        source: "internal",
      };
    });
}

/**
 * Placeholder supplier-side GSTR-2B. There is no real portal data in the demo, so we report
 * most of the booked supplier invoices and deliberately leave the tail unbooked (unclaimed)
 * plus drop in two supplier-invoiced lines our books never booked, which surface as the
 * missed-ITC shortfall. Every figure is deterministic and flagged as demo on screen.
 */
function placeholderGstr2b(internal: GstB2bRow[]): GstB2bRow[] {
  const booked = internal.slice(0, Math.max(0, internal.length - 2));
  const fallbackDate = internal[0]?.invoiceDate ?? "2026-08-01";
  return [
    ...booked.map((r) => ({ ...r, source: "gstr2b" as const })),
    {
      supplierGstin: demoGstin("Nimbus Cloud Services"),
      invoiceNo: "INV-2B-UNBOOKED-01",
      invoiceDate: fallbackDate,
      taxablePaise: 840000,
      taxPaise: 151200,
      totalPaise: 991200,
      source: "gstr2b",
    },
    {
      supplierGstin: demoGstin("Bluefin Media"),
      invoiceNo: "INV-2B-UNBOOKED-02",
      invoiceDate: fallbackDate,
      taxablePaise: 515000,
      taxPaise: 92700,
      totalPaise: 607700,
      source: "gstr2b",
    },
  ];
}

export default async function TaxPage() {
  await ensureLiveClose();
  const matches = getTaxMatches("run_today");
  const records = getRecords("run_today");

  const internal = internalRows(records);
  const gstr2b = placeholderGstr2b(internal);
  const result = reconcileGst2BByInvoice(gstr2b, internal);
  const internalSummary = gst2bSummary(internal);
  const matchPct = Math.round(result.matchRate * 100);

  const stats = [
    {
      label: "Supplier-invoice match rate",
      value: `${matchPct}%`,
      hint: `${result.matched.length}/${gstr2b.length} on GSTR-2B matched`,
    },
    { label: "Eligible ITC (matched)", value: inr(result.itcEligiblePaise), hint: "demo — not filing advice" },
    {
      label: "ITC shortfall (missed)",
      value: inr(result.itcShortfallPaise),
      hint: `${gstr2b.length - result.matched.length} placeholder 2B lines unmatched`,
    },
    {
      label: "Booked supplier invoices",
      value: `${internalSummary.count}`,
      hint: `${inr(internalSummary.totalPaise)} · GST ${inr(internalSummary.taxPaise)}`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl tracking-tight">Tax line matching</h1>
        <p className="text-muted-foreground text-sm">
          Tax reconciliation is a prototype extension of the close engine — not production-grade tax compliance.
          Demo lines map to GST/HSN categories with rules first; OpenAI is only a residual fallback.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>GST 2A/2B reconciliation</CardTitle>
            <Badge variant="outline" className="text-yellow-700 dark:text-yellow-300">
              demo / placeholder data
            </Badge>
          </div>
          <CardDescription>
            Illustrative invoice-level matching against a placeholder supplier-side GSTR-2B-shaped list — not a live
            GST portal integration or filing workflow. Matching is on{" "}
            <span className="font-medium">supplier GSTIN + invoice number</span>. The internal ledger comes from the
            run&apos;s GST-source records; the &quot;2B&quot; side is woven from the same invoices as demo data so the
            close engine can show how tax lines would attach. Treat ITC figures as exploratory only.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Invoice match rate (GSTR-2B → books)</span>
              <span className="font-medium tabular-nums">{matchPct}%</span>
            </div>
            <Progress value={matchPct} className="h-2" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border bg-muted/40 p-3">
                <p className="text-muted-foreground text-xs">{s.label}</p>
                <p className="mt-1 font-medium text-xl tabular-nums leading-none tracking-tight">{s.value}</p>
                <p className="mt-1.5 text-muted-foreground text-xs">{s.hint}</p>
              </div>
            ))}
          </div>

          {result.unmatched.length > 0 && (
            <p className="text-muted-foreground text-xs">
              {result.unmatched.length} rows did not match in this prototype — {gstr2b.length - result.matched.length}{" "}
              from the placeholder 2B list and {internal.length - result.matched.length} internal invoices without a
              counterpart. A future feed could post to{" "}
              <span className="font-medium">/api/finance/gst/b2b</span>; nothing here replaces GST portal compliance.
            </p>
          )}
        </CardContent>
      </Card>

      <ItcChart eligiblePaise={result.itcEligiblePaise} shortfallPaise={result.itcShortfallPaise} />

      {matches.length > 0 ? (
        <TaxMatchTable matches={matches} />
      ) : (
        <p className="text-muted-foreground text-sm">No tax matches for the current close run yet.</p>
      )}
    </div>
  );
}
