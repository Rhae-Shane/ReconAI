"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  Copy,
  Check,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

import { FEATURE_VISUALS } from "./feature-visuals";
import { HeroShader } from "./hero-shader";
import type { LandingContent } from "./types";

const NAV = [
  { name: "Features", href: "#features" },
  { name: "How it Works", href: "#how-it-works" },
  { name: "FAQ", href: "#faq" },
];

function CoralLogin({ href, className = "" }: { href: string; className?: string }) {
  return (
    <Link href={href} className={`mc-btn-coral relative px-5 py-2.5 text-sm ${className}`}>
      <span className="relative z-10 font-display">Login</span>
      <ArrowRight className="relative z-10 size-4" />
    </Link>
  );
}

function Badge({ children }: { children: string }) {
  return (
    <div className="relative inline-flex">
      <div
        className="absolute -inset-0.5 rounded-full"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 35%, rgba(232,97,60,0.15) 65%, rgba(255,255,255,0.12) 100%)",
          padding: 1,
        }}
      />
      <div className="mc-badge relative">
        <span
          className="flex size-7 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(145deg, #2a2a2a 0%, #151515 55%, #0a0a0a 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          <span className="size-1.5 rounded-full bg-[#e8613c]" />
        </span>
        <span className="text-xs font-medium tracking-tight sm:text-sm">{children}</span>
      </div>
    </div>
  );
}

function Corner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 text-white/35 ${className ?? ""}`} fill="none" aria-hidden>
      <path d="M14 2H4a2 2 0 0 0-2 2v10" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function FolderCard({
  title,
  description,
  index,
  children,
}: {
  title: string;
  description: string;
  index: number;
  children: ReactNode;
}) {
  const gid = `folder${index}`;
  return (
    <div className="group relative">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a]/40">
        <div className="pointer-events-none absolute inset-2 rounded-xl border border-white/10 bg-[#0a0a0a]/80">
          <Corner className="absolute top-2 left-2" />
          <Corner className="absolute top-2 right-2 rotate-90" />
          <Corner className="absolute right-2 bottom-2 rotate-180" />
          <Corner className="absolute bottom-2 left-2 -rotate-90" />
        </div>
        <div className="relative flex h-full items-center justify-center p-6">{children}</div>
      </div>
      <div className="relative -mt-4">
        <svg viewBox="0 0 300 120" fill="none" preserveAspectRatio="none" className="relative z-10 h-auto w-full drop-shadow-[0_8px_24px_rgba(232,97,60,0.3)]">
          <defs>
            <linearGradient id={`${gid}g`} x1="0" y1="0" x2="300" y2="120" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#E8613C" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#C94E2E" stopOpacity="0.75" />
            </linearGradient>
            <radialGradient id={`${gid}s`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(30 10) scale(100 80)">
              <stop offset="0%" stopColor="white" stopOpacity="0.3" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </radialGradient>
          </defs>
          <path
            d="M0 12 C0 6 4 2 10 2 H80 Q90 2 94 8 L100 16 Q104 22 114 22 H290 C295.5 22 300 26.5 300 32 V112 C300 116.4 296.4 120 292 120 H8 C3.6 120 0 116.4 0 112 V12Z"
            fill={`url(#${gid}g)`}
          />
          <path
            d="M0 12 C0 6 4 2 10 2 H80 Q90 2 94 8 L100 16 Q104 22 114 22 H290 C295.5 22 300 26.5 300 32 V112 C300 116.4 296.4 120 292 120 H8 C3.6 120 0 116.4 0 112 V12Z"
            fill={`url(#${gid}s)`}
          />
        </svg>
        <div className="absolute inset-0 z-20 flex flex-col justify-center px-4 pt-8 pb-4">
          <h3 className="mb-1 text-base font-semibold text-white sm:text-xl">{title}</h3>
          <p className="text-sm leading-tight text-white/70">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ content }: { content: LandingContent }) {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(content.snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <header
        className={`fixed top-0 right-0 left-0 z-50 mx-2 transition-all duration-500 ${scrolled ? "py-3" : "py-2"}`}
      >
        <nav
          className={`mx-auto max-w-5xl rounded-xl border px-4 transition-all duration-500 sm:px-6 ${
            scrolled
              ? "mx-4 border-[#1f1f1f] bg-[#111]/90 shadow-lg backdrop-blur-md sm:mx-6 lg:mx-auto"
              : "border-transparent bg-transparent"
          }`}
        >
          <div className={`flex items-center justify-between ${scrolled ? "h-12" : "h-14"}`}>
            <Link href="/" className="flex items-center gap-2">
              <div
                className="relative flex size-8 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[#111]/80"
                style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}
              >
                <ShieldCheck className="size-4 text-[#e8613c]" />
              </div>
              <span className="text-lg font-semibold">{content.name}</span>
            </Link>
            <div className="hidden items-center gap-8 md:flex">
              {NAV.map((item) => (
                <a key={item.name} href={item.href} className="mc-muted text-sm transition-colors hover:text-white">
                  {item.name}
                </a>
              ))}
            </div>
            <div className="hidden md:block">
              <CoralLogin href={content.loginHref} className="px-4 py-1.5" />
            </div>
            <button type="button" className="p-2 md:hidden" onClick={() => setMenu((v) => !v)} aria-label="Menu">
              {menu ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
          {menu && (
            <div className="space-y-1 border-t border-white/10 py-3 md:hidden">
              {NAV.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  onClick={() => setMenu(false)}
                  className="mc-muted block rounded-lg px-3 py-3 text-base hover:bg-white/5 hover:text-white"
                >
                  {item.name}
                </a>
              ))}
              <CoralLogin href={content.loginHref} className="mt-2 w-full py-3" />
            </div>
          )}
        </nav>
      </header>

      <main className="overflow-hidden">
        <section className="relative flex min-h-screen flex-col overflow-hidden pt-20 pb-8 sm:pt-24">
          <div className="pointer-events-none absolute inset-0">
            <HeroShader />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 left-0 z-[1] h-[20vh]"
            style={{
              background: "linear-gradient(to bottom, #0a0a0a 0%, #0a0a0a 25%, rgba(10,10,10,0) 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 bottom-0 left-0 z-[1] h-[35vh]"
            style={{
              background: "linear-gradient(to top, #0a0a0a 0%, #0a0a0a 30%, rgba(10,10,10,0) 100%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/4 bottom-56 hidden sm:block"
            style={{
              background: "radial-gradient(1200px 400px at 50% 60%, rgba(169,67,42,0.28), transparent 65%)",
            }}
          />

          <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6">
            <div className="text-center">
              <div className="mc-fade my-6 flex justify-center">
                <Badge>{content.badge}</Badge>
              </div>
              <h1 className="font-display mc-fade mc-delay-1 text-4xl leading-[1.1] font-bold tracking-tight sm:text-5xl lg:text-7xl">
                {content.headline}
                <br />
                <span className="mc-muted">{content.headlineMuted}</span>
              </h1>
              <p className="mc-fade mc-delay-2 mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
                {content.subhead}
              </p>
              <div className="mc-fade mc-delay-3 mt-8 flex justify-center gap-3">
                <a href="#features" className="mc-btn-glass px-6 py-3 text-sm font-display">
                  Features
                </a>
                <CoralLogin href={content.loginHref} className="px-6 py-3" />
              </div>
            </div>
          </div>

          <div className="mc-fade mc-delay-5 relative z-20 mt-16 overflow-hidden pb-8">
            <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-10 hidden w-20 bg-linear-to-r from-[#0a0a0a] to-transparent md:block" />
            <div className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 hidden w-20 bg-linear-to-l from-[#0a0a0a] to-transparent md:block" />
            <div className="mc-marquee flex w-max">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex shrink-0 gap-10 px-5">
                  {content.marquee.map((item) => (
                    <span key={`${dup}-${item}`} className="text-lg font-medium whitespace-nowrap text-white/70 sm:text-2xl">
                      {item}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mb-14 text-center">
              <div className="mb-6 flex justify-center">
                <Badge>How it helps</Badge>
              </div>
              <h2 className="font-display mb-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                {content.featuresTitle}
              </h2>
              <p className="mc-muted mx-auto max-w-2xl text-base sm:text-lg">{content.featuresSub}</p>
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {content.features.map((f, i) => (
                <FolderCard key={f.title} index={i} title={f.title} description={f.description}>
                  {FEATURE_VISUALS[i] ?? FEATURE_VISUALS[0]}
                </FolderCard>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto max-w-7xl">
            <div className="mb-16 text-center">
              <div className="mb-6 flex justify-center">
                <Badge>Setup</Badge>
              </div>
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                {content.howTitle}
              </h2>
              <p className="mc-muted mx-auto mt-5 max-w-2xl text-base sm:text-lg">{content.howSub}</p>
            </div>
            <div className="grid items-start gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
              <div>
                <div className="space-y-4">
                  {content.steps.map((step) => (
                    <div key={step.num} className="flex items-start gap-4">
                      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#e8613c]/20 bg-[#e8613c]/10 font-mono text-[11px] text-[#e8613c]">
                        {step.num}
                      </div>
                      <p className="text-sm leading-8 sm:text-base">
                        <span className="font-semibold">{step.title}</span>{" "}
                        <span className="mc-muted">{step.body}</span>
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-10">
                  <CoralLogin href={content.loginHref} className="px-6 py-3" />
                </div>
              </div>
              <div className="relative">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -inset-8 rounded-3xl opacity-40 blur-3xl"
                  style={{
                    background: "radial-gradient(ellipse at 70% 30%, rgba(232,97,60,0.18) 0%, transparent 60%)",
                  }}
                />
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111]/50 shadow-2xl backdrop-blur-md">
                  <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                    <span className="mc-subtle font-mono text-xs">{content.snippetFile}</span>
                    <button
                      type="button"
                      onClick={copy}
                      className="mc-subtle flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs hover:text-white"
                    >
                      {copied ? <Check className="size-3.5 text-[#e8613c]" /> : <Copy className="size-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="min-h-[260px] overflow-x-auto p-6 font-mono text-xs leading-relaxed sm:text-sm">
                    <code className="text-[#eadcc8]">{content.snippet}</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="px-4 py-20 sm:px-6 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:sticky lg:top-32 lg:col-span-4 lg:self-start">
              <div className="mb-6">
                <Badge>FAQ</Badge>
              </div>
              <h2 className="font-display mb-3 text-3xl font-bold tracking-tight lg:text-4xl">
                Frequently Asked
                <br />
                <span className="mc-muted">Questions</span>
              </h2>
              <p className="mc-muted mb-8 max-w-sm text-sm sm:text-base">Login when you are ready to run the console.</p>
              <CoralLogin href={content.loginHref} className="px-6 py-3" />
            </div>
            <div className="space-y-3 lg:col-span-8">
              {content.faqs.map((faq, i) => {
                const open = openFaq === i;
                return (
                  <div
                    key={faq.q}
                    className={`overflow-hidden rounded-2xl border transition-all ${
                      open ? "border-white/10 bg-[#111]/80" : "border-white/5 bg-[#111]/30 hover:border-white/10"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenFaq(open ? null : i)}
                      className="flex w-full items-center justify-between p-5 text-left sm:p-6"
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`flex size-8 items-center justify-center rounded-lg border font-mono text-sm ${
                            open
                              ? "border-white/10 bg-[#e8613c]/15 text-[#e8613c]"
                              : "border-white/10 bg-white/5 text-[#6b6b6b]"
                          }`}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className={`text-sm font-medium sm:text-base ${open ? "text-white" : "mc-muted"}`}>
                          {faq.q}
                        </span>
                      </div>
                      <ChevronDown className={`size-4 ${open ? "rotate-180 text-[#e8613c]" : "mc-subtle"}`} />
                    </button>
                    <div className={`grid transition-all ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                      <div className="overflow-hidden">
                        <p className="mc-muted px-5 pt-0 pb-5 pl-[4.5rem] text-sm leading-relaxed sm:px-6 sm:pb-6">
                          {faq.a}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-4 py-20 sm:px-6 sm:pt-16 sm:pb-28">
          <div className="relative mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#111]/40 p-8 backdrop-blur-md sm:p-12 lg:p-14">
              <h2 className="font-display mb-3 text-2xl font-bold tracking-tight sm:text-4xl">{content.ctaTitle}</h2>
              <p className="mc-muted mb-6 max-w-md text-sm sm:text-base">{content.ctaBody}</p>
              <CoralLogin href={content.loginHref} className="px-6 py-3" />
            </div>
          </div>
        </section>
      </main>

      <footer className="relative overflow-hidden px-4 pt-16 pb-0 sm:px-6 sm:pt-20">
        <div className="absolute top-0 right-0 left-0 h-px bg-linear-to-r from-transparent via-white/10 to-transparent" />
        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="flex flex-col items-start justify-between gap-8 pb-16 sm:flex-row sm:pb-20">
            <div className="max-w-md">
              <Link href="/" className="inline-flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg border border-white/10 bg-[#111]/80">
                  <ShieldCheck className="size-4 text-[#e8613c]" />
                </div>
                <span className="text-lg font-semibold">{content.name}</span>
              </Link>
              <p className="mc-muted mt-4 text-sm leading-relaxed">{content.footerBlurb}</p>
              <p className="mc-subtle mt-4 text-xs">Razorpay hackathon</p>
            </div>
            <div className="flex gap-16">
              <div>
                <h3 className="mb-4 text-sm font-semibold">Product</h3>
                <ul className="space-y-3">
                  {NAV.map((item) => (
                    <li key={item.name}>
                      <a href={item.href} className="mc-muted text-sm hover:text-white">
                        {item.name}
                      </a>
                    </li>
                  ))}
                  <li>
                    <Link href={content.loginHref} className="mc-muted text-sm hover:text-white">
                      Login
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
        <div className="relative h-16 overflow-hidden sm:h-24 lg:h-36">
          <h2
            className="font-display absolute top-0 left-1/2 -translate-x-1/2 text-[4.5rem] leading-[0.85] font-bold tracking-tighter whitespace-nowrap select-none sm:text-[6rem] lg:text-[10rem]"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 40%, transparent 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {content.name}
          </h2>
        </div>
      </footer>
    </>
  );
}
