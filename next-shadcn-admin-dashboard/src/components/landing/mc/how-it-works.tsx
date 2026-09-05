"use client";

import { useState, ReactNode, Fragment } from "react";
import { Copy, Check, ArrowRight, Circle } from "lucide-react";
import { useLanding } from "../landing-context";

// Warm, on-brand syntax palette matching the reference
const SYN = {
  key: "#EADDC8", // cream — JSON keys / TOML keys
  string: "#E8A17A", // soft terracotta — string literals
  punct: "#7A7168", // dim — braces, brackets, colons, commas
  plain: "#D7CFC3", // default text
  comment: "#6B6660",
  flag: "#C9A37A", // cURL flags like -H, -X
  method: "#E8A17A", // HTTP methods
} as const;

// Tokenize JSON/JSON-like text into colored spans.
// Handles strings (with their surrounding quotes), keys vs values via trailing colon,
// and punctuation. Everything else falls through as plain.
function highlightJson(source: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    // string literal
    if (ch === '"') {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\" && j + 1 < n) {
          j += 2;
          continue;
        }
        if (source[j] === '"') break;
        j++;
      }
      const strEnd = Math.min(j + 1, n);
      const literal = source.slice(i, strEnd);
      // peek next non-space char — if it's ":" this string is a key
      let k = strEnd;
      while (k < n && (source[k] === " " || source[k] === "\t")) k++;
      const isKey = source[k] === ":";
      out.push(
        <span key={key++} style={{ color: isKey ? SYN.key : SYN.string }}>
          {literal}
        </span>,
      );
      i = strEnd;
      continue;
    }
    // punctuation
    if ("{}[],:".includes(ch)) {
      out.push(
        <span key={key++} style={{ color: SYN.punct }}>
          {ch}
        </span>,
      );
      i++;
      continue;
    }
    // whitespace / plain
    let j = i;
    while (j < n && !'"{}[],:'.includes(source[j])) j++;
    out.push(
      <span key={key++} style={{ color: SYN.plain }}>
        {source.slice(i, j)}
      </span>,
    );
    i = j;
  }
  return out;
}

// Lightweight highlighter for TOML-ish and shell (cURL) snippets.
// Strings in "..." get the string color, leading keys before "=" get the key color,
// cURL flags (-X, -H, --foo) get the flag color.
function highlightShellish(source: string): ReactNode[] {
  const lines = source.split("\n");
  const nodes: ReactNode[] = [];
  lines.forEach((line, li) => {
    let i = 0;
    let k = 0;
    const parts: ReactNode[] = [];
    // detect "key = ..." style TOML lines
    const tomlMatch = /^(\s*)([A-Za-z0-9_.\-\[\]]+)(\s*=\s*)/.exec(line);
    if (tomlMatch) {
      parts.push(tomlMatch[1]);
      parts.push(
        <span key={`k${k++}`} style={{ color: SYN.key }}>
          {tomlMatch[2]}
        </span>,
      );
      parts.push(
        <span key={`k${k++}`} style={{ color: SYN.punct }}>
          {tomlMatch[3]}
        </span>,
      );
      i = tomlMatch[0].length;
    }
    // detect section headers like [section]
    const sectionMatch = /^(\s*)(\[[^\]]+\])(\s*)$/.exec(line);
    if (sectionMatch && !tomlMatch) {
      parts.push(sectionMatch[1]);
      parts.push(
        <span key={`k${k++}`} style={{ color: SYN.key }}>
          {sectionMatch[2]}
        </span>,
      );
      parts.push(sectionMatch[3]);
      i = line.length;
    }
    while (i < line.length) {
      const ch = line[i];
      // string
      if (ch === '"') {
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === "\\" && j + 1 < line.length) {
            j += 2;
            continue;
          }
          if (line[j] === '"') break;
          j++;
        }
        const end = Math.min(j + 1, line.length);
        parts.push(
          <span key={`k${k++}`} style={{ color: SYN.string }}>
            {line.slice(i, end)}
          </span>,
        );
        i = end;
        continue;
      }
      // cURL flag: -X, -H, --long
      if (
        ch === "-" &&
        (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")
      ) {
        let j = i + 1;
        if (line[j] === "-") j++;
        while (j < line.length && /[A-Za-z0-9_-]/.test(line[j])) j++;
        if (j > i + 1) {
          parts.push(
            <span key={`k${k++}`} style={{ color: SYN.flag }}>
              {line.slice(i, j)}
            </span>,
          );
          i = j;
          continue;
        }
      }
      // HTTP methods at token boundaries
      const rest = line.slice(i);
      const methodMatch = /^(GET|POST|PUT|DELETE|PATCH)\b/.exec(rest);
      if (methodMatch && (i === 0 || /\s/.test(line[i - 1]))) {
        parts.push(
          <span key={`k${k++}`} style={{ color: SYN.method }}>
            {methodMatch[0]}
          </span>,
        );
        i += methodMatch[0].length;
        continue;
      }
      // plain run until next notable char
      let j = i;
      while (j < line.length && line[j] !== '"' && line[j] !== "-") j++;
      if (j === i) j = i + 1;
      parts.push(
        <span key={`k${k++}`} style={{ color: SYN.plain }}>
          {line.slice(i, j)}
        </span>,
      );
      i = j;
    }
    nodes.push(
      <Fragment key={`l${li}`}>
        {parts}
        {li < lines.length - 1 ? "\n" : ""}
      </Fragment>,
    );
  });
  return nodes;
}

function highlightSnippet(source: string, fileName: string): ReactNode[] {
  const looksJson = source.trimStart().startsWith("{");
  return looksJson &&
    !fileName.startsWith("POST") &&
    !fileName.startsWith("GET")
    ? highlightJson(source)
    : highlightShellish(source);
}

interface Snippet {
  id: string;
  name: string;
  fileName: string;
  icon?: ReactNode;
  config: string;
}

export function HowItWorks() {
  const content = useLanding();
  const [copied, setCopied] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const snippets: Snippet[] = [
    {
      id: "payload",
      name: "Payload",
      fileName: content.snippetFile,
      config: content.snippet,
    },
  ];
  const current = snippets[Math.min(selectedIdx, snippets.length - 1)];
  const steps = content.steps;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(current.config);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-28 lg:py-32 px-4 sm:px-6 overflow-hidden"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Centered header — badge pill + heading + subtitle */}
        <div className="text-center mb-12 sm:mb-16">
          {/* Glowing Setup badge */}
          <div className="flex justify-center mb-6">
            <div className="group relative">
              <div
                aria-hidden
                className="absolute -top-px -left-px w-16 h-9 rounded-full blur-[1px]"
                style={{
                  background:
                    "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.2) 30%, transparent 70%)",
                }}
              />
              <div
                aria-hidden
                className="absolute -bottom-px -right-px w-16 h-9 rounded-full blur-[1px]"
                style={{
                  background:
                    "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.15) 30%, transparent 70%)",
                }}
              />
              <div className="absolute -inset-0.5 rounded-full border border-white/10" />
              <div className="relative inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface/95 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                <span className="relative z-10 text-xs sm:text-sm text-foreground font-medium">
                  Setup
                </span>
              </div>
            </div>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-display font-bold tracking-tight leading-[1.1]">
            {content.howTitle}
          </h2>

          <p className="mt-5 text-base sm:text-lg text-foreground-muted/80 max-w-2xl mx-auto leading-relaxed">
            {content.howSub}
          </p>
        </div>

        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-16 items-start">
          {/* LEFT — toggle + steps + CTA */}
          <div>
            {/* Numbered steps — shiny glass badges, center-aligned with first line */}
            <div className="space-y-4">
              {steps.map((step) => (
                <div key={step.num} className="flex items-start gap-4 sm:gap-5">
                  {/* Glass number badge — tighter, aligned with text baseline */}
                  <div className="relative shrink-0 mt-0.5">
                    <div
                      aria-hidden
                      className="absolute -top-[0.5px] -left-[0.5px] w-5 h-5 rounded-lg"
                      style={{
                        background:
                          "radial-gradient(ellipse at top left, rgba(232,97,60,0.6) 0%, rgba(232,97,60,0.15) 25%, transparent 70%)",
                      }}
                    />
                    <div
                      aria-hidden
                      className="absolute -bottom-[0.5px] -right-[0.5px] w-5 h-5 rounded-lg"
                      style={{
                        background:
                          "radial-gradient(ellipse at bottom right, rgba(232,97,60,0.4) 0%, rgba(232,97,60,0.08) 30%, transparent 70%)",
                      }}
                    />
                    <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center text-[11px] font-mono text-accent bg-accent/10 border border-accent/20">
                      <span className="relative z-10">{step.num}</span>
                    </div>
                  </div>

                  {/* Text — flows naturally, badge sits next to first line */}
                  <p className="flex-1 text-sm sm:text-base leading-7 sm:leading-8">
                    <span className="font-semibold text-foreground">
                      {step.title}
                    </span>{" "}
                    <span className="text-foreground-muted">{step.body}</span>
                  </p>
                </div>
              ))}
            </div>

            {/* Full setup guide CTA — glass pill */}
            <div className="mt-10">
              <a
                href={content.loginHref}
                className="group relative inline-block"
              >
                <div className="absolute -inset-0.5 rounded-xl border border-white/8" />
                <div className="relative flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-surface/60 backdrop-blur-sm border border-white/[0.08] transition-all group-hover:border-white/15 group-hover:bg-surface/80">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/[0.04] via-transparent to-transparent" />
                  <span className="text-sm sm:text-base text-foreground font-display font-semibold relative z-10">
                    Login
                  </span>
                  <ArrowRight className="w-4 h-4 text-foreground relative z-10 transition-transform group-hover:translate-x-1" />
                </div>
              </a>
            </div>
          </div>

          {/* RIGHT — code panel */}
          <div className="relative">
            {/* Border glow - top left */}
            <div
              aria-hidden
              className="absolute -top-px -left-px w-28 h-20 rounded-2xl"
              style={{
                background:
                  "radial-gradient(ellipse at top left, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 40%, transparent 70%)",
              }}
            />
            {/* Border glow - bottom right */}
            <div
              aria-hidden
              className="absolute -bottom-px -right-px w-28 h-20 rounded-2xl"
              style={{
                background:
                  "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 40%, transparent 70%)",
              }}
            />

            {/* Soft ambient accent glow behind panel */}
            <div
              aria-hidden
              className="absolute -inset-8 rounded-3xl blur-3xl opacity-40 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at 70% 30%, rgba(232,97,60,0.18) 0%, transparent 60%)",
              }}
            />

            {/* Main panel */}
            <div className="relative rounded-2xl bg-surface/50 backdrop-blur-md border border-white/[0.08] shadow-2xl shadow-black/40 overflow-hidden">
              {/* Inner gradient overlay */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-br from-white/[0.04] via-transparent to-transparent rounded-2xl pointer-events-none"
              />

              {/* Snippet tabs row — shiny pill switcher inside panel */}
              <div className="relative p-3 sm:p-4 border-b border-white/[0.06]">
                <div className="relative flex items-center p-1 rounded-xl bg-background/40 border border-white/[0.06]">
                  {/* Sliding indicator — equal slices, aligned to each button */}
                  <div
                    className="absolute top-1 bottom-1 rounded-lg transition-all duration-300 ease-out overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.5)] pointer-events-none"
                    style={{
                      width: `calc((100% - 8px) / ${snippets.length})`,
                      left: `calc(4px + ${selectedIdx} * ((100% - 8px) / ${snippets.length}))`,
                      background:
                        "linear-gradient(180deg, rgba(42,42,42,0.95) 0%, rgba(24,24,24,0.95) 100%)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      aria-hidden
                      className="absolute top-0 left-0 right-0 h-px"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)",
                      }}
                    />
                  </div>
                  {snippets.map((snip, i) => (
                    <button
                      key={snip.id}
                      onClick={() => {
                        setSelectedIdx(i);
                        setCopied(false);
                      }}
                      className={`relative z-10 flex-1 cursor-pointer flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors duration-300 ${
                        selectedIdx === i
                          ? "text-foreground"
                          : "text-foreground-muted hover:text-foreground"
                      }`}
                    >
                      {snip.icon && (
                        <span className="shrink-0">{snip.icon}</span>
                      )}
                      <span className="whitespace-nowrap">{snip.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Filename + copy button row */}
              <div className="relative px-4 sm:px-5 py-3 flex items-center justify-between border-b border-white/[0.06]">
                <span className="text-xs sm:text-sm text-foreground-subtle font-mono truncate">
                  {current.fileName}
                </span>
                <button
                  onClick={handleCopy}
                  className={`relative cursor-pointer shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    copied
                      ? "text-accent border-accent/20 bg-accent/10"
                      : "text-foreground-subtle border-white/[0.08] hover:text-foreground hover:bg-white/5"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {/* Code body — warm syntax highlighting */}
              <div className="relative overflow-x-auto max-w-[85vw] sm:max-w-none">
                <pre className="p-5 sm:p-6 text-xs sm:text-sm font-mono leading-relaxed min-h-[280px] sm:min-h-[300px]">
                  <code className="whitespace-pre">
                    {highlightSnippet(current.config, current.fileName)}
                  </code>
                </pre>
              </div>

              {/* Footer status row */}
              <div className="relative px-4 sm:px-5 py-3 border-t border-white/[0.06] flex items-center justify-between bg-background/20">
                <div className="flex items-center gap-2">
                  <Circle className="w-2 h-2 fill-accent text-accent" />
                  <span className="text-xs text-foreground-muted">
                    {content.howSub}
                  </span>
                </div>
                <span className="text-[10px] sm:text-xs text-foreground-subtle font-mono hidden sm:block">
                  Razorpay test mode
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
