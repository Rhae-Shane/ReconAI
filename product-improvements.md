# product-improvements.md — ReconAI

Prioritized backlog beyond the hackathon-complete close loop (phases 0–6 in `BUILD_PLAN.md`).

## P0 — Trust & production readiness

| Item | Why |
|---|---|
| Multi-tenant org isolation on every close API | Prevent cross-merchant run/exception leakage |
| Role gates enforced server-side (`owner` / `accountant` / `viewer`) on resolve/finalize | UI-only RBAC is not enough |
| Signed export of `CloseReport` (hash + actor + timestamp) | Audit package for finance sign-off |
| Webhook idempotency ledger for Razorpay events | Duplicate `payment.captured` must not double-ingest |

## P1 — Accuracy & coverage

| Item | Why |
|---|---|
| Real bank statement parsers (CSV/MT940/CAMT) | Beyond synthetic UTR shapes |
| Configurable fee schedules per MID / method | Netting without planting FEE rows |
| Chargeback / dispute legs in the same close | Completes the money lifecycle |
| Per-entity FX books (extend `fx.ts`) | Multi-currency legal entities |
| Human-in-the-loop resolve UX with suggested splits | Faster exception clearance |

## P2 — Product surface

| Item | Why |
|---|---|
| Scheduled daily close (cron → enqueue `close-runs`) | Hands-off ops |
| Slack / email digest of open exceptions | Bring work to accountants |
| Diff view: run N vs run N−1 | Spot regression in match rate |
| Read-only “board” dashboard (match %, exception aging) | Exec glance without cockpit noise |
| CSV template download + column mapper | Self-serve onboarding |

## P3 — Scale & cost

| Item | Why |
|---|---|
| Shard large uploads (10k+ rows) with progress events | Keep UI live under load |
| Cache deterministic match indexes per source day | Cut re-close latency |
| Bound / batch residual LLM calls with prompt caching | Cost control at volume |
| Worker autoscaling policy docs | Ops runbooks for Redis + BullMQ |

## Explicit non-goals (for now)

- Full double-entry GL / journal posting
- GST filing submission
- Multi-PSP abstraction beyond Razorpay adapters
- Billing / SaaS metering for ReconAI itself

When picking the next slice, prefer anything that **raises measured trust** (isolation, audit,
idempotency) before cosmetic dashboard work.
