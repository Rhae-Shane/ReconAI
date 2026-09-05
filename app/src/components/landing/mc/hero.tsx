"use client";

import { SparkleIcon } from "@phosphor-icons/react";
import { ArrowRight } from "lucide-react";

import { useLanding } from "../landing-context";
// import { HeroCards } from "./hero-cards"; // temporarily hidden — swapped for dashboard preview
// import { HeroDashboard } from "./hero-dashboard"; // temporarily hidden — swapped for memory tower
import { HeroMemoryTower } from "./hero-memory-tower";
import { HeroShader } from "./hero-shader";
import { TrustBlock } from "./trust-block";

export function Hero() {
  const content = useLanding();
  return (
    <section className="relative flex min-h-screen flex-col overflow-hidden pt-20 pb-8 sm:pt-24 sm:pb-12 lg:pt-24 lg:pb-16">
      {/* Atmospheric WebGL shader — rendered at full opacity, no mask.
          The shader fade is achieved by two solid bg-color gradient overlays
          below (top and bottom). They physically blend the shader into the
          page background instead of using opacity masks — eliminates Mach
          banding because there's no opacity transition for the eye to localize. */}
      <div className="pointer-events-none absolute inset-0">
        <HeroShader />
      </div>

      {/* Top fade — solid background blending into transparent over ~20vh */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 left-0 z-[1] h-[20vh]"
        style={{
          background: "linear-gradient(to bottom, var(--background) 0%, var(--background) 25%, rgba(10,10,10,0) 100%)",
        }}
      />

      {/* Bottom fade — solid background blending into transparent over ~35vh */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 left-0 z-[1] h-[35vh]"
        style={{
          background: "linear-gradient(to top, var(--background) 0%, var(--background) 30%, rgba(10,10,10,0) 100%)",
        }}
      />

      {/* Warm radial vignette — two variants:
          • Mobile: a smaller, tighter ellipse behind the copy block only, so
            the warm area doesn't engulf the viewport.
          • Desktop (sm+): the original wide 1200×400 glow bleeding into the
            surrounding content.
          Only one renders at a time via `block`/`hidden` tailwind toggles. */}
      {/* <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[20%] bottom-[50%] block sm:hidden"
        style={{
          background:
            "radial-gradient(600px 220px at 50% 55%, rgba(169,67,42,0.22), transparent 70%)",
        }}
      /> */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/4 bottom-56 hidden sm:block"
        style={{
          background: "radial-gradient(1200px 400px at 50% 60%, rgba(169,67,42,0.28), transparent 65%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          {/* Glowing badge — refined glass pill with gradient ring */}
          <div className="my-6 flex animate-fade-in justify-center opacity-0 sm:mb-4 md:mt-0">
            <div className="group relative">
              {/* Outer ambient glow — very soft, accent-tinted */}
              <div
                aria-hidden
                className="absolute -inset-4 rounded-full opacity-40 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
                style={{
                  background:
                    "radial-gradient(ellipse at center, rgba(232,97,60,0.25) 0%, rgba(255,255,255,0.04) 40%, transparent 70%)",
                }}
              />

              {/* Gradient ring — uses padding trick for a crisp 1px conic border */}
              <div
                className="relative rounded-full p-[1px]"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 35%, rgba(232,97,60,0.15) 65%, rgba(255,255,255,0.12) 100%)",
                }}
              >
                {/* Main pill */}
                <div
                  className="relative inline-flex cursor-default items-center gap-2 overflow-hidden rounded-full py-1 pr-3 pl-1 transition-all duration-300 sm:gap-2.5 sm:pr-4"
                  style={{
                    background: "linear-gradient(180deg, rgba(24,24,24,0.95) 0%, rgba(14,14,14,0.95) 100%)",
                    boxShadow: [
                      "inset 0 1px 0 rgba(255,255,255,0.06)",
                      "inset 0 -1px 0 rgba(0,0,0,0.4)",
                      "0 2px 8px rgba(0,0,0,0.4)",
                    ].join(", "),
                  }}
                >
                  {/* Top specular sheen */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                    }}
                  />

                  {/* Icon bubble — spherical with inner gradient + highlight */}
                  <div className="relative z-10 shrink-0">
                    {/* accent halo under the bubble */}
                    <div
                      aria-hidden
                      className="absolute inset-0 rounded-full opacity-70 blur-md"
                      style={{
                        background: "radial-gradient(circle at 30% 30%, rgba(232,97,60,0.35) 0%, transparent 70%)",
                      }}
                    />
                    <div
                      className="relative flex h-7 w-7 items-center justify-center rounded-full"
                      style={{
                        background: "linear-gradient(145deg, #2a2a2a 0%, #151515 55%, #0a0a0a 100%)",
                        boxShadow: [
                          "inset 0 1px 0 rgba(255,255,255,0.12)",
                          "inset 0 -1px 0 rgba(0,0,0,0.5)",
                          "0 1px 2px rgba(0,0,0,0.4)",
                        ].join(", "),
                      }}
                    >
                      {/* top-left highlight */}
                      <div
                        aria-hidden
                        className="absolute top-0 left-1/4 h-1.5 w-3 rounded-full blur-[2px]"
                        style={{
                          background: "radial-gradient(ellipse, rgba(255,255,255,0.35) 0%, transparent 70%)",
                        }}
                      />
                      {/* <Sparkles className="relative w-3.5 h-3.5 text-[#e8613c]" /> */}
                      <SparkleIcon size={14} weight="duotone" />
                    </div>
                  </div>

                  {/* Text */}
                  <span className="relative z-10 font-medium text-foreground/95 text-xs tracking-tight sm:text-sm">
                    {content.badge}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <h1 className="animation-delay-100 animate-fade-in font-bold font-display text-4xl leading-[1.1] tracking-tight opacity-0 sm:text-5xl lg:text-7xl">
            {content.headline}
            <br />
            <span className="text-foreground-muted">{content.headlineMuted}</span>
          </h1>

          <p className="animation-delay-200 mx-auto mt-5 max-w-2xl animate-fade-in text-foreground-muted/80 text-sm leading-relaxed opacity-0 sm:text-base">
            {content.subhead}
          </p>

          {/* CTA Buttons */}
          <div className="animation-delay-300 mt-6 flex animate-fade-in justify-center gap-3 opacity-0 sm:mt-8">
            {/* Docs Button - glass pill */}
            <a href="#features" className="group relative">
              <div className="absolute -inset-0.5 rounded-xl border border-white/8" />
              <div className="relative flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-surface/60 px-5 py-2.5 backdrop-blur-sm transition-all group-hover:border-white/15 group-hover:bg-surface/80 sm:px-6 sm:py-3">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.04] via-transparent to-transparent" />
                <span className="relative z-10 font-display font-semibold text-foreground text-sm sm:text-base">
                  Features
                </span>
              </div>
            </a>

            {/* Login Button */}
            <a href={content.loginHref} className="group relative inline-block">
              <div
                className="absolute -top-px -left-px h-6 w-12 rounded-xl opacity-80 blur-[0.5px] transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 40%, transparent 70%)",
                }}
              />
              <div
                className="relative flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl px-6 py-2.5 transition-all group-hover:scale-[1.02] sm:py-3"
                style={{
                  background: "linear-gradient(135deg, rgba(232, 97, 60, 0.9) 0%, rgba(201, 78, 46, 0.8) 100%)",
                }}
              >
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    background:
                      "radial-gradient(ellipse at top left, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)",
                  }}
                />
                <div
                  className="absolute top-0 right-0 left-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                  }}
                />
                <span className="relative z-10 font-display font-semibold text-sm text-white sm:text-base">Login</span>
                <ArrowRight className="relative z-10 h-4 w-4 text-white transition-transform group-hover:translate-x-1" />
              </div>
            </a>
          </div>
        </div>
      </div>

      {/* Product tower — isometric illustration of the control plane.
          Entrance choreography is handled inside HeroMemoryTower via motion,
          so no CSS fade wrapper here (stacking them caused a visible delay). */}
      <div className="relative z-10 mb-8 flex flex-1 items-center justify-center sm:mb-12">
        <HeroMemoryTower className="pointer-events-none relative w-[min(1100px,92%)]" />
      </div>

      {/* Trust Block - overlays hero cards */}
      <div className="animation-delay-500 relative z-30 animate-fade-in opacity-0">
        <TrustBlock />
      </div>
    </section>
  );
}
