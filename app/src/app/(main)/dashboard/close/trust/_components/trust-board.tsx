"use client";

import { useMemo } from "react";

import Link from "next/link";

import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  HandCoins,
  Scale,
  ShieldCheck,
  ShieldX,
  Sparkles,
} from "lucide-react";
import { Cell, Pie, PieChart } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { TrustSnapshot } from "@/lib/close/trust";

const outcomeConfig = {
  matched: { label: "Matched", color: "var(--chart-2)" },
  partial: { label: "Partial", color: "var(--chart-4)" },
  review: { label: "Human review", color: "var(--chart-1)" },
} satisfies ChartConfig;

const decisionConfig = {
  deterministic: { label: "Deterministic", color: "var(--chart-3)" },
  ai: { label: "AI", color: "var(--chart-5)" },
} satisfies ChartConfig;

function StatusBanner({ snap }: { snap: TrustSnapshot }) {
  if (snap.status === "NO_RUN") {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <FileSearch className="size-5 text-muted-foreground" />
            <div>
              <p className="font-medium">No completed close yet</p>
              <p className="text-muted-foreground text-sm">Start a run in the cockpit to populate the trust board.</p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/dashboard/close">Open cockpit</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (snap.status === "VERIFIED") {
    return (
      <Card className="border-green-700/30 bg-green-500/5 dark:border-green-300/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-6 text-green-700 dark:text-green-300" />
            <div>
              <p className="font-semibold text-green-800 tracking-wide dark:text-green-200">CLOSE VERIFIED ✓</p>
              <p className="text-muted-foreground text-sm">
                Zero open exceptions · financial invariants hold · silent drops = 0
                {snap.runId ? ` · ${snap.runId}` : ""}
              </p>
            </div>
          </div>
          <Badge className="bg-green-500/15 text-green-800 dark:text-green-200">Verified</Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-700/30 bg-amber-500/5 dark:border-amber-300/30">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
        <div className="flex items-center gap-3">
          <ShieldX className="size-6 text-amber-700 dark:text-amber-300" />
          <div>
            <p className="font-semibold text-amber-900 tracking-wide dark:text-amber-200">CLOSE STATUS · BLOCKED</p>
            <p className="text-muted-foreground text-sm">
              {snap.openExceptions} open exception{snap.openExceptions === 1 ? "" : "s"} need human review before
              sign-off.
            </p>
          </div>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link href="/dashboard/close/exceptions">Review exceptions</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function OutcomeRow({ ok, warn, label, value }: { ok?: boolean; warn?: boolean; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm">
        {warn ? (
          <AlertTriangle className="size-4 text-amber-600 dark:text-amber-300" />
        ) : ok ? (
          <CheckCircle2 className="size-4 text-green-700 dark:text-green-300" />
        ) : (
          <HandCoins className="size-4 text-muted-foreground" />
        )}
        {label}
      </span>
      <span className="font-medium text-lg tabular-nums leading-none">{value}</span>
    </div>
  );
}

export function TrustBoard({ snap }: { snap: TrustSnapshot }) {
  const outcomeData = useMemo(
    () =>
      [
        { key: "matched", name: "Matched", value: snap.matched, fill: "var(--color-matched)" },
        { key: "partial", name: "Partial", value: snap.partial, fill: "var(--color-partial)" },
        { key: "review", name: "Human review", value: snap.humanReview, fill: "var(--color-review)" },
      ].filter((d) => d.value > 0),
    [snap.matched, snap.partial, snap.humanReview],
  );

  const decisionData = useMemo(() => {
    const det = Math.max(0, Math.round(snap.deterministicPct * 10) / 10);
    const ai = Math.max(0, Math.round(snap.aiPct * 10) / 10);
    return [
      { key: "deterministic", name: "Deterministic", value: det || 0, fill: "var(--color-deterministic)" },
      { key: "ai", name: "AI", value: ai || 0, fill: "var(--color-ai)" },
    ].filter((d) => d.value > 0);
  }, [snap.deterministicPct, snap.aiPct]);

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner snap={snap} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-5">
          <CardHeader>
            <CardTitle className="font-normal">Outcome split</CardTitle>
            <CardDescription>
              {snap.records} records processed · {(snap.matchRate * 100).toFixed(1)}% match rate
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <ChartContainer config={outcomeConfig} className="mx-auto aspect-square h-44 w-full max-w-[11rem]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie
                  data={outcomeData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={68}
                  strokeWidth={2}
                >
                  {outcomeData.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-col justify-center gap-2">
              <OutcomeRow ok label="Matched" value={snap.matched} />
              <OutcomeRow ok label="Partial" value={snap.partial} />
              <OutcomeRow warn={snap.humanReview > 0} label="Human review" value={snap.humanReview} />
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="font-normal">Trust invariants</CardTitle>
            <CardDescription>What the close engine proves — not what it guesses.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InvariantTile
                icon={Scale}
                label="Financial invariants"
                value={snap.invariantsPassed ? "Passed" : "Failed"}
                tone={snap.invariantsPassed ? "good" : "bad"}
                hint="gross − fee − tax − refund + adj = settlement"
              />
              <InvariantTile
                icon={ShieldCheck}
                label="Deterministic decisions"
                value={`${snap.deterministicPct.toFixed(0)}%`}
                tone="good"
                hint="resolved without an LLM call"
              />
              <InvariantTile
                icon={Sparkles}
                label="AI decisions"
                value={`${snap.aiPct.toFixed(0)}%`}
                tone="neutral"
                hint="residual ambiguity only"
              />
              <InvariantTile
                icon={CheckCircle2}
                label="Silent drops"
                value={`${snap.silentDrops}`}
                tone="good"
                hint="honesty rule — never hide a row"
              />
              <InvariantTile
                icon={FileSearch}
                label="Audit events"
                value={`${snap.auditEvents}`}
                tone="neutral"
                hint="append-only provenance ledger"
              />
              <InvariantTile
                icon={snap.status === "VERIFIED" ? ShieldCheck : ShieldX}
                label="Close status"
                value={snap.status === "VERIFIED" ? "VERIFIED ✓" : snap.status === "BLOCKED" ? "BLOCKED" : "—"}
                tone={snap.status === "VERIFIED" ? "good" : snap.status === "BLOCKED" ? "warn" : "neutral"}
                hint={
                  snap.status === "VERIFIED" ? "all exceptions cleared" : `${snap.openExceptions} open · human gate`
                }
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {decisionData.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="font-normal">Decision mix</CardTitle>
              <CardDescription>Deterministic rules first — AI only on leftovers.</CardDescription>
            </div>
            <Badge variant="outline">
              {snap.deterministicPct.toFixed(0)}% / {snap.aiPct.toFixed(0)}%
            </Badge>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ChartContainer config={decisionConfig} className="mx-auto aspect-square h-36 w-full max-w-[9rem]">
              <PieChart>
                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                <Pie data={decisionData} dataKey="value" nameKey="name" innerRadius={36} outerRadius={56}>
                  {decisionData.map((d) => (
                    <Cell key={d.key} fill={d.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-1 flex-col gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-chart-3" />
                  Deterministic
                </span>
                <span className="font-medium tabular-nums">{snap.deterministicPct.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-chart-5" />
                  AI residual
                </span>
                <span className="font-medium tabular-nums">{snap.aiPct.toFixed(1)}%</span>
              </div>
              <p className="text-muted-foreground text-xs">
                Silent drops stay at <span className="font-medium tabular-nums">0</span>. Anything below the resolve
                threshold is filed to Exceptions — never guessed away.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InvariantTile({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: typeof Scale;
  label: string;
  value: string;
  hint: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  return (
    <div className="rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p
        className={
          tone === "good"
            ? "mt-1.5 font-semibold text-green-800 text-xl leading-none tracking-tight dark:text-green-300"
            : tone === "warn"
              ? "mt-1.5 font-semibold text-amber-800 text-xl leading-none tracking-tight dark:text-amber-300"
              : tone === "bad"
                ? "mt-1.5 font-semibold text-red-700 text-xl leading-none tracking-tight dark:text-red-300"
                : "mt-1.5 font-semibold text-xl leading-none tracking-tight"
        }
      >
        {value}
      </p>
      <p className="mt-1.5 text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
