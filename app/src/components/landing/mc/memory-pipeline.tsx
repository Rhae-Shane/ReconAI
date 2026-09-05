"use client";

import dynamic from "next/dynamic";

import { useLanding } from "../landing-context";
import { ClassificationChart } from "./classification-chart";

const NeuralGlobe = dynamic(() => import("./neural-globe").then((m) => m.NeuralGlobe), { ssr: false });

function FadedSubCard({
  className,
  children,
  fadeSide = "left",
}: {
  className?: string;
  children: React.ReactNode;
  /** Which vertical edge fades out completely (no border drawn there) */
  fadeSide?: "left" | "right";
}) {
  // Border mask — top + bottom hairlines stay solid, one vertical edge fades out
  const borderMask =
    fadeSide === "left"
      ? `linear-gradient(to left, black 0%, black 35%, transparent 100%)`
      : `linear-gradient(to right, black 0%, black 35%, transparent 100%)`;

  // Background — direct white-tint gradient (no mask) so it dissolves seamlessly into the page bg.
  // Asymmetric: peaks at the kept side, ramps down to fully transparent at the faded side.
  const bgGradient =
    fadeSide === "left"
      ? // Left card: brightest on the right, fades to transparent on the left
        `linear-gradient(to left,
          rgba(255,255,255,0.025) 0%,
          rgba(255,255,255,0.024) 15%,
          rgba(255,255,255,0.022) 30%,
          rgba(255,255,255,0.018) 45%,
          rgba(255,255,255,0.012) 60%,
          rgba(255,255,255,0.007) 75%,
          rgba(255,255,255,0.003) 88%,
          rgba(255,255,255,0) 100%
        )`
      : // Right card: brightest on the left, fades to transparent on the right
        `linear-gradient(to right,
          rgba(255,255,255,0.025) 0%,
          rgba(255,255,255,0.024) 15%,
          rgba(255,255,255,0.022) 30%,
          rgba(255,255,255,0.018) 45%,
          rgba(255,255,255,0.012) 60%,
          rgba(255,255,255,0.007) 75%,
          rgba(255,255,255,0.003) 88%,
          rgba(255,255,255,0) 100%
        )`;

  return (
    <div className={`relative overflow-hidden rounded-2xl ${className ?? ""}`}>
      {/* Background — gradient tint that dissolves seamlessly into the page bg */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: bgGradient }} />
      {/* Border — masked: kept side + top/bottom solid, faded side dissolves */}
      <div
        className="pointer-events-none absolute inset-0 z-30 rounded-2xl border border-white/10"
        style={{
          WebkitMaskImage: borderMask,
          maskImage: borderMask,
        }}
      />
      <div className="relative z-10 h-full w-full">{children}</div>
    </div>
  );
}

function SavePipelineCard() {
  const content = useLanding();
  return (
    <div className="absolute top-6 left-4 z-20 w-[calc(100%-2rem)] max-w-[360px] sm:top-16 sm:-left-6 sm:w-[340px]">
      <div className="relative rounded-xl border border-white/[0.08] bg-surface-elevated/95 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-sm">Control path</h3>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 font-bold font-mono text-[9px] text-emerald-400 uppercase tracking-wider">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-pulse-subtle rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
        </div>

        <p className="mb-4 font-mono text-[9px] text-foreground-subtle uppercase tracking-widest">Steps</p>

        {content.steps.map((step) => (
          <div key={step.num} className="mb-5 last:mb-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-mono text-[10px] text-foreground-subtle tracking-wider">{step.num}</span>
              <h4 className="font-semibold text-[13px] text-foreground">{step.title}</h4>
            </div>
            <p className="pl-6 text-[11px] text-foreground-muted leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemoryPipeline() {
  const content = useLanding();
  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Header — identical to original */}
        <div className="mb-12 text-center sm:mb-16">
          {/* Glowing badge pill — matches Features / Pricing / FAQ sections */}
          <div className="mb-6 flex justify-center">
            <div className="group relative">
              {/* Border glow spot - top left */}
              <div
                className="absolute -top-px -left-px h-9 w-16 rounded-full blur-[1px]"
                style={{
                  background:
                    "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 30%, transparent 70%)",
                }}
              />
              {/* Border glow spot - bottom right */}
              <div
                className="absolute -right-px -bottom-px h-9 w-16 rounded-full blur-[1px]"
                style={{
                  background:
                    "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 30%, transparent 70%)",
                }}
              />

              {/* Subtle border all around */}
              <div className="absolute -inset-0.5 rounded-full border border-white/10" />

              {/* Main container */}
              <div className="relative inline-flex items-center rounded-full bg-surface/95 px-4 py-2 backdrop-blur-sm">
                {/* Inner glow - top left */}
                <div className="absolute top-0 left-0 h-10 w-16 -translate-x-1/3 -translate-y-1/2 rounded-full bg-white/5 blur-xl" />
                {/* Inner glow - bottom right */}
                <div className="absolute right-0 bottom-0 h-10 w-16 translate-x-1/3 translate-y-1/2 rounded-full bg-white/5 blur-xl" />

                {/* Text */}
                <span className="relative z-10 font-medium text-foreground text-xs sm:text-sm">Under the Hood</span>
              </div>
            </div>
          </div>

          <h2 className="mb-4 font-bold font-display text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
            {content.howTitle}
          </h2>
          <p className="mx-auto max-w-2xl text-base text-foreground-muted sm:text-lg">{content.howSub}</p>
        </div>

        {/* Save Panel — top-fading border frame, no card fill */}
        <div className="relative mb-4 pt-6">
          {/* Top-only border that fades out on left and right */}
          <div
            className="pointer-events-none absolute top-0 right-0 left-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.12) 20%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 80%, transparent 100%)",
            }}
          />
          {/* Soft top vignette glow under the border */}
          <div
            className="pointer-events-none absolute top-0 left-1/2 h-24 w-3/4 -translate-x-1/2"
            style={{
              background: "radial-gradient(ellipse at top, rgba(255,255,255,0.04) 0%, transparent 70%)",
            }}
          />

          {/* Mobile: static card only */}
          <div className="relative z-10 block p-4 sm:hidden">
            <SavePipelineCardInline />
          </div>

          {/* Tablet (sm-lg): chart sub-card + overlay points card */}
          <div className="relative hidden sm:block lg:hidden">
            <FadedSubCard className="min-h-[460px]">
              <ClassificationChart />
            </FadedSubCard>
            <SavePipelineCard />
          </div>

          {/* Desktop: chart sub-card + globe sub-card side-by-side, points card overlays both */}
          <div className="relative hidden lg:block">
            <div className="grid grid-cols-12 gap-4">
              <FadedSubCard fadeSide="left" className="col-span-7 min-h-[460px]">
                <ClassificationChart />
              </FadedSubCard>
              <FadedSubCard fadeSide="right" className="col-span-5 flex min-h-[460px] items-center justify-center">
                <NeuralGlobe />
              </FadedSubCard>
            </div>
            {/* Points card floats absolutely over the chart card on the left */}
            <SavePipelineCard />
          </div>
        </div>

        {/* Search Pipeline — full bordered rectangle with bracket corners */}
        <div className="relative pb-6">
          <SearchCard />
          {/* Bottom hairline that fades on left and right — mirrors the top one above the Save panel */}
          <div
            className="pointer-events-none absolute right-0 bottom-0 left-0 h-px"
            style={{
              background:
                "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.12) 20%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 80%, transparent 100%)",
            }}
          />
          {/* Soft bottom vignette glow under the hairline */}
          <div
            className="pointer-events-none absolute bottom-0 left-1/2 h-24 w-3/4 -translate-x-1/2"
            style={{
              background: "radial-gradient(ellipse at bottom, rgba(255,255,255,0.04) 0%, transparent 70%)",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function SearchCard() {
  const content = useLanding();
  const searchSteps = content.features.slice(0, 3).map((feature) => ({
    title: feature.title,
    description: feature.description,
  }));
  // Border mask — keep tight, top/bottom hairlines stay anchored, sides fade out
  const borderMask = `linear-gradient(to right,
    transparent 0%,
    rgba(0,0,0,0.3) 12%,
    rgba(0,0,0,0.7) 22%,
    black 32%,
    black 68%,
    rgba(0,0,0,0.7) 78%,
    rgba(0,0,0,0.3) 88%,
    transparent 100%
  )`;

  // Background — use a faint white tint (not bg-surface) gradient directly. Because the page
  // bg is near-black and the tint is also near-black, an opacity ramp dissolves invisibly.
  // Two-sided cosine-shaped ramp via many small stops.
  const bgGradient = `linear-gradient(to right,
    rgba(255,255,255,0) 0%,
    rgba(255,255,255,0.003) 10%,
    rgba(255,255,255,0.008) 20%,
    rgba(255,255,255,0.015) 30%,
    rgba(255,255,255,0.022) 40%,
    rgba(255,255,255,0.025) 50%,
    rgba(255,255,255,0.022) 60%,
    rgba(255,255,255,0.015) 70%,
    rgba(255,255,255,0.008) 80%,
    rgba(255,255,255,0.003) 90%,
    rgba(255,255,255,0) 100%
  )`;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background fill — gradient tint that dissolves seamlessly */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl" style={{ background: bgGradient }} />
      {/* Border — top + bottom hairlines, left/right fade out */}
      <div
        className="pointer-events-none absolute inset-0 z-30 rounded-2xl border border-white/10"
        style={{
          WebkitMaskImage: borderMask,
          maskImage: borderMask,
        }}
      />

      <div className="relative z-10 p-6 sm:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-2">
          <h3 className="font-semibold text-foreground text-xl">Decision path</h3>
          <span className="font-mono text-foreground-subtle text-sm uppercase tracking-widest">
            · {content.featuresSub}
          </span>
        </div>

        {/* Steps */}
        <div className="space-y-5">
          {searchSteps.map((step, i) => (
            <div key={step.title}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[10px] text-foreground-subtle tracking-wider">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h4 className="font-semibold text-[13px] text-foreground">{step.title}</h4>
              </div>
              <p className="pl-6 text-[11px] text-foreground-muted leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SavePipelineCardInline() {
  const content = useLanding();
  return (
    <div className="relative">
      <div className="mb-5 flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">Control path</h3>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/15 px-2 py-0.5 font-bold font-mono text-[9px] text-emerald-400 uppercase tracking-wider">
          Live
        </span>
      </div>
      <p className="mb-4 font-mono text-[9px] text-foreground-subtle uppercase tracking-widest">Steps</p>
      {content.steps.map((step) => (
        <div key={step.num} className="mb-5 last:mb-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] text-foreground-subtle tracking-wider">{step.num}</span>
            <h4 className="font-semibold text-[13px] text-foreground">{step.title}</h4>
          </div>
          <p className="pl-6 text-[11px] text-foreground-muted leading-relaxed">{step.body}</p>
        </div>
      ))}
    </div>
  );
}
