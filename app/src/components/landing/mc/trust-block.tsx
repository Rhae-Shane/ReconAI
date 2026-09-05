"use client";

import { useInView } from "@/components/landing/mc/lib/use-in-view";
import { useReducedMotion } from "@/components/landing/mc/lib/use-reduced-motion";

import { useLanding } from "../landing-context";

export function TrustBlock() {
  const content = useLanding();
  const { ref, isInView } = useInView<HTMLDivElement>({ threshold: 0.1 });
  const prefersReducedMotion = useReducedMotion();
  const shouldAnimate = isInView && !prefersReducedMotion;
  const items = content.marquee;

  return (
    <section ref={ref} className="relative z-20 px-4 pb-6 sm:px-6 sm:pt-24 sm:pb-8">
      <div className="flex flex-col items-center gap-3 gap-y-6 overflow-hidden">
        <div className="shrink-0 pr-4 pl-4 sm:pr-6 sm:pl-8">
          <p className="whitespace-nowrap text-[10px] text-foreground opacity-70 sm:text-lg">{content.badge}</p>
        </div>

        <div className="relative w-full overflow-hidden">
          <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 hidden w-12 bg-linear-to-r from-background to-transparent sm:w-20 md:block" />
          <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 hidden w-12 bg-linear-to-l from-background to-transparent sm:w-20 md:block" />

          <div
            className="flex py-2 will-change-transform sm:py-4"
            style={{
              animation: shouldAnimate ? "marquee 25s linear infinite" : "none",
            }}
          >
            <div className="flex shrink-0 gap-6 sm:gap-10">
              {items.map((item, index) => (
                <div
                  key={`first-${item}-${index}`}
                  className="flex shrink-0 items-center gap-2 px-3 text-foreground sm:px-5"
                >
                  <span className="size-1.5 rounded-full bg-accent/80" />
                  <span className="whitespace-nowrap font-medium text-xs sm:text-3xl">{item}</span>
                </div>
              ))}
            </div>
            <div className="ml-6 flex shrink-0 gap-6 sm:ml-10 sm:gap-10">
              {items.map((item, index) => (
                <div
                  key={`second-${item}-${index}`}
                  className="flex shrink-0 items-center gap-2 px-3 text-foreground sm:px-5"
                >
                  <span className="size-1.5 rounded-full bg-accent/80" />
                  <span className="whitespace-nowrap font-medium text-xs sm:text-3xl">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
