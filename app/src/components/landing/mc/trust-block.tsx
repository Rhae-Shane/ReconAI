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
    <section
      ref={ref}
      className="pb-6 sm:pt-24 sm:pb-8 px-4 sm:px-6 relative z-20"
    >
      <div className="flex flex-col items-center gap-3 gap-y-6 overflow-hidden">
        <div className="shrink-0 pl-4 sm:pl-8 pr-4 sm:pr-6">
          <p className="text-[10px] sm:text-lg text-foreground opacity-70 whitespace-nowrap">
            {content.badge}
          </p>
        </div>

        <div className="relative w-full overflow-hidden">
          <div className="absolute hidden md:block left-0 top-0 bottom-0 w-12 sm:w-20 bg-linear-to-r from-background to-transparent z-10 pointer-events-none" />
          <div className="absolute hidden md:block right-0 top-0 bottom-0 w-12 sm:w-20 bg-linear-to-l from-background to-transparent z-10 pointer-events-none" />

          <div
            className="flex py-2 sm:py-4 will-change-transform"
            style={{
              animation: shouldAnimate ? "marquee 25s linear infinite" : "none",
            }}
          >
            <div className="flex shrink-0 gap-6 sm:gap-10">
              {items.map((item, index) => (
                <div
                  key={`first-${item}-${index}`}
                  className="flex items-center gap-2 text-foreground px-3 sm:px-5 shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-accent/80" />
                  <span className="text-xs sm:text-3xl font-medium whitespace-nowrap">
                    {item}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex shrink-0 gap-6 sm:gap-10 ml-6 sm:ml-10">
              {items.map((item, index) => (
                <div
                  key={`second-${item}-${index}`}
                  className="flex items-center gap-2 text-foreground px-3 sm:px-5 shrink-0"
                >
                  <span className="size-1.5 rounded-full bg-accent/80" />
                  <span className="text-xs sm:text-3xl font-medium whitespace-nowrap">
                    {item}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
