"use client";

import { type ReactNode } from "react";
import { Lock, MousePointer2, Plus, RefreshCcw, Search, Shield } from "lucide-react";

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 466.73 532.09" fill="currentColor" className={className}>
      <path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
    </svg>
  );
}

function OpenCodeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 300" fill="none" className={className}>
      <path d="M180 240H60V120H180V240Z" fill="#4B4646" />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="currentColor" />
    </svg>
  );
}

function DroidIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 67 65" fill="currentColor" className={className}>
      <path d="M47.75 11.15a.867.867 0 0 1-.671-.806.84.84 0 0 1 .067-.362c1.688-4.007 2.433-7.213 1.23-8.555-3.183-3.56-15.952 3.52-20.024 5.919a.9.9 0 0 1-1.273-.41c-1.711-3.998-3.51-6.78-5.334-6.9-4.833-.323-8.73 13.49-9.87 17.992a.85.85 0 0 1-.459.563.9.9 0 0 1-.737.027c-4.109-1.647-7.398-2.373-8.773-1.2-3.651 3.104 3.609 15.557 6.068 19.528a.85.85 0 0 1-.11 1.031.9.9 0 0 1-.31.21C3.455 39.856.604 41.61.478 43.389c-.329 4.713 13.834 8.513 18.452 9.625q.186.046.337.163a.87.87 0 0 1 .332.642.84.84 0 0 1-.067.362c-1.688 4.007-2.433 7.214-1.23 8.555 3.183 3.561 15.954-3.519 20.025-5.917a.9.9 0 0 1 1.058.107.9.9 0 0 1 .215.302c1.711 3.997 3.509 6.779 5.334 6.9 4.833.322 8.73-13.49 9.868-17.993a.85.85 0 0 1 .168-.33.88.88 0 0 1 .659-.324.9.9 0 0 1 .371.066c4.109 1.647 7.397 2.372 8.773 1.2 3.651-3.105-3.61-15.559-6.07-19.53a.85.85 0 0 1 .111-1.03.9.9 0 0 1 .31-.21c4.1-1.67 6.952-3.424 7.075-5.203.331-4.713-13.833-8.513-18.45-9.623m-5.546-4.518c.93 1.624-3.858 12.446-7.42 20.015a.7.7 0 0 1-.28.303.71.71 0 0 1-.796-.059.7.7 0 0 1-.23-.341c-1.439-4.921-3.082-10.704-4.841-15.612a.84.84 0 0 1 .01-.594.87.87 0 0 1 .401-.446c4.392-2.34 11.908-5.446 13.156-3.266m-21.048 1.34c1.833.507 6.294 11.46 9.264 19.268a.67.67 0 0 1-.2.754.71.71 0 0 1-.794.08c-4.589-2.485-9.94-5.444-14.743-7.702a.87.87 0 0 1-.422-.427.84.84 0 0 1-.04-.591c1.414-4.679 4.471-12.063 6.935-11.383M7.243 23.433c1.664-.906 12.762 3.763 20.522 7.235.13.058.239.154.311.274a.67.67 0 0 1-.06.776.7.7 0 0 1-.35.225c-5.045 1.403-10.976 3.006-16.01 4.721a.9.9 0 0 1-.607-.01.88.88 0 0 1-.456-.391c-2.395-4.284-5.586-11.613-3.35-12.83M8.617 43.96c.519-1.788 11.752-6.14 19.758-9.035a.72.72 0 0 1 .773.195.67.67 0 0 1 .081.774c-2.548 4.475-5.582 9.694-7.898 14.377a.87.87 0 0 1-.437.413.9.9 0 0 1-.607.039c-4.797-1.37-12.37-4.36-11.67-6.763m15.855 13.568c-.93-1.623 3.859-12.446 7.42-20.014a.7.7 0 0 1 .28-.303.715.715 0 0 1 .796.059.7.7 0 0 1 .23.34c1.439 4.92 3.083 10.705 4.841 15.613a.84.84 0 0 1-.01.593.87.87 0 0 1-.402.445c-4.391 2.335-11.908 5.447-13.15 3.267zm21.049-1.34c-1.836-.506-6.297-11.461-9.266-19.269a.67.67 0 0 1 .2-.755.71.71 0 0 1 .795-.078c4.587 2.484 9.94 5.445 14.742 7.703.189.088.339.24.423.426a.84.84 0 0 1 .039.592c-1.413 4.686-4.47 12.063-6.933 11.381m13.912-15.462c-1.665.907-12.762-3.763-20.523-7.236a.7.7 0 0 1-.311-.273.67.67 0 0 1 .06-.777.7.7 0 0 1 .35-.225c5.046-1.402 10.975-3.005 16.009-4.72a.9.9 0 0 1 .609.01.88.88 0 0 1 .457.392c2.393 4.282 5.584 11.613 3.349 12.829M58.06 20.2c-.521 1.79-11.753 6.14-19.759 9.036a.72.72 0 0 1-.774-.195.67.67 0 0 1-.08-.776c2.547-4.474 5.581-9.694 7.897-14.377a.87.87 0 0 1 .437-.412.9.9 0 0 1 .607-.038c4.797 1.377 12.37 4.359 11.672 6.762" />
    </svg>
  );
}

function GeminiColorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="mc-gemini-0" x1="7" x2="11" y1="15.5" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#08B962" />
          <stop offset="1" stopColor="#08B962" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mc-gemini-1" x1="8" x2="11.5" y1="5.5" y2="11" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F94543" />
          <stop offset="1" stopColor="#F94543" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="mc-gemini-2" x1="3.5" x2="17.5" y1="13.5" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FABC12" />
          <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z"
        fill="#3186FF"
      />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#mc-gemini-0)" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#mc-gemini-1)" />
      <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#mc-gemini-2)" />
    </svg>
  );
}

function ClaudeMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-[#D97757]" fill="currentColor">
      <path d="M11.2 2.4 8.1 13.1h2.4l.9-3.1h3.4l.9 3.1h2.4L15 2.4h-3.8Zm1.9 2.3 1.1 3.8h-2.2l1.1-3.8ZM4.6 15.2l2.1 6.4h2.5l-1.4-4.2 3.2-5.2H8.6L6.8 15l-1.6-3.8H2.7l1.9 4ZM16.8 21.6l2.1-6.4 1.9-4h2.5L19.4 17l-1.4 4.6h-1.2Z" />
    </svg>
  );
}

function OpenAiMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-[#10A37F]" fill="currentColor">
      <path d="M22.28 9.77a5.95 5.95 0 0 0-.52-4.93 6.02 6.02 0 0 0-6.5-2.9 6.02 6.02 0 0 0-10.2 2.18 5.95 5.95 0 0 0-4 5.75 6.02 6.02 0 0 0 2.26 6.36 5.95 5.95 0 0 0 .52 4.93 6.02 6.02 0 0 0 6.5 2.9 6.02 6.02 0 0 0 10.2-2.18 5.95 5.95 0 0 0 4-5.75 6.02 6.02 0 0 0-2.26-6.36Zm-9.05 12.3a4.47 4.47 0 0 1-2.87-1.04l.14-.08 4.78-2.76a.79.79 0 0 0 .4-.68V11.3l2.02 1.17c.03.01.04.04.04.08v5.59a4.5 4.5 0 0 1-4.51 4.93ZM5.3 18.36a4.47 4.47 0 0 1-.53-3l.14.08 4.78 2.76c.24.14.54.14.79 0l5.83-3.37v2.33c0 .04-.02.07-.05.09l-4.83 2.79a4.5 4.5 0 0 1-6.13-1.68Zm-.9-9.4a4.47 4.47 0 0 1 2.34-2.04v5.67c0 .28.15.54.4.68l5.83 3.37-2.02 1.17a.08.08 0 0 1-.08 0L5.04 14.8a4.5 4.5 0 0 1-.64-5.84Zm15.56 3.63-4.78-2.76V7.5c0-.28-.15-.54-.4-.68L8.95 3.45l2.02-1.16a.08.08 0 0 1 .08 0l4.83 2.79a4.5 4.5 0 0 1-1.22 8.01Zm2.1-3.02-.14-.08-4.78-2.76a.79.79 0 0 0-.79 0L6.52 7.7V5.37c0-.04.02-.07.05-.09l4.83-2.79a4.5 4.5 0 0 1 6.66 5.09ZM8.23 12.7 6.21 11.53a.08.08 0 0 1-.04-.08V5.86a4.5 4.5 0 0 1 7.38-3.89l-.14.08-4.78 2.76a.79.79 0 0 0-.4.68v5.52Zm1.04-1.12 2.6-1.5 2.6 1.5v3l-2.6 1.5-2.6-1.5v-3Z" />
    </svg>
  );
}

function CopilotMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor">
      <path d="M12 2a6 6 0 0 0-5.2 3.05A5 5 0 0 0 4 14.3V17a3 3 0 0 0 3 3h.5a2.5 2.5 0 0 0 2.5-2.5V16h4v1.5A2.5 2.5 0 0 0 16.5 20H17a3 3 0 0 0 3-3v-2.7A5 5 0 0 0 17.2 5.05 6 6 0 0 0 12 2Zm-3 9.5A1.5 1.5 0 1 1 10.5 10 1.5 1.5 0 0 1 9 11.5Zm6 0A1.5 1.5 0 1 1 16.5 10 1.5 1.5 0 0 1 15 11.5Z" />
    </svg>
  );
}

function VsCodeMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-[#007ACC]" fill="currentColor">
      <path d="M21.2 2.4 14.3 8.6 8.7 4.4 6.3 5.6l6.2 6.4-6.2 6.4 2.4 1.2 5.6-4.2 6.9 6.2 1.7-1V3.4zM3.8 16.3 1.1 15l5.4-3L1.1 9l2.7-1.3L9.3 12z" />
    </svg>
  );
}

function ZedMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor">
      <path d="M4 5h16l-9 7h9v7H4l9-7H4z" />
    </svg>
  );
}

function IntelligentMemoryVisual() {
  const gridSize = 7;
  const getDistanceFromCenter = (row: number, col: number) =>
    Math.sqrt((row - 3) ** 2 + (col - 3) ** 2);

  const getOpacity = (row: number, col: number) => {
    const dist = getDistanceFromCenter(row, col);
    if (dist === 0) return 1;
    if (dist <= 1.5) return 0.6;
    if (dist <= 2.2) return 0.55;
    if (dist <= 3) return 0.3;
    if (dist <= 3.6) return 0.15;
    return 0.08;
  };

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        className="absolute -top-12 -right-12 size-32"
        style={{
          background:
            "radial-gradient(circle at center, rgba(232,97,60,0.2) 0%, rgba(232,97,60,0.08) 40%, transparent 70%)",
        }}
      />
      <div className="absolute -top-12 -right-12 grid grid-cols-7 gap-[3px]">
        {Array.from({ length: gridSize * gridSize }).map((_, i) => {
          const row = Math.floor(i / gridSize);
          const col = i % gridSize;
          const opacity = getOpacity(row, col);
          const dist = getDistanceFromCenter(row, col);
          const highlight = dist <= 2.5;
          return (
            <div
              key={i}
              className="size-9 rounded-[3px]"
              style={{
                background: highlight
                  ? `linear-gradient(145deg, rgba(232, 97, 60, ${opacity}) 0%, rgba(201, 78, 46, ${opacity * 0.85}) 50%, rgba(170, 60, 35, ${opacity * 0.7}) 100%)`
                  : `linear-gradient(145deg, rgba(50, 50, 50, ${opacity * 0.5}) 0%, rgba(25, 25, 25, ${opacity * 0.6}) 100%)`,
                boxShadow:
                  highlight && dist <= 2
                    ? `0 0 ${10 * opacity}px rgba(232, 97, 60, ${0.3 * opacity}), inset 0 1px 1px rgba(255,255,255,${0.25 * opacity}), inset 0 -1px 1px rgba(0,0,0,${0.2 * opacity})`
                    : `inset 0 1px 1px rgba(255,255,255,${0.08 * opacity}), inset 0 -1px 1px rgba(0,0,0,${0.3 * opacity})`,
                opacity: opacity < 0.1 ? opacity : 1,
              }}
            >
              {dist === 0 && (
                <div className="relative flex size-full items-center justify-center">
                  <Plus className="absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-white/80" />
                  <MousePointer2 className="absolute -right-4 -bottom-4 size-4 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-white/80" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SemanticRetrievalVisual() {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-visible">
      <div className="relative flex scale-110 items-center">
        <div
          className="relative z-10 mr-[-8px] h-32 w-28 rounded-l-lg p-2"
          style={{
            background: "linear-gradient(135deg, rgba(60,60,60,0.6) 0%, rgba(40,40,40,0.4) 100%)",
            backdropFilter: "blur(8px)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 20px rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <p className="mb-1 text-[11px] font-medium text-white/90">Query:</p>
          <p className="text-[9px] leading-relaxed text-white/70">
            Score this <span className="text-white/90">checkout</span> for fraud.
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-white/50">Looking at velocity and amount…</p>
        </div>
        <div className="relative z-20 mx-1 flex flex-col items-center">
          <div className="h-24 w-px bg-linear-to-b from-transparent via-white/30 to-transparent" />
          <div className="size-2 rounded-full bg-white/80 shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
          <div className="h-24 w-px bg-linear-to-b from-transparent via-white/30 to-transparent" />
        </div>
        <div
          className="relative ml-[-8px] h-32 w-28 rounded-r-lg p-3"
          style={{
            background: "linear-gradient(135deg, rgba(50,50,50,0.5) 0%, rgba(30,30,30,0.3) 100%)",
            backdropFilter: "blur(8px)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.08), 0 4px 20px rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="mb-1 text-[11px] font-medium text-[#E8613C]/90">Found:</p>
          <p className="text-[9px] leading-relaxed text-white/60">
            <span className="text-[10px] text-[#E8613C]/80">Policy hit</span> amount cap + denylist
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-white/40">Verdict: block, audit row written.</p>
        </div>
      </div>
    </div>
  );
}

function AutoUpdatesVisual() {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute top-1/2 left-2 -translate-y-1/2 scale-125">
        <div
          className="relative h-32 w-28 overflow-hidden rounded-xl p-2.5"
          style={{
            background: "linear-gradient(145deg, rgba(55,55,55,0.6) 0%, rgba(35,35,35,0.5) 100%)",
            boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 15px rgba(0,0,0,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
            maskImage: "linear-gradient(to right, transparent 0%, black 30%, black 100%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 30%, black 100%)",
          }}
        >
          <div className="mb-3 flex items-center gap-2">
            <div className="size-5 rounded bg-white/10" />
            <div className="flex-1">
              <div className="mb-1 h-1.5 w-12 rounded bg-white/15" />
              <div className="h-1 w-8 rounded bg-white/10" />
            </div>
          </div>
          <div className="mb-3 space-y-2">
            <div className="h-1.5 w-full rounded bg-white/10" />
            <div className="h-1.5 w-4/5 rounded bg-white/8" />
            <div className="h-1.5 w-3/5 rounded bg-white/6" />
          </div>
          <div className="absolute right-2.5 bottom-2.5 left-2.5">
            <div
              className="rounded-md px-2 py-1.5 text-center text-[7px] font-medium text-white"
              style={{
                background:
                  "linear-gradient(145deg, rgba(232, 97, 60, 0.9) 0%, rgba(201, 78, 46, 0.85) 50%, rgba(170, 60, 35, 0.8) 100%)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              Buy with AI
            </div>
          </div>
        </div>
        <div className="absolute right-0 bottom-0 translate-x-1 translate-y-1">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white" className="opacity-90 drop-shadow-lg">
            <path d="M4 4l16 8-8 2-2 8z" />
          </svg>
        </div>
      </div>
      <div className="absolute top-1/2 left-1/2 z-10 ml-4 -translate-x-1/2 -translate-y-1/2">
        <div
          className="flex size-9 items-center justify-center rounded-full"
          style={{
            background: "linear-gradient(145deg, rgba(25,25,25,0.95) 0%, rgba(15,15,15,0.98) 100%)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <RefreshCcw className="size-4 text-[#E8613C]" strokeWidth={2.5} />
        </div>
      </div>
      <div className="absolute top-1/2 right-0 flex -translate-y-1/2 flex-col items-center">
        <p className="mb-2 text-[7px] tracking-wide text-white/40">Policy gates</p>
        <div className="relative h-28 w-28">
          <div
            className="absolute top-0 right-4 w-24 rounded-lg p-2 opacity-40"
            style={{
              background: "linear-gradient(145deg, rgba(35,35,35,0.3) 0%, rgba(25,25,25,0.2) 100%)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <div className="size-3 rounded-full bg-white/10" />
              <div className="h-1 w-10 rounded bg-white/10" />
            </div>
            <div className="text-[6px] text-white/30">v1: amount cap</div>
          </div>
          <div
            className="absolute top-6 right-2 w-24 rounded-lg p-2 opacity-70"
            style={{
              background: "linear-gradient(145deg, rgba(45,45,45,0.5) 0%, rgba(30,30,30,0.4) 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <div className="flex size-3.5 items-center justify-center rounded-full bg-white/15">
                <div className="size-1.5 rounded-full bg-white/30" />
              </div>
              <div className="h-1 w-12 rounded bg-white/15" />
            </div>
            <div className="text-[6px] text-white/40">v2: velocity rule</div>
          </div>
          <div
            className="absolute top-12 right-0 w-26 rounded-lg p-2.5"
            style={{
              background: "linear-gradient(145deg, rgba(55,55,55,0.7) 0%, rgba(40,40,40,1) 100%)",
              boxShadow: "0 4px 15px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-[#E8613C]/20">
                <RefreshCcw className="size-3 text-[#E8613C]" />
              </div>
              <div>
                <p className="text-[9px] font-medium text-white/90">Latest</p>
                <p className="text-[7px] text-white/50">Just now</p>
              </div>
            </div>
            <div className="text-[7px] font-medium text-[#E8613C]/80">v3: denylist + nonce</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PowerfulSearchVisual() {
  const glass = (extra?: string) => ({
    background: extra ?? "linear-gradient(145deg, rgba(60,60,60,0.5) 0%, rgba(35,35,35,0.4) 100%)",
    boxShadow: "inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 15px rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
  });

  return (
    <div className="relative h-full w-full overflow-hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 200 150" preserveAspectRatio="none">
        <path d="M0 70 Q50 50, 100 70 T200 70" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <path d="M0 120 Q50 100, 100 120 T200 120" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      </svg>
      <div className="absolute top-2 left-4">
        <div className="flex h-12 w-16 items-center justify-center rounded-lg" style={glass()} />
        <div className="absolute top-12 left-1/2 h-6 w-px -translate-x-1/2 bg-linear-to-b from-white/20 to-transparent" />
        <div className="absolute top-[70px] left-1/2 size-2.5 -translate-x-1/2 rounded-full bg-[#E8613C] shadow-[0_0_8px_rgba(232,97,60,0.8)]">
          <div className="absolute inset-0.5 rounded-full bg-[#E8613C]/60" />
        </div>
      </div>
      <div className="absolute top-8 right-6">
        <div className="h-10 w-14 rounded-lg" style={glass()} />
        <div className="absolute top-10 left-1/2 h-10 w-px -translate-x-1/2 bg-linear-to-b from-white/15 to-transparent" />
        <div className="absolute top-[76px] left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#E8613C]/80 shadow-[0_0_6px_rgba(232,97,60,0.6)]" />
      </div>
      <div className="absolute top-22 left-28 -translate-x-1/2 rotate-180">
        <div className="relative h-14 w-20 rounded-xl" style={glass("linear-gradient(145deg, rgba(65,65,65,1) 0%, rgba(40,40,40,0.7) 100%)")}>
          <Search className="absolute -top-2 -left-2 size-6 rotate-180 text-white/80" />
        </div>
        <div className="absolute -top-4 left-1/2 h-4 w-px -translate-x-1/2 bg-linear-to-t from-white/20 to-transparent" />
        <div className="absolute -top-5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#E8613C]/90 shadow-[0_0_8px_rgba(232,97,60,1)]" />
      </div>
      <div className="absolute right-2 bottom-14 rotate-180">
        <div className="h-10 w-12 rounded-lg" style={glass()} />
        <div className="absolute -top-6 left-1/2 h-6 w-px -translate-x-1/2 bg-linear-to-t from-white/15 to-transparent" />
        <div className="absolute -top-7 left-1/2 size-2 -translate-x-1/2 rounded-full bg-[#E8613C]/60 shadow-[0_0_5px_rgba(232,97,60,0.4)]" />
      </div>
    </div>
  );
}

function EncryptedPrivateVisual() {
  return (
    <div className="relative flex h-full w-full scale-130 items-center justify-center overflow-hidden">
      <Shield className="absolute size-44 fill-current text-[#E8613C]/[0.03]" />
      <Shield className="absolute size-36 fill-current text-[#E8613C]/[0.06]" />
      <Shield className="absolute size-28 fill-current text-[#E8613C]/[0.1]" />
      <Shield className="absolute size-20 fill-current text-[#E8613C]/[0.18]" />
      <div className="relative">
        <Shield className="size-14 fill-current text-[#E8613C]/30" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <Lock className="size-5 text-white/90" />
        </div>
      </div>
    </div>
  );
}

function CrossToolSyncVisual() {
  type IconType = "claude" | "openai" | "copilot" | "vscode" | "gemini" | "cursor" | "opencode" | "droid" | "zed";
  type CellConfig = { icon: IconType } | null;

  const grid: CellConfig[][] = [
    [null, { icon: "copilot" }, null, { icon: "cursor" }, null],
    [{ icon: "gemini" }, null, { icon: "claude" }, null, { icon: "openai" }],
    [null, { icon: "opencode" }, null, { icon: "droid" }, null],
    [{ icon: "vscode" }, null, { icon: "zed" }, null, { icon: "claude" }],
  ];

  const getIcon = (type: IconType) => {
    switch (type) {
      case "claude":
        return <ClaudeMark />;
      case "openai":
        return <OpenAiMark />;
      case "copilot":
        return <CopilotMark />;
      case "vscode":
        return <VsCodeMark />;
      case "gemini":
        return <GeminiColorIcon className="size-5" />;
      case "cursor":
        return <CursorIcon className="size-5 text-white" />;
      case "opencode":
        return <OpenCodeIcon className="size-5 text-white" />;
      case "droid":
        return <DroidIcon className="size-5 text-[#E8613C]" />;
      case "zed":
        return <ZedMark />;
      default:
        return null;
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
      <div className="grid scale-125 grid-cols-5 gap-2">
        {grid.flat().map((cell, i) => (
          <div
            key={i}
            className="flex size-9 items-center justify-center rounded-lg"
            style={{
              background: cell
                ? "linear-gradient(145deg, rgba(50,50,55,0.9) 0%, rgba(30,30,35,0.95) 100%)"
                : "linear-gradient(145deg, rgba(35,35,40,0.4) 0%, rgba(20,20,25,0.5) 100%)",
              boxShadow: cell
                ? "0 4px 12px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1)"
                : "inset 0 1px 1px rgba(255,255,255,0.03)",
              border: cell ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.03)",
            }}
          >
            {cell && getIcon(cell.icon)}
          </div>
        ))}
      </div>
    </div>
  );
}

export const FEATURE_VISUALS: ReactNode[] = [
  <IntelligentMemoryVisual key="memory" />,
  <SemanticRetrievalVisual key="semantic" />,
  <AutoUpdatesVisual key="updates" />,
  <PowerfulSearchVisual key="search" />,
  <EncryptedPrivateVisual key="encrypted" />,
  <CrossToolSyncVisual key="sync" />,
];
