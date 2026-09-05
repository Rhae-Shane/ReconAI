"use client";

import { useEffect, useState } from "react";

import Image from "next/image";

import { Cursor } from "@lobehub/icons";
import { Save } from "lucide-react";
import { RiClaudeLine } from "react-icons/ri";
import { SiGooglegemini, SiOpenaigym } from "react-icons/si";

import { useInView } from "@/components/landing/mc/lib/use-in-view";
import { useReducedMotion } from "@/components/landing/mc/lib/use-reduced-motion";

import { useLanding } from "../landing-context";

// react-icons/si no longer exports SiOpenai.
const SiOpenai = SiOpenaigym;

// Pre-defined line styles to avoid Math.random during render
const CODE_LINE_STYLES = [
  { width: "85%", opacity: 0.6 },
  { width: "72%", opacity: 0.5 },
  { width: "90%", opacity: 0.7 },
  { width: "65%", opacity: 0.4 },
  { width: "78%", opacity: 0.55 },
  { width: "82%", opacity: 0.5 },
  { width: "68%", opacity: 0.45 },
];

// Pre-defined particle positions
const PARTICLE_POSITIONS = [
  { left: "15%", top: "20%", duration: "3s", delay: "0s" },
  { left: "30%", top: "45%", duration: "3.5s", delay: "0.3s" },
  { left: "45%", top: "20%", duration: "4s", delay: "0.6s" },
  { left: "60%", top: "45%", duration: "4.5s", delay: "0.9s" },
  { left: "75%", top: "20%", duration: "5s", delay: "1.2s" },
  { left: "90%", top: "45%", duration: "5.5s", delay: "1.5s" },
];

// Memory Card Component - VERTICAL/PORTRAIT shape (tall)
function MemoryCard({
  title,
  content,
  category,
  delay = 0,
  className = "",
}: {
  title: string;
  content: string;
  category: string;
  delay?: number;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const categoryColors: Record<string, string> = {
    preference: "bg-accent/20 text-accent border-accent/30",
    fact: "bg-info/20 text-info border-info/30",
    decision: "bg-success/20 text-success border-success/30",
    context: "bg-warning/20 text-warning border-warning/30",
  };

  return (
    <div
      className={`absolute transition-all duration-700 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Border glow - top left */}
      <div
        className="absolute -top-px -left-px h-16 w-20 rounded-xl blur-[0.5px]"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 30%, transparent 60%)",
        }}
      />
      {/* Border glow - bottom right */}
      <div
        className="absolute -right-px -bottom-px h-10 w-12 rounded-xl blur-[0.5px]"
        style={{
          background:
            "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)",
        }}
      />
      <div className="relative flex h-50 w-[150px] flex-col overflow-hidden rounded-xl border border-white/10 bg-surface p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] sm:h-[230px] sm:w-[170px] sm:p-4">
        {/* Inner glow overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />
        <div className="flex">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h4 className="font-medium text-foreground text-xs leading-tight sm:text-sm">{title}</h4>
            <span
              className={`rounded-full border px-1.5 py-0.5 font-mono text-[9px] ${categoryColors[category] || categoryColors.preference}
              `}
            >
              {category}
            </span>
          </div>
        </div>
        <p className="flex-1 text-[10px] text-foreground-muted leading-relaxed sm:text-xs">{content}</p>
        <div className="mt-auto flex items-center justify-between border-border/50 border-t pt-2">
          <span className="font-mono text-[8px] text-foreground-subtle">mem_01</span>
          <span className="text-[8px] text-foreground-subtle">now</span>
        </div>
      </div>
    </div>
  );
}

// File Card Component - VERTICAL/PORTRAIT shape (tall)
function FileCard({
  filename,
  lines,
  delay = 0,
  className = "",
}: {
  filename: string;
  lines: number;
  delay?: number;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const lineStyles = CODE_LINE_STYLES.slice(0, Math.min(lines, 7));

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`absolute transition-all duration-700 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Border glow - top left */}
      <div
        className="absolute -top-px -left-px h-16 w-20 rounded-xl blur-[0.5px]"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 30%, transparent 60%)",
        }}
      />
      {/* Border glow - bottom right */}
      <div
        className="absolute -right-px -bottom-px h-10 w-12 rounded-xl blur-[0.5px]"
        style={{
          background:
            "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)",
        }}
      />
      <div className="relative flex h-[190px] w-[140px] flex-col overflow-hidden rounded-xl border border-white/10 bg-surface-elevated shadow-[0_8px_32px_rgba(0,0,0,0.5)] sm:h-[220px] sm:w-[160px]">
        {/* Inner glow overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />
        <div className="flex items-center gap-2 border-border border-b bg-background/80 px-2.5 py-2">
          <div className="flex gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-error/60" />
            <div className="h-1.5 w-1.5 rounded-full bg-warning/60" />
            <div className="h-1.5 w-1.5 rounded-full bg-success/60" />
          </div>
          <span className="truncate font-mono text-[8px] text-foreground-muted">{filename}</span>
        </div>
        <div className="flex-1 space-y-1.5 p-2.5 font-mono text-[9px]">
          {lineStyles.map((style, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="w-2.5 select-none text-right text-foreground-subtle">{i + 1}</span>
              <div className="h-2.5 rounded bg-foreground/5" style={{ width: style.width, opacity: style.opacity }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Folder Component with proper SVG tab shape
function FolderCard({
  name,
  items,
  delay = 0,
  className = "",
}: {
  name: string;
  items: number;
  delay?: number;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`absolute transition-all duration-700 ease-out ${isVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-8 scale-95 opacity-0"}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Shiny Logo Container - positioned on top of folder */}
      <div className="absolute top-[60px] left-1/2 z-10 -translate-x-1/2 sm:top-[70px]">
        <div className="relative">
          {/* Border glow - top left */}
          <div
            className="absolute -top-[1px] -left-[1px] h-8 w-8 rounded-xl blur-[0.5px]"
            style={{
              background:
                "radial-gradient(ellipse at top left, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 30%, transparent 60%)",
            }}
          />
          {/* Border glow - bottom right */}
          <div
            className="absolute -right-[1px] -bottom-[1px] h-6 w-6 rounded-xl blur-[0.5px]"
            style={{
              background:
                "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 30%, transparent 60%)",
            }}
          />
          {/* Glass container with dark background */}
          <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-surface/95 backdrop-blur-sm sm:h-16 sm:w-16">
            {/* Inner glow */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />
            <Image src="/sign.png" alt="" width={40} height={40} className="relative z-10 h-8 w-8 sm:h-10 sm:w-10" />
          </div>
        </div>
      </div>
      <svg
        className="h-50 w-[280px] drop-shadow-[0_10px_30px_rgba(232,97,60,0.35)] sm:h-[240px] sm:w-[340px]"
        viewBox="0 0 340 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="folderGradient" x1="170" y1="28" x2="170" y2="228" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#E8613C" />
            <stop offset="100%" stopColor="#C94E2E" />
          </linearGradient>
          {/* Glass shine overlay on top-left */}
          <radialGradient
            id="folderGlowHero"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(40 20) scale(120 100)"
          >
            <stop offset="0%" stopColor="white" stopOpacity="0.3" />
            <stop offset="50%" stopColor="white" stopOpacity="0.1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
          {/* Top edge glow gradient - horizontal */}
          <linearGradient id="folderEdgeGlowHero" x1="16" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="white" stopOpacity="0.6" />
            <stop offset="40%" stopColor="white" stopOpacity="0.25" />
            <stop offset="100%" stopColor="white" stopOpacity="0.05" />
          </linearGradient>
          {/* Left edge glow gradient - vertical */}
          <linearGradient id="folderEdgeGlowLeftHero" x1="0" y1="20" x2="0" y2="228" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="white" stopOpacity="0.6" />
            <stop offset="40%" stopColor="white" stopOpacity="0.2" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Main folder shape - tab on top LEFT side
            Path: rounded top-left → horizontal (tab) → diagonal down → horizontal (main top) → rest of folder
        */}
        <path
          d="M16 20
             C16 14 20 10 26 10
             H100
             Q110 10 115 18
             L125 32
             Q130 40 140 40
             H308
             C316.837 40 324 47.163 324 56
             V212
             C324 220.837 316.837 228 308 228
             H32
             C23.163 228 16 220.837 16 212
             V20Z"
          fill="url(#folderGradient)"
        />

        {/* Glass glow overlay */}
        <path
          d="M16 20
             C16 14 20 10 26 10
             H100
             Q110 10 115 18
             L125 32
             Q130 40 140 40
             H308
             C316.837 40 324 47.163 324 56
             V212
             C324 220.837 316.837 228 308 228
             H32
             C23.163 228 16 220.837 16 212
             V20Z"
          fill="url(#folderGlowHero)"
        />

        {/* Top edge highlight with glow on left */}
        <path
          d="M16 20
             C16 14 20 10 26 10
             H100
             Q110 10 115 18
             L125 32
             Q130 40 140 40
             H308
             C316.837 40 324 47.163 324 56"
          stroke="url(#folderEdgeGlowHero)"
          strokeWidth="1.5"
          fill="none"
        />
        {/* Left edge highlight going down */}
        <path d="M16 20 V212" stroke="url(#folderEdgeGlowLeftHero)" strokeWidth="1.5" fill="none" />

        {/* Folder name */}
        <text
          x="170"
          y="160"
          textAnchor="middle"
          fill="white"
          fontSize="18"
          fontWeight="600"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {name}
        </text>

        {/* Item count */}
        <text
          x="170"
          y="185"
          textAnchor="middle"
          fill="white"
          fillOpacity="0.7"
          fontSize="13"
          fontFamily="system-ui, -apple-system, sans-serif"
        >
          {items} flows
        </text>
      </svg>
    </div>
  );
}

// Plane/Email Card Component - VERTICAL/PORTRAIT shape (tall)
function PlaneCard({ delay = 0, className = "" }: { delay?: number; className?: string }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      className={`absolute transition-all duration-700 ease-out ${isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Border glow - top left */}
      <div
        className="absolute -top-px -left-px h-12 w-16 rounded-xl blur-[0.5px]"
        style={{
          background:
            "radial-gradient(ellipse at top left, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.2) 30%, transparent 60%)",
        }}
      />
      {/* Border glow - bottom right */}
      <div
        className="absolute -right-px -bottom-px h-8 w-10 rounded-xl blur-[0.5px]"
        style={{
          background:
            "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.1) 30%, transparent 60%)",
        }}
      />
      <div className="relative flex h-[160px] w-[120px] flex-col overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-surface-elevated to-surface p-3 shadow-[0_8px_32px_rgba(0,0,0,0.5)] sm:h-[180px] sm:w-[140px]">
        {/* Inner glow overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.08] via-transparent to-transparent" />
        <div className="mb-1 flex items-center gap-2">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-accent/15 sm:h-7 sm:w-7">
            <Save className="h-4 w-4 text-accent sm:h-4 sm:w-4" />
          </div>
          <div className="">
            <p className="font-medium text-[10px] text-foreground sm:text-xs">Quick Save</p>
            <p className="mb-2 text-[8px] text-foreground-muted sm:text-[9px]">Instant sync</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded bg-foreground/5" />
          <div className="h-1.5 w-3/4 rounded bg-foreground/5" />
          <div className="h-1.5 w-1/2 rounded bg-foreground/5" />
        </div>
      </div>
    </div>
  );
}

// AI Icon Badge - colored background with white icon and shiny glow
function AIBadge({
  icon: Icon,
  name,
  bgColor,
  bgGradient,
  shinePosition = "tl",
  delay = 0,
  className = "",
}: {
  icon: React.ComponentType<{
    className?: string;
  }>;
  name: string;
  bgColor: string;
  bgGradient?: string;
  shinePosition?: "tl" | "tr" | "bl" | "br";
  delay?: number;
  className?: string;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  // Gradient and shine positions based on shinePosition
  const gradientMap = {
    tl: "to bottom right",
    tr: "to bottom left",
    bl: "to top right",
    br: "to top left",
  };

  const shinePositionMap = {
    tl: "-top-2 -left-2",
    tr: "-top-2 -right-2",
    bl: "-bottom-2 -left-2",
    br: "-bottom-2 -right-2",
  };

  const borderGradientMap = {
    tl: "135deg",
    tr: "225deg",
    bl: "45deg",
    br: "315deg",
  };

  // Use custom gradient if provided, otherwise generate from bgColor
  const backgroundStyle = bgGradient
    ? bgGradient
    : `linear-gradient(${gradientMap[shinePosition]}, ${bgColor} 0%, ${bgColor} 40%, color-mix(in srgb, ${bgColor} 70%, black) 100%)`;

  return (
    <div
      className={`absolute flex flex-col items-center gap-1.5 transition-all duration-500 ease-out ${isVisible ? "scale-100 opacity-100" : "scale-75 opacity-0"}
        ${className}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Outer border with bright white shine on one corner */}
      <div
        className="relative rounded-2xl p-[0.5px]"
        style={{
          background: `linear-gradient(${borderGradientMap[shinePosition]}, #ffffff 0%, rgba(255,255,255,0.8) 15%, rgba(255,255,255,0.2) 35%, transparent 50%)`,
        }}
      >
        {/* Main badge */}
        <div
          className="relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl sm:h-14 sm:w-14"
          style={{
            background: backgroundStyle,
            boxShadow: `0 4px 16px ${bgColor}30`,
          }}
        >
          {/* Subtle shine spot */}
          <div
            className={`absolute ${shinePositionMap[shinePosition]} h-8 w-8 rounded-full opacity-30 blur-lg`}
            style={{ backgroundColor: "white" }}
          />
          {/* Very subtle top gradient for depth */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: `linear-gradient(${gradientMap[shinePosition]}, rgba(255,255,255,0.15) 0%, transparent 50%)`,
            }}
          />
          {/* Icon */}
          <Icon className="relative z-10 h-6 w-6 text-white sm:h-8 sm:w-8" />
        </div>
      </div>
      <span className="font-medium text-[9px] text-foreground-muted sm:text-[10px]">{name}</span>
    </div>
  );
}

// Main Hero Cards Stack Component
export function HeroCards() {
  const content = useLanding();
  const { ref, isInView } = useInView<HTMLDivElement>({ threshold: 0.1 });
  const prefersReducedMotion = useReducedMotion();

  // Pause floating animation when not in view or user prefers reduced motion
  const shouldAnimate = isInView && !prefersReducedMotion;

  return (
    <div ref={ref} className="relative flex h-[380px] w-full items-center justify-center sm:h-[420px] lg:h-[460px]">
      {/* Card Stack Container */}
      <div className="relative flex h-full w-full max-w-150 scale-110 items-center justify-center">
        {/* File Card - Left side, behind folder */}
        <FileCard
          filename="verdict.json"
          lines={7}
          delay={400}
          className="z-10 -translate-x-14 translate-y-[-70px] rotate-[-10deg] sm:-translate-x-25 sm:-translate-y-25"
        />

        {/* Memory Card - Right side, behind folder */}
        <MemoryCard
          title="Policy"
          content="Amount caps and velocity live in code. The model never talks to Razorpay."
          category="decision"
          delay={500}
          className="z-20 translate-x-16 translate-y-[-70px] rotate-[20deg] sm:translate-x-[80px] sm:-translate-y-25 md:rotate-[10deg]"
        />

        {/* Plane Card - Right bottom, behind folder */}
        <PlaneCard
          delay={650}
          className="z-30 translate-x-0 translate-y-[-50px] -rotate-3 sm:-translate-x-[30px] sm:translate-y-[-90px]"
        />

        {/* Folder - Center front */}
        <FolderCard name={content.name} items={24} delay={200} className="z-40" />

        {/* AI Icons - positioned around the stack, rotated, closer to folder */}
        <AIBadge
          icon={RiClaudeLine}
          name="Claude"
          bgColor="#D97757"
          shinePosition="tr"
          delay={850}
          className="z-50 -translate-x-[140px] -translate-y-[25px] rotate-[-12deg] sm:-translate-x-[225px] sm:-translate-y-[130px]"
        />

        <AIBadge
          icon={SiOpenai}
          name="ChatGPT"
          bgColor="#10A37F"
          shinePosition="tl"
          delay={950}
          className="z-50 translate-x-[140px] -translate-y-[35px] rotate-[20deg] sm:translate-x-[205px] sm:-translate-y-25"
        />

        <AIBadge
          icon={SiGooglegemini}
          name="Gemini"
          bgColor="#3b82f6"
          bgGradient="linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)"
          shinePosition="bl"
          delay={1050}
          className="z-50 translate-x-[130px] translate-y-[110px] rotate-[-15deg] sm:translate-x-[175px] sm:translate-y-[70px]"
        />

        <AIBadge
          icon={({ className }: { className?: string }) => <Cursor size={32} className={className} />}
          name="Cursor"
          bgColor="#1a1a1a"
          shinePosition="br"
          delay={1150}
          className="z-50 -translate-x-[130px] translate-y-25 rotate-[-8deg] sm:-translate-x-[190px] sm:translate-y-[60px]"
        />
      </div>

      {/* Floating particles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {PARTICLE_POSITIONS.map((particle, i) => (
          <div
            key={i}
            className={`absolute h-1 w-1 rounded-full bg-accent/30 will-change-transform ${shouldAnimate ? "animate-float" : ""}`}
            style={{
              left: particle.left,
              top: particle.top,
              animationDuration: particle.duration,
              animationDelay: particle.delay,
            }}
          />
        ))}
      </div>
    </div>
  );
}
