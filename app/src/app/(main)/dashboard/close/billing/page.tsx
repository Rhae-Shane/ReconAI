"use client";

import { useCallback, useEffect, useState } from "react";

import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Usage {
  orgName: string;
  orgId: string;
  period: string;
  plan: { id: string; name: string; includedCloses: number; includedRows: number; pricePaisePerMonth: number };
  closes: number;
  rows: number;
  gstFilings: number;
  journalPosts: number;
  overageCloses: number;
  overageRows: number;
}

function inr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export default function BillingPage() {
  const [usage, setUsage] = useState<Usage | null>(null);

  const load = useCallback(() => {
    fetch("/api/billing")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUsage)
      .catch(() => setUsage(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function switchPlan(planId: string) {
    const res = await fetch("/api/billing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId }),
    });
    if (!res.ok) {
      toast.error("Only an owner can change plan");
      return;
    }
    toast.success(`Plan set to ${planId}`);
    load();
  }

  const closePct = usage ? Math.min(100, (usage.closes / Math.max(1, usage.plan.includedCloses)) * 100) : 0;
  const rowPct = usage ? Math.min(100, (usage.rows / Math.max(1, usage.plan.includedRows)) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-3xl tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm">
          ReconAI usage for {usage?.orgName ?? "Rhae"} ({usage?.orgId ?? "rhae"}) · {usage?.period ?? "—"}.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">Plan</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <span className="text-xl">{usage?.plan.name ?? "—"}</span>
            <Badge variant="outline">{inr(usage?.plan.pricePaisePerMonth ?? 0)}/mo</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">Closes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl tabular-nums">
              {usage?.closes ?? 0} / {usage?.plan.includedCloses ?? 0}
            </p>
            <Progress value={closePct} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">Rows ingested</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl tabular-nums">
              {usage?.rows ?? 0} / {usage?.plan.includedRows ?? 0}
            </p>
            <Progress value={rowPct} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-normal text-muted-foreground">Filings / journals</CardTitle>
          </CardHeader>
          <CardContent className="text-xl tabular-nums">
            {usage?.gstFilings ?? 0} · {usage?.journalPosts ?? 0}
          </CardContent>
        </Card>
      </div>

      {usage?.overageCloses || usage?.overageRows ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Overage this month: {usage.overageCloses} closes, {usage.overageRows} rows.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Change plan</CardTitle>
          <CardDescription>Owner-only. Metering is per org; this demo tenant is Rhae.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(["starter", "growth", "scale"] as const).map((id) => (
            <Button key={id} size="sm" variant={usage?.plan.id === id ? "default" : "outline"} onClick={() => void switchPlan(id)}>
              {id}
            </Button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
