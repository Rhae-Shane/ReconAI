# architecture.md — ReconAI

Settlement reconciliation controller: match gateway, bank UTR, ERP, and GST lines; settle;
forecast; tax-map; close with an **honest** exception list.

## System shape

```
datasets / CSV / Razorpay sync / webhooks
        │
        ▼
┌─────────────────── next-shadcn-admin-dashboard ───────────────────┐
│  UI (Close Cockpit, Run Detail, Exceptions, Settlement, Forecast) │
│  API routes  ·  optional BullMQ worker  ·  LangGraph close graph  │
└──────────────────────────────┬────────────────────────────────────┘
                               │ imports controller-harness
                               ▼
┌──────────────────────────── harness ──────────────────────────────┐
│  Ingest → Reconcile → Judge → Settle → Forecast → Tax → Exceptions│
│  → Audit → CloseReport   (FinanceCore chokepoint)                 │
└───────────────────────────────────────────────────────────────────┘
```

| Layer | Path | Role |
|---|---|---|
| Core engine | `harness/src/core/` | Framework-free TypeScript; zero runtime deps |
| CLI / bench | `harness/src/cli/` | `batch`, `gen-batch`, `agent`, `bench` |
| App UI + API | `next-shadcn-admin-dashboard/` | Thin Next.js surface over the harness |
| Ops | `src/lib/ops/`, `src/worker/` | Redis, BullMQ, rate limit, durable worker |

## FinanceCore pipeline

Every assertion (CLI, API, agent tool) flows through one funnel:

1. **Ingest** — normalize rows → `FinRecord` (idempotent by `source` + `sourceRef`)
2. **Reconcile** — EXACT → NORMALIZED → fee/refund/adjustment **netting** → residual flaps
3. **Judge** — `HeuristicJudge` by default; optional OpenAI residual judge + semantic matcher
4. **Settle** — bind matches to settlement batches; lag stats; Q&A ledger
5. **Forecast + tax** — cash projection from lags; HSN/category rules (+ judge fallback)
6. **Exceptions + audit** — structured reason codes; append-only events; never silent drops
7. **Close** — `CloseReport` with breakdown + per-record unresolved lines

Currency is integer **paise** (signed). Types in `harness/src/core/types.ts` are authoritative;
Prisma mirrors them for optional Postgres persistence.

## Matching model

| Match type | Meaning |
|---|---|
| `EXACT` / `NORMALIZED` | Deterministic key / normalized key |
| `FEE_NETTED` / `REFUND_NETTED` / `ADJUSTMENT_NETTED` | Settlement math identity holds |
| `PARTIAL` | Some signals matched → `PARTIAL_FLAP` |
| `FUZZY` / `AI_RESOLVED` | Residual only |
| `UNRESOLVED` | Exception with reason code |

Reason codes include `NO_KEY`, `AMOUNT_MISMATCH`, `PARTIAL_FLAP`, `DATE_SKEW`, `LOW_CONFIDENCE`,
`DUPLICATE`.

## Ops modes

| Mode | Trigger | Behavior |
|---|---|---|
| In-process | No `REDIS_URL` | `POST /api/close/runs` runs synchronously |
| Queued | `REDIS_URL` set + `npm run worker` | BullMQ `close-runs` + LangGraph + RedisSaver |

Upstash REST vars power the app run-store and rate limiter independently of the TCP worker URL.

## UI map

| Screen | Route |
|---|---|
| Close Cockpit | `/dashboard/close` |
| Run Detail | `/dashboard/close/[runId]` |
| Exceptions | `/dashboard/close/exceptions` |
| Settlement Q&A | `/dashboard/close/settlement` |
| Forecast | `/dashboard/close/forecast` |
| Tax | `/dashboard/close/tax` |

## Measured baseline (locked by harness tests)

```
records=81 · sources=4 · matched=66 · partial=2 · unresolved=13
resolved=81.48% · exceptions=15 · precision=1.00 · recall=1.00
```

See `SPEC.md` for the full product/architecture planning artifact and `BUILD_PLAN.md` for phase gates.
