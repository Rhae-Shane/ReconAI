import { ensureLiveClose } from "@/lib/close/store";
import { getTrustSnapshot } from "@/lib/close/trust";

import { KpiHint } from "../_components/kpi-hint";
import { TrustBoard } from "./_components/trust-board";

export default async function TrustPage() {
  await ensureLiveClose();
  const snap = getTrustSnapshot();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h1 className="text-3xl tracking-tight">Why ReconAI Can Be Trusted</h1>
        <p className="text-muted-foreground text-sm">
          Measured outcomes from the close engine — matched, partial, and human-review lines stay visible. Nothing is
          cherry-picked.
        </p>
      </div>

      <div className="rounded-xl border bg-card px-4 py-3 ring-1 ring-foreground/10">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          <KpiHint hint="Total lines from the trust snapshot’s source run — the measured base for match and exception rates below.">
            Records processed
          </KpiHint>
        </p>
        <p className="font-semibold text-3xl tabular-nums tracking-tight">{snap.records}</p>
        {snap.runId && <p className="mt-1 text-muted-foreground text-xs">Source run · {snap.runId}</p>}
      </div>

      <TrustBoard snap={snap} />
    </div>
  );
}
