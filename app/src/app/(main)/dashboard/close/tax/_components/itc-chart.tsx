"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatPaiseCompact } from "@/lib/close/config";

const chartConfig = {
  amount: { label: "Amount", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function ItcChart({ eligiblePaise, shortfallPaise }: { eligiblePaise: number; shortfallPaise: number }) {
  const chartData = [
    { label: "Eligible ITC", amount: Math.round(eligiblePaise / 100) },
    { label: "ITC shortfall", amount: Math.round(shortfallPaise / 100) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">ITC posture</CardTitle>
        <CardDescription>Eligible claim vs missed shortfall from unmatched 2B invoices.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-48 w-full">
          <BarChart accessibilityLayer data={chartData} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              width={44}
              tickFormatter={(v: number) => formatPaiseCompact(Math.round(v * 100))}
            />
            <ChartTooltip cursor={{ fill: "var(--border)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
