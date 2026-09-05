import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { orgProfile } from "@/lib/close/org";
import { ensureLiveClose, getRecords, getTaxMatches } from "@/lib/close/store";
import { gst2bSummary, reconcileGst2BByInvoice } from "@/lib/finance/gst";
import { gstr2bFromRecords, internalPurchaseRows } from "@/lib/finance/gst-books";
import { loadGstr2b } from "@/lib/finance/gst-store";

import { Gst2bPanel } from "./_components/gst-2b-panel";
import { GstFilePanel } from "./_components/gst-file-panel";
import { ItcChart } from "./_components/itc-chart";
import { TaxMatchTable } from "./_components/tax-match-table";

function inr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default async function TaxPage() {
  await ensureLiveClose();
  const matches = getTaxMatches("run_today");
  const records = getRecords("run_today");
  const org = orgProfile();
  const stored = await loadGstr2b();

  const internal = internalPurchaseRows(records);
  const gstr2b = stored?.rows?.length ? stored.rows : gstr2bFromRecords(records);
  const result = reconcileGst2BByInvoice(gstr2b, internal);
  const internalSummary = gst2bSummary(internal);
  const matchPct = Math.round(result.matchRate * 100);
  const pullSource = stored?.source ?? (gstr2b.length ? "gateway-fees" : "empty");

  const stats = [
    {
      label: "Supplier-invoice match rate",
      value: `${matchPct}%`,
      hint: `${result.matched.length}/${gstr2b.length} on GSTR-2B matched`,
    },
    { label: "Eligible ITC (matched)", value: inr(result.itcEligiblePaise), hint: `${org.name} books vs 2B` },
    {
      label: "ITC shortfall (missed)",
      value: inr(result.itcShortfallPaise),
      hint: `${gstr2b.length - result.matched.length} 2B lines unmatched`,
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
        <h1 className="text-3xl tracking-tight">Tax / GST</h1>
        <p className="text-muted-foreground text-sm">
          {org.legalName} · GSTIN {org.gstin} · 2B matching on supplier GSTIN + invoice number.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>GST 2A/2B reconciliation</CardTitle>
            <Badge variant="outline">{pullSource === "upload" ? "portal export" : "PSP fee invoices"}</Badge>
          </div>
          <CardDescription>
            Internal purchase books come from GST invoices and Razorpay fee+tax rows. The 2B side is the last uploaded
            portal export, or those same fee invoices when no export is stored. Filing is a signed sandbox submit, not
            live GSTN.
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
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Gst2bPanel />
        <GstFilePanel />
      </div>

      <ItcChart eligiblePaise={result.itcEligiblePaise} shortfallPaise={result.itcShortfallPaise} />

      {matches.length > 0 ? (
        <TaxMatchTable matches={matches} />
      ) : (
        <p className="text-muted-foreground text-sm">No HSN tax matches for the current close run yet.</p>
      )}
    </div>
  );
}
