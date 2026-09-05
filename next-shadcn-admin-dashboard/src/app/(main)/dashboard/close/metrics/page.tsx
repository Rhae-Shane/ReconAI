"use client";

import { useEffect, useMemo, useState } from "react";

import { AlertTriangle, Bot, ShieldCheck, Sparkles } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";

interface RunMetrics {
  runId: string;
  status: string;
  records: number;
  matched: number;
  deterministicResolved: number;
  aiResolved: number;
  exceptions: number;
  resolvedPct: number;
  deterministicResolvedPct: number;
  llmCallsAvoided: number;
}

interface WindowSummary {
  runs: number;
  records: number;
  matched: number;
  deterministicResolved: number;
  aiResolved: number;
  exceptions: number;
  llmCallsAvoided: number;
  resolvedPct: number;
  deterministicResolvedPct: number;
}

interface DashboardData {
  latest: RunMetrics | null;
  series: RunMetrics[];
  window: WindowSummary | null;
}

const DEMO_RUNS = ["demo_w1_mon", "demo_w1_wed", "demo_w2_mon", "demo_w2_fri"];

const trendConfig = {
  resolved: { label: "Resolved %", color: "var(--chart-2)" },
  deterministic: { label: "Deterministic %", color: "var(--chart-3)" },
} satisfies ChartConfig;

const volumeConfig = {
  matched: { label: "Matched", color: "var(--chart-2)" },
  exceptions: { label: "Exceptions", color: "var(--chart-1)" },
  ai: { label: "AI-judged", color: "var(--chart-5)" },
} satisfies ChartConfig;

const mixConfig = {
  deterministic: { label: "Deterministic", color: "var(--chart-3)" },
  ai: { label: "AI-judged", color: "var(--chart-5)" },
  exceptions: { label: "Exceptions", color: "var(--chart-1)" },
} satisfies ChartConfig;

const llmConfig = {
  avoided: { label: "LLM calls avoided", color: "var(--chart-4)" },
} satisfies ChartConfig;

const radialConfig = {
  score: { label: "Health", color: "var(--chart-2)" },
} satisfies ChartConfig;

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: typeof Sparkles;
  label: string;
  value: string;
  sub: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <Card className="gap-4 overflow-hidden rounded-none border-0 border-foreground/10 ring-0">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="size-4 text-muted-foreground" />
        <CardTitle className="font-normal text-muted-foreground text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <div className="space-y-1">
          <div className="text-2xl leading-none tracking-tight">{value}</div>
          <p className="text-muted-foreground text-xs">{sub}</p>
        </div>
        {tone === "good" && (
          <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">ok</Badge>
        )}
        {tone === "warn" && <Badge variant="destructive">needs review</Badge>}
      </CardContent>
    </Card>
  );
}

function shortRun(id: string) {
  return id.replace("demo_w", "W").replace("demo_", "").replace(/_/g, " ");
}

export default function MetricsPage() {
  const [data, setData] = useState<DashboardData>({ latest: null, series: [], window: null });
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [latestRes, seriesRes] = await Promise.all([
          fetch("/api/metrics").then((r) => r.json()),
          fetch(`/api/metrics?runs=${DEMO_RUNS.join(",")}`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        setData({
          latest: latestRes as RunMetrics,
          series: (seriesRes as { byRun: RunMetrics[] }).byRun,
          window: (seriesRes as { window: WindowSummary }).window,
        });
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const trendData = useMemo(
    () =>
      data.series.map((m) => ({
        run: shortRun(m.runId),
        resolved: +m.resolvedPct.toFixed(1),
        deterministic: +m.deterministicResolvedPct.toFixed(1),
      })),
    [data.series],
  );

  const volumeData = useMemo(
    () =>
      data.series.map((m) => ({
        run: shortRun(m.runId),
        matched: m.matched,
        exceptions: m.exceptions,
        ai: m.aiResolved,
      })),
    [data.series],
  );

  const llmData = useMemo(
    () =>
      data.series.map((m) => ({
        run: shortRun(m.runId),
        avoided: m.llmCallsAvoided,
      })),
    [data.series],
  );

  const mixData = useMemo(() => {
    const win = data.window;
    if (!win) return [];
    return [
      { key: "deterministic", name: "Deterministic", value: win.deterministicResolved, fill: "var(--color-deterministic)" },
      { key: "ai", name: "AI-judged", value: win.aiResolved, fill: "var(--color-ai)" },
      { key: "exceptions", name: "Exceptions", value: win.exceptions, fill: "var(--color-exceptions)" },
    ].filter((d) => d.value > 0);
  }, [data.window]);

  const latest = data.latest;
  const win = data.window;
  const busy = !error && !latest && !win;
  const healthScore = latest ? Math.min(100, Math.round(latest.resolvedPct)) : 0;
  const radialData = [{ name: "Health", score: healthScore, fill: "var(--color-score)" }];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex max-w-2xl flex-col gap-0.5">
          <h1 className="text-3xl tracking-tight">Analytics</h1>
          <p className="text-muted-foreground text-sm">
            Different views of the same close math — trends, mix, volume and LLM avoidance.
          </p>
        </div>
        <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">demo window</Badge>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {busy && <Skeleton className="m-4 h-24" />}
        {error && <div className="col-span-full p-6 text-muted-foreground text-sm">Could not load metrics.</div>}
        {!busy && !error && (
          <div className="grid grid-cols-2 gap-px bg-foreground/10 lg:grid-cols-4">
            <KpiTile
              icon={ShieldCheck}
              label="Resolved"
              value={latest ? `${latest.resolvedPct.toFixed(1)}%` : "—"}
              sub={latest ? `latest · ${shortRun(latest.runId)}` : "no data"}
              tone={latest && latest.resolvedPct >= 70 ? "good" : "warn"}
            />
            <KpiTile
              icon={Bot}
              label="Deterministic"
              value={latest ? `${latest.deterministicResolvedPct.toFixed(1)}%` : "—"}
              sub="resolved without an LLM call"
              tone={latest && latest.deterministicResolvedPct >= 50 ? "good" : "neutral"}
            />
            <KpiTile
              icon={Sparkles}
              label="LLM calls avoided"
              value={latest ? `${latest.llmCallsAvoided}` : "—"}
              sub={win ? `${win.llmCallsAvoided} across ${win.runs} runs` : "this run"}
              tone="good"
            />
            <KpiTile
              icon={AlertTriangle}
              label="Exceptions"
              value={latest ? `${latest.exceptions}` : "—"}
              sub={win ? `${win.exceptions} across window` : "this run"}
              tone={latest && latest.exceptions > 0 ? "warn" : "good"}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Area trend */}
        <Card className="xl:col-span-8">
          <CardHeader>
            <CardTitle className="font-normal">Resolved & deterministic trend</CardTitle>
            <CardDescription>Area series across demo close runs.</CardDescription>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <Skeleton className="h-64" />
            ) : (
              <ChartContainer config={trendConfig} className="h-64 w-full">
                <AreaChart accessibilityLayer data={trendData} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-resolved)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--color-resolved)" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="fillDet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-deterministic)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--color-deterministic)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="run" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
                  <YAxis
                    domain={[0, 100]}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    type="monotone"
                    dataKey="resolved"
                    stroke="var(--color-resolved)"
                    fill="url(#fillResolved)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="deterministic"
                    stroke="var(--color-deterministic)"
                    fill="url(#fillDet)"
                    strokeWidth={2}
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Radial health + pie mix */}
        <div className="flex flex-col gap-4 xl:col-span-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-normal">Close health</CardTitle>
              <CardDescription>Latest resolved % as a radial score.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center pb-4">
              {busy ? (
                <Skeleton className="h-40 w-40 rounded-full" />
              ) : (
                <ChartContainer config={radialConfig} className="mx-auto aspect-square h-44">
                  <RadialBarChart
                    data={radialData}
                    startAngle={90}
                    endAngle={-270}
                    innerRadius="68%"
                    outerRadius="100%"
                  >
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="score" background cornerRadius={8} />
                    <text
                      x="50%"
                      y="48%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground text-2xl font-semibold"
                    >
                      {healthScore}%
                    </text>
                    <text
                      x="50%"
                      y="62%"
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-muted-foreground text-[10px]"
                    >
                      resolved
                    </text>
                  </RadialBarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="font-normal">Window mix</CardTitle>
              <CardDescription>Deterministic vs AI vs exceptions.</CardDescription>
            </CardHeader>
            <CardContent>
              {mixData.length === 0 ? (
                <Skeleton className="h-40" />
              ) : (
                <ChartContainer config={mixConfig} className="mx-auto aspect-square h-44">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                    <Pie data={mixData} dataKey="value" nameKey="name" innerRadius={40} outerRadius={68} strokeWidth={2}>
                      {mixData.map((d) => (
                        <Cell key={d.key} fill={d.fill} />
                      ))}
                    </Pie>
                    <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  </PieChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Stacked volume */}
        <Card>
          <CardHeader>
            <CardTitle className="font-normal">Volume by run</CardTitle>
            <CardDescription>Matched stack vs exceptions and AI-judged residual.</CardDescription>
          </CardHeader>
          <CardContent>
            {volumeData.length === 0 ? (
              <Skeleton className="h-56" />
            ) : (
              <ChartContainer config={volumeConfig} className="h-56 w-full">
                <BarChart accessibilityLayer data={volumeData} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="run" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
                  <YAxis axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="matched" stackId="a" fill="var(--color-matched)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="ai" stackId="a" fill="var(--color-ai)" />
                  <Bar dataKey="exceptions" stackId="a" fill="var(--color-exceptions)" radius={[4, 4, 0, 0]} />
                  <ChartLegend content={<ChartLegendContent />} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Composed LLM line + bars */}
        <Card>
          <CardHeader>
            <CardTitle className="font-normal">LLM calls avoided</CardTitle>
            <CardDescription>Every deterministic match skips a model call.</CardDescription>
          </CardHeader>
          <CardContent>
            {llmData.length === 0 ? (
              <Skeleton className="h-56" />
            ) : (
              <ChartContainer config={llmConfig} className="h-56 w-full">
                <ComposedChart accessibilityLayer data={llmData} margin={{ top: 8, left: 8, right: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="run" axisLine={false} tickLine={false} tickMargin={8} fontSize={11} />
                  <YAxis axisLine={false} tickLine={false} width={36} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avoided" fill="var(--color-avoided)" radius={6} opacity={0.35} />
                  <Line
                    type="monotone"
                    dataKey="avoided"
                    stroke="var(--color-avoided)"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "var(--color-avoided)" }}
                  />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
