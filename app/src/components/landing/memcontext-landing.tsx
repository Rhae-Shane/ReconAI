"use client";

import { FAQ } from "./mc/faq";
import { Features } from "./mc/features";
import { FinalCTA } from "./mc/final-cta";
import { Footer } from "./mc/footer";
import { Header } from "./mc/header";
import { Hero } from "./mc/hero";
import { HowItWorks } from "./mc/how-it-works";
import { LaunchVideo } from "./mc/launch-video";
import { MemoryPipeline } from "./mc/memory-pipeline";
import { UseCases } from "./mc/use-cases";
import { LandingProvider } from "./landing-context";
import type { LandingContent } from "./types";

export function MemcontextLanding({ content }: { content: LandingContent }) {
  return (
    <LandingProvider content={content}>
      <Header />
      <main className="overflow-hidden">
        <Hero />
        <Features />
        <MemoryPipeline />
        <HowItWorks />
        <UseCases />
        <LaunchVideo />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </LandingProvider>
  );
}
