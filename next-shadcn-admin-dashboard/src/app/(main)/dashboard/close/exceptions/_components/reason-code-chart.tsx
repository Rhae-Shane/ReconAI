"use client";

import { useMemo } from "react";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ExceptionRecord } from "@/lib/close/types";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "hsl(var(--muted-foreground))",
];

const chartConfig = {
  count: { label: "Exceptions", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function ReasonCodeChart({ exceptions }: { exceptions: ExceptionRecord[] }) {
  const chartData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const exc of exceptions) {
      counts.set(exc.reasonCode, (counts.get(exc.reasonCode) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([reasonCode, count], i) => ({
        reasonCode,
        count,
        fill: COLORS[i % COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);
  }, [exceptions]);

  const pieConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    for (const row of chartData) {
      cfg[row.reasonCode] = { label: row.reasonCode, color: row.fill };
    }
    return cfg;
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-normal">Reason codes</CardTitle>
          <CardDescription>Distribution of exception volume by residual reason code.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No exceptions to chart yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="font-normal">Reason codes</CardTitle>
          <CardDescription>Volume by residual reason — the honest failure modes.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-56 w-full">
            <BarChart accessibilityLayer data={chartData} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="reasonCode"
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                fontSize={10}
                interval={0}
                angle={-18}
                textAnchor="end"
                height={52}
              />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tickMargin={6} width={28} />
              <ChartTooltip cursor={{ fill: "var(--border)" }} content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={6}>
                {chartData.map((d) => (
                  <Cell key={d.reasonCode} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="font-normal">Share</CardTitle>
          <CardDescription>Same codes as a mix.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={pieConfig} className="mx-auto aspect-square h-52">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="reasonCode" hideLabel />} />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="reasonCode"
                innerRadius={44}
                outerRadius={72}
                strokeWidth={2}
              >
                {chartData.map((d) => (
                  <Cell key={d.reasonCode} fill={d.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="reasonCode" />} />
            </PieChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  );
}
