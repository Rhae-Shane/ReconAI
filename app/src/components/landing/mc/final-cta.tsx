"use client";

import Image from "next/image";

import { ArrowRight } from "lucide-react";
import { BsGithub } from "react-icons/bs";

import { useLanding } from "../landing-context";
import { SITE } from "../site";

export function FinalCTA() {
  const content = useLanding();
  return (
    <section className="px-4 py-20 sm:px-6 sm:pt-16 md:pb-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Main CTA Card with Glass Effect */}
        <div className="relative">
          {/* Border glow - top left */}
          <div
            className="absolute -top-px -left-px h-24 w-40 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at top left, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 35%, transparent 65%)",
            }}
          />
          {/* Border glow - bottom right */}
          <div
            className="absolute -right-px -bottom-px h-24 w-40 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 35%, transparent 65%)",
            }}
          />

          {/* Main Card */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-surface/40 p-8 backdrop-blur-md sm:p-12 lg:p-14">
            {/* Noise/Grain texture overlay */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: 0.08,
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                mixBlendMode: "overlay",
              }}
            />
            {/* Inner glow overlay */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] via-transparent to-transparent" />

            <div className="relative z-10 flex flex-col items-center gap-8 lg:flex-row lg:gap-12">
              {/* Left side - Content & Form */}
              <div className="flex-1 text-center lg:text-left">
                {/* Shining logo */}
                <div className="mb-6 flex justify-center lg:justify-start">
                  <div className="relative">
                    {/* Border glow spot */}
                    <div
                      className="absolute -top-[0.5px] -left-[0.5px] h-8 w-8 rounded-xl blur-[0.5px]"
                      style={{
                        background:
                          "radial-gradient(ellipse at top left, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.4) 30%, transparent 60%)",
                      }}
                    />
                    {/* Glass container */}
                    <div className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-surface/80 backdrop-blur-sm sm:h-14 sm:w-14">
                      {/* Inner glow */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                      <Image
                        src="/sign.png"
                        alt=""
                        width={32}
                        height={32}
                        className="relative z-10 h-7 w-7 sm:h-8 sm:w-8"
                      />
                    </div>
                  </div>
                </div>

                <h2 className="mb-3 font-bold font-display text-2xl tracking-tight sm:text-3xl lg:text-4xl">
                  {content.ctaTitle}
                </h2>
                <p className="mx-auto mb-6 max-w-md text-foreground-muted text-sm sm:text-base lg:mx-0">
                  {content.ctaBody}
                </p>

                {/* CTA Buttons - side by side */}
                <div className="flex flex-col items-center gap-3 sm:flex-row lg:items-start">
                  {/* Star on GitHub */}
                  <a href={SITE.github} target="_blank" rel="noopener noreferrer" className="group relative">
                    <div className="absolute -inset-0.5 rounded-xl border border-white/8" />
                    <div className="relative flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-surface/60 px-5 py-3 backdrop-blur-sm transition-all group-hover:border-white/15 group-hover:bg-surface/80">
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.04] via-transparent to-transparent" />
                      <BsGithub className="relative z-10 h-4 w-4 text-foreground-muted transition-colors group-hover:text-foreground" />
                      <span className="relative z-10 font-display font-semibold text-foreground text-sm">GitHub</span>
                    </div>
                  </a>

                  {/* Login */}
                  <a href={content.loginHref} className="group relative inline-block">
                    <div
                      className="absolute -top-px -left-px h-6 w-12 rounded-xl opacity-80 blur-[0.5px] transition-opacity group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 40%, transparent 70%)",
                      }}
                    />
                    <div
                      className="relative flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl px-6 py-3 transition-all group-hover:scale-[1.02]"
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
                      <span className="relative z-10 font-display font-semibold text-sm text-white">Login</span>
                      <ArrowRight className="relative z-10 h-4 w-4 text-white transition-transform group-hover:translate-x-1" />
                    </div>
                  </a>
                </div>
              </div>

              {/* Right side - Large rotated logo in glass container */}
              <div className="relative hidden flex-shrink-0 items-center justify-center lg:flex">
                {/* Sparkle dots around the logo - positioned on right side */}
                <div className="pointer-events-none absolute top-[-6rem] right-[-4rem] h-96 w-96 xl:h-[28rem] xl:w-[28rem]">
                  {[
                    // Top edge sparkles
                    { x: 25, y: 8, opacity: 0.6, size: 4 },
                    { x: 45, y: 3, opacity: 0.5, size: 3 },
                    { x: 65, y: 6, opacity: 0.55, size: 4 },
                    { x: 80, y: 10, opacity: 0.45, size: 3 },
                    // Right edge sparkles
                    { x: 92, y: 20, opacity: 0.6, size: 4 },
                    { x: 95, y: 35, opacity: 0.5, size: 3 },
                    { x: 90, y: 50, opacity: 0.55, size: 4 },
                    { x: 93, y: 65, opacity: 0.45, size: 3 },
                    { x: 88, y: 80, opacity: 0.5, size: 3 },
                    // Bottom edge sparkles
                    { x: 75, y: 92, opacity: 0.5, size: 3 },
                    { x: 55, y: 95, opacity: 0.45, size: 3 },
                    { x: 35, y: 90, opacity: 0.4, size: 2 },
                    // Left edge sparkles
                    { x: 8, y: 25, opacity: 0.45, size: 3 },
                    { x: 5, y: 45, opacity: 0.4, size: 2 },
                    { x: 10, y: 70, opacity: 0.35, size: 2 },
                    // Scattered inner sparkles
                    { x: 30, y: 20, opacity: 0.35, size: 2 },
                    { x: 70, y: 25, opacity: 0.4, size: 3 },
                    { x: 20, y: 60, opacity: 0.3, size: 2 },
                    { x: 78, y: 55, opacity: 0.4, size: 3 },
                    { x: 60, y: 85, opacity: 0.35, size: 2 },
                    { x: 85, y: 40, opacity: 0.5, size: 3 },
                    { x: 15, y: 85, opacity: 0.3, size: 2 },
                    { x: 50, y: 15, opacity: 0.45, size: 3 },
                  ].map((dot, i) => (
                    <div
                      key={i}
                      className="absolute rounded-full bg-white"
                      style={{
                        left: `${dot.x}%`,
                        top: `${dot.y}%`,
                        width: `${dot.size}px`,
                        height: `${dot.size}px`,
                        opacity: dot.opacity,
                        boxShadow: `0 0 ${dot.size * 4}px ${dot.size * 1.5}px rgba(255, 255, 255, ${dot.opacity * 0.6})`,
                      }}
                    />
                  ))}
                </div>

                {/* Rotated glass container */}
                <div className="relative top-20 -right-6 rotate-[-12deg] scale-150">
                  {/* Glow behind container */}
                  <div
                    className="absolute -inset-8 opacity-30 blur-3xl"
                    style={{
                      background: "radial-gradient(circle, rgba(232,97,60,0.5) 0%, transparent 70%)",
                    }}
                  />
                  {/* Border glow spot - top left (longer) */}
                  <div
                    className="absolute -top-px -left-px h-28 w-32 rounded-2xl blur-[0.5px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at top left, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.45) 25%, rgba(255,255,255,0.15) 50%, transparent 70%)",
                    }}
                  />
                  {/* Border glow spot - bottom right (smaller) */}
                  <div
                    className="absolute -right-px -bottom-px h-12 w-14 rounded-2xl blur-[0.5px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 35%, transparent 65%)",
                    }}
                  />
                  {/* Glass container */}
                  <div className="relative flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-surface/80 backdrop-blur-sm xl:h-48 xl:w-48">
                    {/* Inner glow */}
                    <div className="absolute inset-0 bg-linear-to-br from-white/10 via-transparent to-transparent" />

                    <Image
                      src="/sign.png"
                      alt=""
                      width={160}
                      height={160}
                      className="relative z-10 h-28 w-28 xl:h-32 xl:w-32"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
