"use client";

import { useMemo } from "react";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { CloseRunMeta } from "@/lib/close/types";

const trendConfig = {
  resolvedPct: { label: "Resolved %", color: "var(--chart-2)" },
} satisfies ChartConfig;

const volumeConfig = {
  matched: { label: "Matched", color: "var(--chart-2)" },
  exceptions: { label: "Exceptions", color: "var(--chart-1)" },
} satisfies ChartConfig;

const mixConfig = {
  matched: { label: "Matched", color: "var(--chart-2)" },
  exceptions: { label: "Exceptions", color: "var(--chart-1)" },
} satisfies ChartConfig;

function shortRunId(id: string) {
  const cleaned = id.replace(/^demo_w/, "W").replace(/^demo_/, "").replace(/_/g, " ");
  return cleaned.length > 10 ? cleaned.slice(0, 9) + "…" : cleaned;
}

export function CockpitAnalytics({ runs }: { runs: CloseRunMeta[] }) {
  const done = useMemo(
    () =>
      runs
        .filter((r) => r.status === "DONE")
        .slice()
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()),
    [runs],
  );

  const trendData = useMemo(
    () =>
      done.map((r) => ({
        run: shortRunId(r.id),
        resolvedPct: +r.totals.resolvedPct.toFixed(1),
      })),
    [done],
  );

  const volumeData = useMemo(
    () =>
      done.map((r) => ({
        run: shortRunId(r.id),
        matched: r.totals.matched,
        exceptions: r.totals.exceptions,
      })),
    [done],
  );

  const mixData = useMemo(() => {
    const matched = done.reduce((sum, r) => sum + r.totals.matched, 0);
    const exceptions = done.reduce((sum, r) => sum + r.totals.exceptions, 0);
    return [
      { key: "matched", name: "Matched", value: matched, fill: "var(--color-matched)" },
      { key: "exceptions", name: "Exceptions", value: exceptions, fill: "var(--color-exceptions)" },
    ].filter((d) => d.value > 0);
  }, [done]);

  if (done.length < 1) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Close analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Complete at least one close run to see analytics.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Resolved trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trendConfig} className="h-36 w-full">
            <AreaChart accessibilityLayer data={trendData} margin={{ top: 4, left: 0, right: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="fillCockpitResolved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-resolvedPct)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-resolvedPct)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="run" axisLine={false} tickLine={false} tickMargin={6} fontSize={10} />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                width={28}
                fontSize={10}
                tickFormatter={(v: number) => `${v}`}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="resolvedPct"
                stroke="var(--color-resolvedPct)"
                fill="url(#fillCockpitResolved)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Match vs exceptions</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={volumeConfig} className="h-36 w-full">
            <BarChart accessibilityLayer data={volumeData} margin={{ top: 4, left: 0, right: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis dataKey="run" axisLine={false} tickLine={false} tickMargin={6} fontSize={10} />
              <YAxis axisLine={false} tickLine={false} width={28} fontSize={10} allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="matched" stackId="a" fill="var(--color-matched)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="exceptions" stackId="a" fill="var(--color-exceptions)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 xl:col-span-1">
        <CardHeader className="pb-2">
          <CardTitle className="font-normal text-muted-foreground text-sm">Outcome mix</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={mixConfig} className="mx-auto aspect-square h-36">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
              <Pie
                data={mixData}
                dataKey="value"
                nameKey="name"
                innerRadius={36}
                outerRadius={56}
                strokeWidth={2}
                paddingAngle={2}
              >
                {mixData.map((d) => (
                  <Cell key={d.key} fill={d.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
