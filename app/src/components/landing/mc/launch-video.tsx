"use client";

import Image from "next/image";

import { useLanding } from "../landing-context";

export function LaunchVideo() {
  const content = useLanding();

  return (
    <section id="launch-video" className="px-4 py-20 sm:px-6 sm:py-28" aria-label={`${content.name} product preview`}>
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="mb-10 text-center sm:mb-14">
          <h2 className="mb-4 font-bold font-display text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
            {content.howTitle}
          </h2>
          <p className="mx-auto max-w-2xl text-base text-foreground-muted sm:text-lg">
            From login to a live run — see {content.name} on Razorpay test mode.
          </p>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute -top-px -left-px h-20 w-32 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 30%, transparent 70%)",
            }}
          />
          <div
            className="pointer-events-none absolute -right-px -bottom-px h-20 w-32 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 30%, transparent 70%)",
            }}
          />
          <div className="pointer-events-none absolute -inset-px rounded-2xl border border-white/[0.08]" />
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-surface/60 shadow-black/30 shadow-xl backdrop-blur-md">
            <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
              <Image
                src="/dashboard.png"
                alt={`${content.name} dashboard`}
                fill
                className="object-cover object-top"
                sizes="(max-width: 1280px) 100vw, 1024px"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
