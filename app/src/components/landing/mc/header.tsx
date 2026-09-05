"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useLanding } from "../landing-context";

const navigation = [
  { name: "Features", href: "/#features" },
  { name: "How it Works", href: "/#how-it-works" },
  { name: "FAQ", href: "/#faq" },
];

function CoralCta({
  href,
  label,
  fullWidth,
}: {
  href: string;
  label: string;
  fullWidth?: boolean;
}) {
  return (
    <Link href={href} className={fullWidth ? "relative group block mt-3" : "relative group inline-block"}>
      {!fullWidth ? (
        <div
          className="absolute -top-px -left-px w-10 h-5 rounded-lg blur-[0.5px] opacity-80 group-hover:opacity-100 transition-opacity"
          style={{
            background:
              "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.25) 40%, transparent 70%)",
          }}
        />
      ) : null}
      <div
        className={
          fullWidth
            ? "relative w-full px-5 py-3 rounded-xl flex items-center justify-center gap-2 overflow-hidden"
            : "relative px-4 lg:px-5 py-1.5 lg:py-2 rounded-lg flex items-center justify-center gap-1.5 overflow-hidden transition-all group-hover:scale-[1.02] whitespace-nowrap"
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
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
          }}
        />
        <span
          className={`font-display font-semibold text-white relative z-10 ${fullWidth ? "text-base" : "text-sm lg:text-base"}`}
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
    <>
      <header
        className={`fixed top-0 mx-2 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? "py-3 sm:py-4" : "py-2 sm:py-3"
        }`}
      >
        <nav
          className={`mx-auto max-w-5xl px-4 sm:px-6 transition-all duration-500 border rounded-xl ${
            scrolled
              ? "bg-surface/90 backdrop-blur-md border-border shadow-lg mx-4 sm:mx-6 lg:mx-auto"
              : "border-transparent bg-transparent"
          }`}
        >
          <div
            className={`flex items-center justify-between transition-all duration-500 ${
              scrolled ? "h-12 sm:h-14 px-2 sm:px-4" : "h-14 sm:h-16"
            }`}
          >
            {/* Glass logo button */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="relative">
                {/* Border glow spots */}
                <div
                  className="absolute -top-[0.5px] -left-[0.5px] w-6 h-6 rounded-lg blur-[0.5px]"
                  style={{
                    background:
                      "radial-gradient(ellipse at top left, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.4) 30%, transparent 60%)",
                  }}
                />

                {/* Glass container */}
                <div className="relative w-8 h-8 sm:w-8 sm:h-8 rounded-lg bg-surface/80 backdrop-blur-sm border border-white/10 flex items-center justify-center overflow-hidden group-hover:opacity-80 transition-all">
                  {/* Inner glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
                  <Image
                    src="/sign.png"
                    alt=""
                    width={20}
                    height={20}
                    className="w-5 h-5 sm:w-5 sm:h-5 relative z-10"
                  />
                </div>
              </div>
              <span className="font-semibold text-lg group-hover:opacity-80 transition-opacity">
                {content.name}
              </span>
            </Link>
            <div className="hidden md:flex items-center gap-8 lg:gap-10">
              {navigation.map((item) =>
                "external" in item && item.external ? (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm lg:text-base text-foreground-muted hover:text-foreground transition-colors link-underline"
                  >
                    {item.name}
                  </a>
                ) : (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="text-sm lg:text-base text-foreground-muted hover:text-foreground transition-colors link-underline"
                  >
                    {item.name}
                  </Link>
                ),
              )}
            </div>

            <div className="hidden md:flex items-center gap-4 lg:gap-5">
              <CoralCta href={ctaHref} label={ctaLabel} />
            </div>

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-foreground-muted hover:text-foreground transition-colors"
            >
              <div className="relative w-6 h-6">
                <Menu
                  className={`w-6 h-6 absolute transition-all duration-200 ${isMobileMenuOpen ? "opacity-0 rotate-90" : "opacity-100 rotate-0"}`}
                />
                <X
                  className={`w-6 h-6 absolute transition-all duration-200 ${isMobileMenuOpen ? "opacity-100 rotate-0" : "opacity-0 -rotate-90"}`}
                />
              </div>
            </button>
          </div>

          {/* Mobile Menu */}
          <div
            className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${isMobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
          >
            <div
              className={`py-4 space-y-1 mt-2 rounded-xl bg-surface/95 backdrop-blur-md border border-border/50 px-2`}
            >
              {navigation.map((item, index) =>
                "external" in item && item.external ? (
                  <a
                    key={item.name}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block py-3 text-base text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-lg px-3 transition-all"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {item.name}
                  </a>
                ) : (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block py-3 text-base text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-lg px-3 transition-all"
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
    </>
  );
}
