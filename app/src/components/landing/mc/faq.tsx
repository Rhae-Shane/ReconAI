"use client";

import { useState } from "react";

import { ArrowRight, ChevronDown } from "lucide-react";
import { BsGithub } from "react-icons/bs";
import { FaXTwitter } from "react-icons/fa6";

import { useLanding } from "../landing-context";
import { SITE } from "../site";

export function FAQ() {
  const content = useLanding();
  const faqs = content.faqs;
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="px-4 py-20 sm:px-6 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16">
          {/* Left Side - Header & CTA */}
          <div className="lg:sticky lg:top-32 lg:col-span-4 lg:self-start">
            {/* Glowing badge pill */}
            <div className="mb-6 flex justify-start">
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
                  <span className="relative z-10 font-medium text-foreground text-xs sm:text-sm">FAQ</span>
                </div>
              </div>
            </div>

            {/* Heading */}
            <h2 className="mb-3 font-bold font-display text-3xl leading-[1.1] tracking-tight sm:text-4xl lg:text-4xl">
              Frequently Asked
              <br />
              <span className="text-foreground-muted">Questions</span>
            </h2>

            <p className="mb-8 max-w-sm text-foreground-muted text-sm sm:text-base">
              Login when you are ready to run the console.
            </p>

            {/* CTA Button - Glossy style */}
            <a href={content.loginHref} className="group relative mb-8 inline-block">
              <div
                className="absolute -top-px -left-px h-6 w-12 rounded-xl opacity-80 blur-[0.5px] transition-opacity group-hover:opacity-100"
                style={{
                  background:
                    "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 40%, transparent 70%)",
                }}
              />
              <div
                className="relative flex items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-xl px-6 py-3 transition-all group-hover:scale-[1.02]"
                style={{
                  background: "linear-gradient(135deg, rgba(232, 97, 60, 0.9) 0%, rgba(201, 78, 46, 0.8) 100%)",
                }}
              >
                <div
                  className="absolute inset-0 opacity-60"
                  style={{
                    background:
                      "radial-gradient(ellipse at top left, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.08) 40%, transparent 70%)",
                  }}
                />
                <div
                  className="absolute top-0 right-0 left-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                  }}
                />
                <span className="relative z-10 font-display font-semibold text-sm text-white">Login</span>
                <ArrowRight className="relative z-10 h-4 w-4 text-white transition-transform group-hover:translate-x-1" />
              </div>
            </a>

            {/* Support Links */}
            <div className="space-y-3">
              <p className="font-medium text-foreground-subtle text-xs uppercase tracking-wider">Need more help?</p>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                {/* Email Support Card */}
                <a href={SITE.website} target="_blank" rel="noopener noreferrer" className="group relative">
                  {/* Border glow - top left */}
                  <div
                    className="absolute -top-px -left-px h-10 w-14 rounded-xl blur-[1px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 35%, transparent 65%)",
                    }}
                  />
                  {/* Border glow - bottom right */}
                  <div
                    className="absolute -right-px -bottom-px h-10 w-14 rounded-xl blur-[1px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 35%, transparent 65%)",
                    }}
                  />
                  {/* Main card */}
                  <div className="relative flex items-center gap-3 rounded-xl border border-white/[0.08] bg-surface/60 px-3 py-2.5 backdrop-blur-md transition-all group-hover:border-white/15 group-hover:bg-surface/80">
                    {/* Inner glow overlay */}
                    <div className="absolute top-0 left-0 h-10 w-16 -translate-x-1/4 -translate-y-1/4 rounded-xl bg-white/[0.04] blur-xl" />
                    {/* Icon container with glass */}
                    <div className="relative">
                      <div
                        className="absolute -top-px -left-px h-6 w-6 rounded-lg blur-[0.5px]"
                        style={{
                          background:
                            "radial-gradient(ellipse at top left, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)",
                        }}
                      />
                      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-surface-elevated/90 backdrop-blur-sm">
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />
                        <BsGithub className="relative z-10 h-4 w-4 text-foreground-muted" />
                      </div>
                    </div>
                    <div className="relative z-10">
                      <p className="font-medium text-foreground text-sm transition-colors group-hover:text-white">
                        Website
                      </p>
                      <p className="text-[11px] text-foreground-subtle">
                        {SITE.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </p>
                    </div>
                  </div>
                </a>

                {/* Chat on X Card */}
                <a href={SITE.x} target="_blank" rel="noopener noreferrer" className="group relative">
                  {/* Border glow - top left */}
                  <div
                    className="absolute -top-px -left-px h-10 w-14 rounded-xl blur-[1px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 35%, transparent 65%)",
                    }}
                  />
                  {/* Border glow - bottom right */}
                  <div
                    className="absolute -right-px -bottom-px h-10 w-14 rounded-xl blur-[1px]"
                    style={{
                      background:
                        "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 35%, transparent 65%)",
                    }}
                  />
                  {/* Main card */}
                  <div className="relative flex items-center gap-3 rounded-xl border border-white/[0.08] bg-surface/60 px-3 py-2.5 backdrop-blur-md transition-all group-hover:border-white/15 group-hover:bg-surface/80">
                    {/* Inner glow overlay */}
                    <div className="absolute top-0 left-0 h-10 w-16 -translate-x-1/4 -translate-y-1/4 rounded-xl bg-white/[0.04] blur-xl" />
                    {/* Icon container with glass */}
                    <div className="relative">
                      <div
                        className="absolute -top-px -left-px h-6 w-6 rounded-lg blur-[0.5px]"
                        style={{
                          background:
                            "radial-gradient(ellipse at top left, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)",
                        }}
                      />
                      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-surface-elevated/90 backdrop-blur-sm">
                        <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />
                        <FaXTwitter className="relative z-10 h-4 w-4 text-foreground-muted" />
                      </div>
                    </div>
                    <div className="relative z-10">
                      <p className="font-medium text-foreground text-sm transition-colors group-hover:text-white">
                        Chat on X
                      </p>
                      <p className="text-[11px] text-foreground-subtle">{SITE.xHandle}</p>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </div>

          {/* Right Side - FAQ Accordion */}
          <div className="lg:col-span-8">
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className={`group overflow-hidden rounded-2xl border transition-all duration-300 ${
                    open === i
                      ? "border-white/10 bg-surface/80 shadow-black/20 shadow-lg"
                      : "border-white/5 bg-surface/30 hover:border-white/10 hover:bg-surface/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpen(open === i ? null : i)}
                    className={`flex w-full cursor-pointer items-center justify-between text-left ${
                      open === i ? "p-5 pb-2 sm:p-6 md:pb-2" : "p-5 sm:p-6"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Number indicator with glass border corner */}
                      <div className="relative">
                        {/* Border glow - top left only - softer */}
                        <div
                          className="absolute -top-px -left-px h-6 w-6 rounded-lg blur-[1px]"
                          style={{
                            background:
                              open === i
                                ? "radial-gradient(ellipse at top left, rgba(232,97,60,0.5) 0%, rgba(232,97,60,0.15) 40%, transparent 70%)"
                                : "radial-gradient(ellipse at top left, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.12) 40%, transparent 70%)",
                          }}
                        />
                        <div
                          className={`relative flex h-8 w-8 items-center justify-center rounded-lg border font-mono text-sm backdrop-blur-sm transition-all duration-300 ${
                            open === i
                              ? "border-white/10 bg-accent/15 text-accent"
                              : "border-white/10 bg-white/5 text-foreground-subtle"
                          }`}
                          style={{
                            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)",
                          }}
                        >
                          {/* Inner glow - softer */}
                          <div className="absolute inset-0 rounded-lg bg-linear-to-br from-white/[0.06] via-transparent to-transparent" />
                          <span className="relative z-10">{String(i + 1).padStart(2, "0")}</span>
                        </div>
                      </div>
                      <span
                        className={`font-medium text-sm transition-colors sm:text-base ${
                          open === i ? "text-foreground" : "text-foreground-muted group-hover:text-foreground"
                        }`}
                      >
                        {faq.q}
                      </span>
                    </div>
                    <div className="relative">
                      <div
                        className={`relative flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 ${
                          open === i ? "rotate-180" : ""
                        }`}
                      >
                        <ChevronDown
                          className={`h-4 w-4 transition-colors ${
                            open === i ? "text-accent" : "text-foreground-subtle"
                          }`}
                        />
                      </div>
                    </div>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ease-in-out ${
                      open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="px-5 pb-5 pl-[4.5rem] sm:px-6 sm:pb-6 sm:pl-[4.5rem]">
                        <p className="text-foreground-muted text-sm leading-relaxed sm:text-base">{faq.a}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom note */}
            {/* <div className="mt-8 p-5 rounded-2xl bg-gradient-to-r from-accent/5 via-accent/10 to-accent/5 border border-accent/10">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium mb-1">
                    Still have questions?
                  </p>
                  <p className="text-sm text-foreground-muted">
                    We&apos;re here to help. Reach out anytime and we&apos;ll
                    get back to you as soon as possible.
                  </p>
                </div>
              </div>
            </div> */}
          </div>
        </div>
      </div>
    </section>
  );
}
