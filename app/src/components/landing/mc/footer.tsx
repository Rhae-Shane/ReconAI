"use client";

import Image from "next/image";
import Link from "next/link";

import { BsGithub, BsLinkedin } from "react-icons/bs";

import { useLanding } from "../landing-context";
import { SITE } from "../site";

const XIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export function Footer() {
  const content = useLanding();
  return (
    <footer className="relative overflow-hidden px-3 pt-16 pb-0 sm:pt-20">
      {/* Top border line - fades from center */}
      <div className="absolute top-0 right-0 left-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
        {/* Main footer content */}
        <div className="flex flex-col items-start justify-between gap-8 pb-16 sm:flex-row sm:gap-12 sm:pb-20">
          {/* Left side - Logo, description, and links */}
          <div className="max-w-md flex-1">
            {/* Logo - matching header style */}
            <Link href="/" className="group inline-flex items-center gap-2">
              <div className="relative">
                {/* Border glow spots */}
                <div
                  className="absolute -top-[0.5px] -left-[0.5px] h-6 w-6 rounded-lg blur-[0.5px]"
                  style={{
                    background:
                      "radial-gradient(ellipse at top left, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.4) 30%, transparent 60%)",
                  }}
                />

                {/* Glass container */}
                <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-surface/80 backdrop-blur-sm transition-all group-hover:opacity-80">
                  {/* Inner glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                  <Image src="/sign.png" alt="" width={20} height={20} className="relative z-10 h-5 w-5" />
                </div>
              </div>
              <span className="font-semibold text-lg transition-opacity group-hover:opacity-80">{content.name}</span>
            </Link>

            <p className="mt-4 text-foreground-muted text-sm leading-relaxed">{content.footerBlurb}</p>

            {/* Copyright and credit */}
            <div className="mt-4 flex flex-col gap-1">
              {/* <p className="text-xs text-foreground-subtle">
                  © {new Date().getFullYear()} {content.name}. All rights reserved.
                </p> */}
              <p className="text-foreground-subtle text-xs">
                Crafted by{" "}
                <a
                  href={SITE.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground-muted transition-colors hover:text-foreground"
                >
                  {SITE.author}
                </a>
              </p>
            </div>
          </div>

          {/* Right side - Navigation and Social */}
          <div className="flex gap-12 sm:gap-16">
            {/* Product links */}
            <div>
              <h3 className="mb-4 font-semibold text-foreground text-sm">Product</h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/#features"
                    className="text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    Features
                  </Link>
                </li>
                <li>
                  <Link
                    href="/#how-it-works"
                    className="text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    How it Works
                  </Link>
                </li>
                <li>
                  <Link
                    href={content.loginHref}
                    className="text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    Login
                  </Link>
                </li>
                <li>
                  <Link href="/#faq" className="text-foreground-muted text-sm transition-colors hover:text-foreground">
                    FAQ
                  </Link>
                </li>
                <li>
                  <a
                    href="/#features"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    Docs
                  </a>
                </li>
              </ul>
            </div>

            {/* Connect links */}
            <div>
              <h3 className="mb-4 font-semibold text-foreground text-sm">Connect</h3>
              <ul className="space-y-3">
                <li>
                  <a
                    href={SITE.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    Website
                  </a>
                </li>
                <li>
                  <a
                    href={SITE.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    <BsLinkedin className="h-3.5 w-3.5" />
                    LinkedIn
                  </a>
                </li>
                <li>
                  <a
                    href={SITE.x}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    <XIcon className="h-3.5 w-3.5" />X
                  </a>
                </li>
                <li>
                  <a
                    href={SITE.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-foreground-muted text-sm transition-colors hover:text-foreground"
                  >
                    <BsGithub className="h-3.5 w-3.5" />
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Large product name at bottom */}
      <div className="relative h-16 overflow-hidden sm:h-22 md:h-28 lg:h-36">
        {/* Large text - positioned to show top portion, cut off at bottom */}
        <h2
          className="absolute top-0 left-1/2 -translate-x-1/2 select-none whitespace-nowrap font-bold font-display text-[4.5rem] leading-[0.85] tracking-tighter sm:text-[6rem] md:text-[7rem] lg:text-[10rem] xl:text-[13rem]"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0.015) 70%, transparent 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {content.name}
        </h2>
      </div>
    </footer>
  );
}
