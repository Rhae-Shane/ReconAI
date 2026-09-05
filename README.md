# ReconAI — Settlement Reconciliation Controller

> Reconcile payments, settlements and invoices the way a finance team actually does.
> Deterministic matching first (exact → normalized → netting → fuzzy), an AI resolver only for
> residual ambiguity, explicit **matched / partial / unresolved** outcomes, and an honest
> human-review exception list.

**Repo:** [github.com/Rhae-Shane/ReconAI](https://github.com/Rhae-Shane/ReconAI)

| Doc | Contents |
|---|---|
| **[docs/](./docs/)** | Mintlify site (`docs.json` + MDX) — start here |
| [architecture.md](./architecture.md) | System shape, FinanceCore pipeline, UI map |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Local, Vercel, Redis worker, env vars |
| [engineering-decisions.md](./engineering-decisions.md) | Why deterministic-first, harness split, etc. |
| [product-improvements.md](./product-improvements.md) | Prioritized backlog |
| [SPEC.md](./SPEC.md) | Full planning artifact |
| [BUILD_PLAN.md](./BUILD_PLAN.md) | Phase gates (0–6 complete) |

### Docs site (`docs/`)

Mintlify docs (same pattern as MemContext): Get Started, Concepts, Close Loop, Guides, Engineering, API Reference.

```bash
cd docs
npx mintlify dev   # local preview if Mintlify CLI is installed
```

## Layout

```
ReconAI/
├── docs/                         # Mintlify docs site (MDX + docs.json)
├── harness/                      # framework-agnostic core (no runtime deps)
│   ├── src/core/                 # ingest, reconcile, judge, settle, forecast, tax, …
│   ├── src/cli/                  # gen-batch, batch, agent, benchmark
│   └── tests/                    # Vitest unit + integration
├── next-shadcn-admin-dashboard/  # Next.js app — thin API + UI + worker
├── README.md
├── DEPLOYMENT.md
├── architecture.md
├── engineering-decisions.md
├── product-improvements.md
├── SPEC.md
└── BUILD_PLAN.md
```

## Quick start

```bash
# core — fully testable with empty env
cd harness
npm i
npm test
npm run batch          # prints measured summary
npm run benchmark      # CloseEngine wall-time at 100 / 1K / 10K (real hrtime)
npm run test:cov       # coverage gate

# dashboard
cd ../next-shadcn-admin-dashboard
cp .env.example .env.local
npm i
npm run benchmark      # same harness benchmark via npm --prefix ../harness
npm run dev            # http://localhost:3000
```

`npm run benchmark` measures real CloseEngine performance (HeuristicJudge, no LLM).
Run it locally for numbers — do not copy stale timings into docs.

Expected batch shape (labeled synthetic set, locked by tests):

```
records=81 · sources=4 · matched=66 · partial=2 · unresolved=13
resolved=81.48% · exceptions=15 · precision=1.00 · recall=1.00
```

## The honesty moment

Matches are reproducible. Residuals get **confidence** + **reason**. Anything below threshold is
filed with a reason code (`NO_KEY`, `AMOUNT_MISMATCH`, `PARTIAL_FLAP`, `DATE_SKEW`,
`LOW_CONFIDENCE`, `DUPLICATE`) — never silently dropped.

## 2-minute demo

1. `npm run batch` in `harness/` — real numbers, not a slide.
2. **Close Cockpit** — start a run; KPIs climb.
3. **Run Detail** — match-rate bars, confidence distribution, reconciliation grid; click a match →
   why-chip (`exact:utr`, conf `0.99`).
4. **Exception List** — reason codes + rationale; agent files `LOW_CONFIDENCE` live.
5. **Settlement Q&A + Forecast** — cited answers; 7-day cash band grounded in matched lags.

## Design pillars

| Pillar | What |
|---|---|
| FinanceCore chokepoint | One audited funnel; rules first, model only for residual |
| Deterministic-first | Reproducible matches; confidence + reason everywhere |
| Measured, not assumed | Ground-truth labels → match rate, precision, recall |
| Honest exceptions | Structured reason codes; zero silent drops |
| Graceful ops | Redis / OpenAI / Razorpay optional; in-process fallback |

## Ops / live Redis worker

Default: in-process closes (zero infra). With `REDIS_URL`: BullMQ queue + `npm run worker` +
LangGraph checkpointer. See [DEPLOYMENT.md](./DEPLOYMENT.md) for env tables and Vercel setup.

```bash
cd next-shadcn-admin-dashboard
npm run worker    # idle-safe without REDIS_URL; consumes when set
```

## License

See `next-shadcn-admin-dashboard/LICENSE` for the dashboard template license. Project code is provided
for the Razorpay hackathon track unless otherwise noted.
