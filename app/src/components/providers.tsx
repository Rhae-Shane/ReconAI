"use client";

import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PREFERENCE_DEFAULTS, type PreferenceValueMap } from "@/lib/preferences/preferences-config";
import { PreferencesStoreProvider } from "@/stores/preferences/preferences-provider";

/**
 * Client-only shell for providers that touch react-dom APIs (e.g. flushSync via
 * Radix / Floating UI). Keeps them out of the RSC graph so Webpack does not
 * resolve `react-dom` under the `react-server` export condition (which omits flushSync).
 */
export function Providers({
  children,
  initialValues = PREFERENCE_DEFAULTS,
}: {
  children: ReactNode;
  initialValues?: PreferenceValueMap;
}) {
  return (
    <PreferencesStoreProvider initialValues={initialValues}>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </PreferencesStoreProvider>
  );
}
