"use client";

import { useEffect, useMemo, useState } from "react";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPaiseCompact } from "@/lib/close/config";

interface AgingBucket {
  bucket: string;
  count: number;
  amountPaise: number;
}

interface MetricsResponse {
  aging: AgingBucket[];
  payablesAging: AgingBucket[];
  dsoDpo: { dsoDays: number; dpoDays: number; cashConversionDays: number };
  derived: { receivablesSource: string; payablesSource: string };
}

const chartConfig = {
  ar: { label: "Receivables (AR)", color: "var(--chart-2)" },
  ap: { label: "Payables (AP)", color: "var(--chart-4)" },
} satisfies ChartConfig;

function fmtPaise(paise: number) {
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function fmtDays(days: number) {
  return `${days.toFixed(1)}d`;
}

function BucketTable({ title, rows }: { title: string; rows: AgingBucket[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket (days)</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((b) => (
              <TableRow key={b.bucket}>
                <TableCell className="font-medium">{b.bucket}</TableCell>
                <TableCell className="text-right">{b.count}</TableCell>
                <TableCell className="text-right">{fmtPaise(b.amountPaise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AgingBarChart({ ar, ap }: { ar: AgingBucket[]; ap: AgingBucket[] }) {
  const chartData = useMemo(() => {
    const buckets = Array.from(new Set([...ar.map((b) => b.bucket), ...ap.map((b) => b.bucket)]));
    const arMap = new Map(ar.map((b) => [b.bucket, b.amountPaise]));
    const apMap = new Map(ap.map((b) => [b.bucket, b.amountPaise]));
    return buckets.map((bucket) => ({
      bucket,
      ar: Math.round((arMap.get(bucket) ?? 0) / 100),
      ap: Math.round((apMap.get(bucket) ?? 0) / 100),
    }));
  }, [ar, ap]);

  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">Aging by bucket</CardTitle>
        <CardDescription>AR vs AP outstanding value across aging windows.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-52 w-full">
          <BarChart accessibilityLayer data={chartData} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="bucket" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={6}
              width={44}
              tickFormatter={(v: number) => formatPaiseCompact(Math.round(v * 100))}
            />
            <ChartTooltip cursor={{ fill: "var(--border)" }} content={<ChartTooltipContent />} />
            <Bar dataKey="ar" stackId="aging" fill="var(--color-ar)" radius={[0, 0, 0, 0]} />
            <Bar dataKey="ap" stackId="aging" fill="var(--color-ap)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

export function AgingMetrics() {
  const [data, setData] = useState<MetricsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/finance/metrics")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-sm">Aging / Receivables</h2>
        {data && data.derived.receivablesSource === "demo" && (
          <Badge variant="outline">demo receivables (no invoice rows)</Badge>
        )}
        {data && data.derived.payablesSource === "demo" && <Badge variant="outline">derived payables (demo)</Badge>}
      </div>

      {!data ? (
        <p className="text-muted-foreground text-sm">Loading finance metrics…</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "DSO", value: fmtDays(data.dsoDpo.dsoDays) },
              { label: "DPO", value: fmtDays(data.dsoDpo.dpoDays) },
              {
                label: "Cash conversion",
                value: `${fmtDays(data.dsoDpo.cashConversionDays)} ${data.dsoDpo.cashConversionDays < 0 ? "(negative)" : ""}`,
                neg: data.dsoDpo.cashConversionDays < 0,
              },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="py-3">
                  <p className="text-muted-foreground text-xs">{s.label}</p>
                  <p className="text-lg leading-tight tracking-tight">{s.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <AgingBarChart ar={data.aging} ap={data.payablesAging} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BucketTable title="Receivables outstanding" rows={data.aging} />
            <BucketTable title="Payables outstanding" rows={data.payablesAging} />
          </div>
        </>
      )}
    </div>
  );
}
