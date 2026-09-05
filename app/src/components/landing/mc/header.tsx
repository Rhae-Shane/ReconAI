"use client";

import { useEffect, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Menu, X } from "lucide-react";

import { useLanding } from "../landing-context";

const navigation = [
  { name: "Features", href: "/#features" },
  { name: "How it Works", href: "/#how-it-works" },
  { name: "FAQ", href: "/#faq" },
];

function CoralCta({ href, label, fullWidth }: { href: string; label: string; fullWidth?: boolean }) {
  return (
    <Link href={href} className={fullWidth ? "group relative mt-3 block" : "group relative inline-block"}>
      {!fullWidth ? (
        <div
          className="absolute -top-px -left-px h-5 w-10 rounded-lg opacity-80 blur-[0.5px] transition-opacity group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 40%, transparent 70%)",
          }}
        />
      ) : null}
      <div
        className={
          fullWidth
            ? "relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl px-5 py-3"
            : "relative flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg px-4 py-1.5 transition-all group-hover:scale-[1.02] lg:px-5 lg:py-2"
        }
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
            background: "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
          }}
        />
        <span
          className={`relative z-10 font-display font-semibold text-white ${fullWidth ? "text-base" : "text-sm lg:text-base"}`}
        >
          {label}
        </span>
      </div>
    </Link>
  );
}

export function Header() {
  const content = useLanding();
  const pathname = usePathname();
  const isAuth = Boolean(pathname?.startsWith("/auth"));
  const ctaHref = isAuth ? "/" : content.loginHref;
  const ctaLabel = isAuth ? "Home" : "Login";
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 mx-2 transition-all duration-500 ${
        scrolled ? "py-3 sm:py-4" : "py-2 sm:py-3"
      }`}
    >
      <nav
        className={`mx-auto max-w-5xl rounded-xl border px-4 transition-all duration-500 sm:px-6 ${
          scrolled
            ? "mx-4 border-border bg-surface/90 shadow-lg backdrop-blur-md sm:mx-6 lg:mx-auto"
            : "border-transparent bg-transparent"
        }`}
      >
        <div
          className={`flex items-center justify-between transition-all duration-500 ${
            scrolled ? "h-12 px-2 sm:h-14 sm:px-4" : "h-14 sm:h-16"
          }`}
        >
          {/* Glass logo button */}
          <Link href="/" className="group flex items-center gap-2">
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
              <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-surface/80 backdrop-blur-sm transition-all group-hover:opacity-80 sm:h-8 sm:w-8">
                {/* Inner glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                <Image src="/sign.png" alt="" width={20} height={20} className="relative z-10 h-5 w-5 sm:h-5 sm:w-5" />
              </div>
            </div>
            <span className="font-semibold text-lg transition-opacity group-hover:opacity-80">{content.name}</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex lg:gap-10">
            {navigation.map((item) =>
              "external" in item && item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline text-foreground-muted text-sm transition-colors hover:text-foreground lg:text-base"
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  className="link-underline text-foreground-muted text-sm transition-colors hover:text-foreground lg:text-base"
                >
                  {item.name}
                </Link>
              ),
            )}
          </div>

          <div className="hidden items-center gap-4 md:flex lg:gap-5">
            <CoralCta href={ctaHref} label={ctaLabel} />
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-foreground-muted transition-colors hover:text-foreground md:hidden"
          >
            <div className="relative h-6 w-6">
              <Menu
                className={`absolute h-6 w-6 transition-all duration-200 ${isMobileMenuOpen ? "rotate-90 opacity-0" : "rotate-0 opacity-100"}`}
              />
              <X
                className={`absolute h-6 w-6 transition-all duration-200 ${isMobileMenuOpen ? "rotate-0 opacity-100" : "-rotate-90 opacity-0"}`}
              />
            </div>
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out md:hidden ${isMobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div className={`mt-2 space-y-1 rounded-xl border border-border/50 bg-surface/95 px-2 py-4 backdrop-blur-md`}>
            {navigation.map((item, index) =>
              "external" in item && item.external ? (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base text-foreground-muted transition-all hover:bg-surface-elevated hover:text-foreground"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {item.name}
                </a>
              ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base text-foreground-muted transition-all hover:bg-surface-elevated hover:text-foreground"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {item.name}
                </Link>
              ),
            )}
            <CoralCta href={ctaHref} label={ctaLabel} fullWidth />
          </div>
        </div>
      </nav>
    </header>
  );
}
