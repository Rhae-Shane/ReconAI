"use client";

import { createContext, type ReactNode, useContext } from "react";

import type { LandingContent } from "../types";

const LandingContext = createContext<LandingContent | null>(null);

export function LandingProvider({ content, children }: { content: LandingContent; children: ReactNode }) {
  return <LandingContext.Provider value={content}>{children}</LandingContext.Provider>;
}

export function useLanding() {
  const value = useContext(LandingContext);
  if (!value) {
    throw new Error("useLanding must be used inside LandingProvider");
  }
  return value;
}
