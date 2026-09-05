"use client";

const stats = [
  {
    value: "Gated",
    label: "PaymentCore",
    sublabel: "Model never moves money",
  },
  {
    value: "Live",
    label: "Razorpay test mode",
    sublabel: "Orders and webhooks",
  },
  {
    value: "Audit",
    label: "Append-only trail",
    sublabel: "Every verdict recorded",
  },
  {
    value: "Policy",
    label: "Hard gates in code",
    sublabel: "Caps, velocity, denylist",
  },
];

export function StatsBar() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative">
          {/* Shiny border corner glows — matches how-it-works + CTA pattern */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-px -left-px h-20 w-28 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at top left, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0.15) 35%, transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-px -bottom-px h-20 w-28 rounded-2xl"
            style={{
              background:
                "radial-gradient(ellipse at bottom right, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 35%, transparent 70%)",
            }}
          />

          {/* Soft coral ambient behind the panel */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 rounded-3xl opacity-30 blur-3xl"
            style={{
              background: "radial-gradient(ellipse at 50% 50%, rgba(232,97,60,0.15) 0%, transparent 65%)",
            }}
          />

          {/* Main card */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-surface/40 shadow-2xl shadow-black/30 backdrop-blur-md">
            {/* Inner top-left gradient sheen */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/[0.04] via-transparent to-transparent"
            />
            {/* Top specular highlight */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
              }}
            />

            <div className="relative grid grid-cols-2 divide-x divide-y divide-white/[0.06] lg:grid-cols-4 lg:divide-y-0">
              {stats.map((stat) => (
                <div key={stat.label} className="group relative px-5 py-8 text-center sm:px-8 sm:py-10">
                  {/* Subtle hover backdrop */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: "radial-gradient(ellipse at center, rgba(232,97,60,0.06) 0%, transparent 70%)",
                    }}
                  />

                  {/* Value with soft coral halo */}
                  <div className="relative mb-3 inline-block">
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 opacity-50 blur-2xl"
                      style={{
                        background: "radial-gradient(ellipse at center, rgba(232,97,60,0.35) 0%, transparent 70%)",
                      }}
                    />
                    <div className="relative font-bold font-display text-3xl text-accent leading-none tracking-tight sm:text-4xl lg:text-5xl">
                      {stat.value}
                    </div>
                  </div>

                  <div className="relative mb-1.5 font-semibold text-foreground text-sm tracking-tight sm:text-[15px]">
                    {stat.label}
                  </div>

                  <div className="relative font-mono text-[11px] text-foreground-subtle/80 uppercase tracking-[0.12em] sm:text-xs">
                    {stat.sublabel}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom inner shadow edge */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
