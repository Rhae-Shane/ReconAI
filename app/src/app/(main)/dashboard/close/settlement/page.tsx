import { ensureLiveClose, getRun } from "@/lib/close/store";

import { AgingMetrics } from "./_components/aging-metrics";
import { JournalPeriods } from "./_components/journal-periods";
import { SettlementChat } from "./_components/settlement-chat";

export default async function SettlementPage() {
  await ensureLiveClose();
  const run = getRun("run_today");
  const settled = run?.settlements.filter((s) => s.status === "RECEIVED" || s.status === "RECONCILED").length ?? 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl tracking-tight">Settlement Q&A</h1>
        <p className="text-muted-foreground text-sm">
          Ask questions about the settled ledger. Answers cite matched records{" "}
          {settled > 0 ? `· ${settled} settled lines available` : ""}.
        </p>
      </div>

      <AgingMetrics />

      <JournalPeriods />

      <div className="min-h-0 flex-1 rounded-xl border bg-card">
        <SettlementChat />
      </div>
    </div>
  );
}
