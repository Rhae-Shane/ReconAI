"use client";

import type { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Hover hint for close KPI labels — short plain-language “what this does”. */
export function KpiHint({
  hint,
  children,
  className,
}: {
  hint: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex cursor-help decoration-muted-foreground/40 underline decoration-dotted underline-offset-4",
              className,
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-left leading-snug">
          {hint}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
