"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { CloseRunMeta } from "@/lib/close/types";

const TARGET_RECORDS = 172;

export function RunProgress({ run }: { run: CloseRunMeta }) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => s + 1);
      router.refresh();
    }, 1500);
    return () => clearInterval(id);
  }, [router]);

  const progress = Math.min(100, (run.totals.records / TARGET_RECORDS) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-normal">
          <Loader2 className="size-4 animate-spin" />
          Running the close loop
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Ingesting 4 sources → reconciling → settling</span>
          <span className="tabular-nums">{seconds}s</span>
        </div>
        <Progress value={progress} />
        <p className="text-muted-foreground text-xs">
          {run.totals.records} of {TARGET_RECORDS} records processed · live KPIs will appear when the run finishes.
        </p>
      </CardContent>
    </Card>
  );
}
