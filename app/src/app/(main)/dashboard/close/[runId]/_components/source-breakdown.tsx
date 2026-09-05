"use client";

import { useMemo } from "react";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { SourceStat } from "@/lib/close/types";

const chartConfig = {
  matchRate: {
    label: "Match rate",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function SourceBreakdown({ sources }: { sources: SourceStat[] }) {
  const data = useMemo(
    () =>
      sources.map((s) => ({
        source: s.source,
        sourceName: s.sourceName,
        records: s.records,
        matched: s.matched,
        matchRate: Math.round(s.matchRate * 1000) / 10, // 0–100, one decimal
      })),
    [sources],
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Per-source match rate</CardTitle>
        <CardDescription>Share of each source&apos;s records reconciled into a match group</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ChartContainer config={chartConfig} className="h-44 w-full">
          <BarChart
            accessibilityLayer
            layout="vertical"
            data={data}
            margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} />
            <YAxis
              dataKey="sourceName"
              type="category"
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              width={72}
            />
            <XAxis
              type="number"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(v) => `${v}%`}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const row = item?.payload as (typeof data)[number] | undefined;
                    const pct = typeof value === "number" ? value.toFixed(1) : value;
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium tabular-nums">{pct}%</span>
                        {row && (
                          <span className="text-muted-foreground tabular-nums">
                            {row.matched}/{row.records} matched
                          </span>
                        )}
                      </div>
                    );
                  }}
                />
              }
            />
            <Bar dataKey="matchRate" fill="var(--color-matchRate)" radius={4} barSize={18} />
          </BarChart>
        </ChartContainer>

        <ul className="flex flex-col gap-2">
          {data.map((s) => (
            <li key={s.source} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="size-2.5 rounded-sm bg-chart-3" aria-hidden />
                {s.sourceName}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {s.matched}/{s.records} · {s.matchRate.toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
