"use client";

import { useMemo } from "react";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { MatchGroup, RunDetail } from "@/lib/close/types";

const chartConfig = {
  count: {
    label: "Groups",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function ConfidenceDistribution({ run }: { run: RunDetail }) {
  const data = useMemo(() => {
    const bins = [
      { bin: "0.95+", count: 0 },
      { bin: "0.80–0.94", count: 0 },
      { bin: "0.70–0.79", count: 0 },
      { bin: "<0.70", count: 0 },
    ];
    for (const g of run.groups) {
      if (g.confidence >= 0.95) bins[0].count += 1;
      else if (g.confidence >= 0.8) bins[1].count += 1;
      else if (g.confidence >= 0.7) bins[2].count += 1;
      else bins[3].count += 1;
    }
    return bins.filter((b) => b.bin !== "<0.70" || b.count > 0);
  }, [run.groups]);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Confidence distribution</CardTitle>
        <CardDescription>Resolved match groups by final confidence</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-44 w-full">
          <BarChart accessibilityLayer data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="bin" axisLine={false} tickLine={false} tickMargin={8} />
            <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
        <p className="mt-2 text-muted-foreground text-xs">
          Everything ≥ 0.70 is resolved in code; sub-threshold groups are surfaced as exceptions.
        </p>
      </CardContent>
    </Card>
  );
}

// Kept for callers that pass raw groups rather than a full RunDetail.
export function ConfidenceBinsChart({ groups }: { groups: MatchGroup[] }) {
  const run = { groups } as RunDetail;
  return <ConfidenceDistribution run={run} />;
}
