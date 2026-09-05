"use client";

import { useMemo } from "react";

import { format, parseISO } from "date-fns";
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatPaiseCompact } from "@/lib/close/config";
import type { ForecastDatum } from "@/lib/close/types";

const chartConfig = {
  balance: {
    label: "Projected balance",
    color: "var(--chart-3)",
  },
  confidencePct: {
    label: "Confidence %",
    color: "var(--chart-2)",
  },
  bandHigh: {
    label: "Confidence band",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function ForecastChart({ data, groundedRecords }: { data: ForecastDatum[]; groundedRecords: number }) {
  const points = useMemo(
    () =>
      data.map((d) => {
        const balance = +(d.balancePaise / 100).toFixed(0);
        const confidencePct = +(d.confidence * 100).toFixed(1);
        // Wider envelope when confidence is lower (max ±12% of |balance| at 0 confidence).
        const spread = Math.abs(balance) * (1 - d.confidence) * 0.12;
        return {
          date: d.date,
          label: format(parseISO(d.date), "EEE d MMM"),
          balance,
          confidencePct,
          bandHigh: +(balance + spread).toFixed(0),
        };
      }),
    [data],
  );

  const last = points[points.length - 1];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="font-normal">7-day projected cash balance</CardTitle>
          <CardDescription>
            {last
              ? `Ending at ${formatPaiseCompact(Math.round(last.balance * 100))} · confidence ${last.confidencePct.toFixed(0)}%`
              : "No data"}
          </CardDescription>
        </div>
        <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">
          grounded in {groundedRecords} matched records
        </Badge>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <ComposedChart accessibilityLayer data={points} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillBalance" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-balance)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-balance)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="fillBand" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--color-balance)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--color-balance)" stopOpacity={0.04} />
              </linearGradient>
              <linearGradient id="fillConfidence" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="var(--color-confidencePct)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--color-confidencePct)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
            <YAxis
              yAxisId="balance"
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              width={44}
              tickFormatter={(v: number) => formatPaiseCompact(Math.round(v * 100))}
            />
            <YAxis
              yAxisId="confidence"
              orientation="right"
              domain={[0, 100]}
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              width={36}
              fontSize={10}
              tickFormatter={(v: number) => `${v}%`}
            />
            <ChartTooltip
              cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
              content={<ChartTooltipContent indicator="line" />}
            />
            {/* Soft confidence envelope around balance */}
            <Area
              yAxisId="balance"
              type="monotone"
              dataKey="bandHigh"
              stroke="none"
              fill="url(#fillBand)"
              fillOpacity={1}
              legendType="none"
              tooltipType="none"
            />
            <Area
              yAxisId="balance"
              type="monotone"
              dataKey="balance"
              dot={false}
              fill="url(#fillBalance)"
              stroke="var(--color-balance)"
              strokeWidth={2}
              activeDot={{ r: 4 }}
            />
            <Area
              yAxisId="confidence"
              type="monotone"
              dataKey="confidencePct"
              stroke="none"
              fill="url(#fillConfidence)"
              fillOpacity={1}
              legendType="none"
            />
            <Line
              yAxisId="confidence"
              type="monotone"
              dataKey="confidencePct"
              stroke="var(--color-confidencePct)"
              strokeWidth={1.75}
              strokeDasharray="4 3"
              dot={false}
              activeDot={{ r: 3 }}
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
