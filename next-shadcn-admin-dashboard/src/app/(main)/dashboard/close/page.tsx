import { CalendarClock, GitBranch, type Play, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRunsFromStore } from "@/lib/close/store";
import { listEntities } from "@/lib/finance/entity";
import { listFxRates } from "@/lib/finance/fx";

import { CockpitAnalytics } from "./_components/cockpit-analytics";
import { FailedRunsPanel } from "./_components/failed-runs-panel";
import { RazorpaySyncCard } from "./_components/razorpay-sync-card";
import { RunSummaryKpis } from "./_components/run-summary-kpis";
import { RunsTable } from "./_components/runs-table";
import { ScheduleClose } from "./_components/schedule-close";
import { StartRunButton } from "./_components/start-run-button";
import { TrustStrip } from "./_components/trust-strip";
import { UploadDropzone } from "./_components/upload-dropzone";

function QuickStat({ icon: Icon, label, value }: { icon: typeof Play; label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="font-normal text-muted-foreground text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-xl leading-none tracking-tight">{value}</CardContent>
    </Card>
  );
}

export default async function CloseCockpitPage() {
  const runs = await listRunsFromStore();
  const [entities, fxRates] = await Promise.all([listEntities(), listFxRates()]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-3xl tracking-tight">Close Controller</h1>
          <p className="text-muted-foreground text-sm">
            Monthly close loop - reconcile, settle, forecast, tax-match and file the honest exceptions.
          </p>
        </div>
        <StartRunButton />
      </div>

      <RunSummaryKpis runs={runs} />

      <TrustStrip />

      <CockpitAnalytics runs={runs} />

      <RazorpaySyncCard />

      <UploadDropzone />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickStat icon={CalendarClock} label="Schedule" value="Daily 18:00 IST" />
        <QuickStat icon={ShieldCheck} label="Resolve threshold" value="0.70" />
        <QuickStat icon={GitBranch} label="Sources" value="4 (gateway, bank, erp, gst)" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-normal text-muted-foreground text-sm">Entity &amp; FX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Entities</span>
            <div className="flex flex-wrap gap-1.5">
              {entities.map((e) => (
                <span
                  key={e.id}
                  className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs"
                  title={`base: ${e.baseCurrency}`}
                >
                  {e.name} &middot; {e.id} &middot; {e.baseCurrency}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">FX rates</span>
            {fxRates.length === 0 ? (
              <p className="text-xs text-muted-foreground">No FX rates configured.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {fxRates.map((r, i) => (
                  <span key={`${r.base}-${r.quote}-${i}`} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
                    {r.base}/{r.quote} {r.rate} ({r.date})
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Conversions normalise every non-base amount to the base currency ({entities[0]?.baseCurrency ?? "INR"}{" "}
            paise).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FailedRunsPanel />
        <ScheduleClose />
      </div>

      <div className="space-y-2">
        <h2 className="font-medium text-sm">Close runs</h2>
        <RunsTable runs={runs} />
      </div>
    </div>
  );
}
