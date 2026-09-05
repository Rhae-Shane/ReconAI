import { ensureLiveClose, getForecast, getRun } from "@/lib/close/store";

import { ForecastChart } from "../forecast/_components/forecast-chart";
import { AgingMetrics } from "./_components/aging-metrics";
import { JournalPeriods } from "./_components/journal-periods";
import { SettlementChat } from "./_components/settlement-chat";

export default async function SettlementPage() {
  await ensureLiveClose();
  const run = getRun("run_today");
  const forecast = getForecast("run_today");
  const settled = run?.settlements.filter((s) => s.status === "RECEIVED" || s.status === "RECONCILED").length ?? 0;
  const grounded = forecast.filter((f) => f.reconciledIn).length;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl tracking-tight">Settlement</h1>
        <p className="text-muted-foreground text-sm">
          Aging, journals, and the 7-day cash forecast
          {settled > 0 ? ` · ${settled} settled lines available` : ""}. Use the corner chat for ledger Q&A.
        </p>
      </div>

      <AgingMetrics />

      <section className="space-y-2">
        <h2 className="font-medium text-sm">Cash forecast</h2>
        <ForecastChart data={forecast} groundedRecords={run?.meta.totals.matched ?? grounded} />
        {forecast.length === 0 && (
          <p className="text-muted-foreground text-sm">No completed run to forecast from yet.</p>
        )}
      </section>

      <JournalPeriods />

      <SettlementChat />
    </div>
  );
}
