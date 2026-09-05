import { CalendarClock, GitBranch, type Play, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listRunsFromStore } from "@/lib/close/store";
import { listEntities } from "@/lib/finance/entity";
import { listFxRates } from "@/lib/finance/fx";

import { CloseWorkspace } from "../_components/close-workspace";
import { CockpitAnalytics } from "../_components/cockpit-analytics";
import { FailedRunsPanel } from "../_components/failed-runs-panel";
import { RunSummaryKpis } from "../_components/run-summary-kpis";
import { RunsTable } from "../_components/runs-table";
import { ScheduleClose } from "../_components/schedule-close";
import { TrustStrip } from "../_components/trust-strip";

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

export default async function CloseRunsPage() {
  const runs = await listRunsFromStore();
  const [entities, fxRates] = await Promise.all([listEntities(), listFxRates()]);
  const done = runs.filter((r) => r.status === "DONE").length;
  const running = runs.filter((r) => r.status === "RUNNING").length;
  const failed = runs.filter((r) => r.status === "FAILED").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl tracking-tight">All runs</h1>
        <p className="text-muted-foreground text-sm">
          Upload a CSV to run the full pipeline — ingest, reconcile, AI judge, settle, forecast, tax, exceptions,
          close.
        </p>
      </div>

      <CloseWorkspace />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium text-sm">Close runs</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-md border bg-muted/40 px-2.5 py-1 tabular-nums">{runs.length} total</span>
            <span className="rounded-md border bg-muted/40 px-2.5 py-1 tabular-nums">{done} done</span>
            {running > 0 && (
              <span className="rounded-md border border-yellow-700/25 bg-yellow-500/10 px-2.5 py-1 text-yellow-700 tabular-nums dark:text-yellow-300">
                {running} running
              </span>
            )}
            {failed > 0 && (
              <span className="rounded-md border border-destructive/25 bg-destructive/10 px-2.5 py-1 text-destructive tabular-nums">
                {failed} failed
              </span>
            )}
          </div>
        </div>
        <RunsTable runs={runs} />
      </section>

      <RunSummaryKpis runs={runs} />

      <TrustStrip />

      <CockpitAnalytics runs={runs} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickStat icon={CalendarClock} label="Schedule" value="Daily 18:00 IST" />
        <QuickStat icon={ShieldCheck} label="Resolve threshold" value="0.70" />
        <QuickStat icon={GitBranch} label="Sources" value="Gateway · Bank · ERP · GST" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-normal text-muted-foreground text-sm">Entity &amp; FX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="font-medium text-muted-foreground text-xs">Entities</span>
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
            <span className="font-medium text-muted-foreground text-xs">FX rates</span>
            {fxRates.length === 0 ? (
              <p className="text-muted-foreground text-xs">No FX rates configured.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {fxRates.map((r, i) => (
                  <span key={`${r.base}-${r.quote}-${i}`} className="rounded-md border bg-muted/40 px-2.5 py-0.5 text-xs">
                    {r.base}/{r.quote} {r.rate} ({r.date})
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Conversions normalise every non-base amount to the base currency ({entities[0]?.baseCurrency ?? "INR"}{" "}
            paise).
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FailedRunsPanel />
        <ScheduleClose />
      </div>
    </div>
  );
}
