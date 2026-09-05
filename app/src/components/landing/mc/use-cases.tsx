"use client";

import type { Icon } from "@phosphor-icons/react";
import { Cube, PenNib, SquaresFour } from "@phosphor-icons/react/dist/ssr";
import { ArrowRight } from "lucide-react";
import { GrTopCorner } from "react-icons/gr";

import { useLanding } from "../landing-context";

interface UseCaseProps {
  icon: Icon;
  title: string;
  description: string;
  examples: string[];
  cta: string;
  href: string;
}
function UseCaseCard({ useCase }: { useCase: UseCaseProps }) {
  return (
    <div className="group relative h-full">
      {/* Bracketed tile — holds all content including CTA */}
      <div className="relative h-full overflow-hidden rounded-xl border border-white/10 bg-border-hover/30">
        <div className="pointer-events-none absolute inset-0 m-2 rounded-xl border border-white/10 bg-background/80">
          <GrTopCorner className="absolute top-2 left-2 z-10 h-4 w-4 text-foreground-muted" />
          <GrTopCorner className="absolute top-2 right-2 z-10 h-4 w-4 rotate-90 text-foreground-muted" />
          <GrTopCorner className="absolute right-2 bottom-2 z-10 h-4 w-4 rotate-180 text-foreground-muted" />
          <GrTopCorner className="absolute bottom-2 left-2 z-10 h-4 w-4 -rotate-90 text-foreground-muted" />
        </div>

        <div className="relative flex h-full min-h-[340px] flex-col p-7 sm:p-8">
          <useCase.icon weight="duotone" className="mb-7 h-7 w-7 text-accent" />

          <h3 className="mb-2 font-semibold text-foreground text-lg">{useCase.title}</h3>

          <p className="mb-4 text-foreground-muted text-sm leading-relaxed">{useCase.description}</p>

          <div className="mb-6 flex-1 space-y-2">
            {useCase.examples.map((example) => (
              <div key={example} className="flex items-center gap-2 text-xs">
                <span className="h-1 w-1 shrink-0 rounded-full bg-accent/60" />
                <span className="text-foreground-subtle">{example}</span>
              </div>
            ))}
          </div>

          <a
            href={useCase.href}
            className="inline-flex w-fit items-center gap-1.5 font-medium text-accent text-sm transition-colors hover:text-accent/80"
          >
            {useCase.cta}
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

export function UseCases() {
  const content = useLanding();
  const cases = content.features.slice(0, 3).map((feature, i) => ({
    icon: [Cube, PenNib, SquaresFour][i] ?? Cube,
    title: feature.title,
    description: feature.description,
    examples: content.steps.map((s) => `${s.title}: ${s.body}`),
    cta: "Login",
    href: content.loginHref,
  }));

  return (
    <section className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
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
                <span className="relative z-10 font-medium text-foreground text-xs sm:text-sm">Use Cases</span>
              </div>
            </div>
          </div>

          <h2 className="mb-4 font-bold font-display text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-5xl">
            {content.featuresTitle}
          </h2>
          <p className="mx-auto max-w-2xl text-base text-foreground-muted sm:text-lg">{content.featuresSub}</p>
        </div>

        <div className="grid gap-6 sm:gap-8 md:grid-cols-3">
          {cases.map((useCase) => (
            <UseCaseCard key={useCase.title} useCase={useCase} />
          ))}
        </div>
      </div>
    </section>
  );
}
