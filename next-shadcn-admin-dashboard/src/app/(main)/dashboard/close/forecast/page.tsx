import { ensureLiveClose, getForecast, getRun } from "@/lib/close/store";

import { ForecastChart } from "./_components/forecast-chart";

export default async function ForecastPage() {
  await ensureLiveClose();
  const forecast = getForecast("run_today");
  const run = getRun("run_today");
  const grounded = forecast.filter((f) => f.reconciledIn).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl tracking-tight">Cash forecast</h1>
        <p className="text-muted-foreground text-sm">Next 7 days projected from settlement-lag distribution.</p>
      </div>

      <ForecastChart data={forecast} groundedRecords={run?.meta.totals.matched ?? grounded} />

      {forecast.length === 0 && <p className="text-muted-foreground text-sm">No completed run to forecast from yet.</p>}
    </div>
  );
}
