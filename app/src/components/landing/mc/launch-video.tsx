"use client";

import Image from "next/image";
import { useLanding } from "../landing-context";

export function LaunchVideo() {
  const content = useLanding();

  return (
    <section
      id="launch-video"
      className="py-20 sm:py-28 px-4 sm:px-6"
      aria-label={`${content.name} product preview`}
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold mb-4 tracking-tight leading-[1.1]">
            {content.howTitle}
          </h2>
          <p className="text-base sm:text-lg text-foreground-muted max-w-2xl mx-auto">
            From login to a live run — see {content.name} on Razorpay test mode.
          </p>
        </div>

        <div className="relative">
          <div
            className="absolute -top-px -left-px w-32 h-20 rounded-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 30%, transparent 70%)",
            }}
          />
          <div
            className="absolute -bottom-px -right-px w-32 h-20 rounded-2xl pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 30%, transparent 70%)",
            }}
          />
          <div className="absolute -inset-px rounded-2xl border border-white/[0.08] pointer-events-none" />
          <div className="relative rounded-2xl bg-surface/60 backdrop-blur-md border border-white/[0.08] shadow-xl shadow-black/30 overflow-hidden">
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
