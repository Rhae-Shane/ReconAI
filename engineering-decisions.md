# engineering-decisions.md — ReconAI

Short record of non-obvious choices and why they stick.

## 1. Deterministic-first, LLM last

**Decision:** Exact → normalized → netting → optional semantic → LLM residual only.

**Why:** Finance ops need reproducible audit trails. LLMs hallucinate matches; a confidence
threshold plus reason codes keeps unresolved work visible instead of “fixed” in silence.

**Trade-off:** Residual judgment quality depends on `OPENAI_API_KEY`. Without it,
`HeuristicJudge` + n-gram still run the audited batch unchanged.

## 2. Split `harness/` from the Next.js app

**Decision:** Accuracy-critical code lives in a framework-free package (`controller-harness`
via `file:../harness`). The app is thin API + UI + ops.

**Why:** Vitest runs without Next, Prisma, or React. CI can gate the engine independently.
Dashboard churn cannot silently break settlement math.

**Trade-off:** Deploy must include the sibling `harness/` folder (see `DEPLOYMENT.md`).

## 3. Integer paise, never floats

**Decision:** All money amounts are signed integers (paise).

**Why:** Avoid IEEE rounding in netting identity
`gross − fee − tax_on_fee − refund + adjustment = settlement`.

## 4. Honest exceptions over inflated match rate

**Decision:** Every unresolved record gets a `ReasonCode` + rationale + expected/actual split.
Exception list integrity is tested; empty-because-hidden fails the bar.

**Why:** One cherry-picked match proves nothing. The demo sells trust, not 100% fantasy resolve.

## 5. Graceful degradation for Redis / OpenAI / Razorpay

**Decision:** Optional services are no-ops when unset. Local `npm run dev` / `npm test` /
`npm run batch` stay green with an empty env.

**Why:** Hackathon and reviewer machines should not require Upstash or API keys to see the loop.

## 6. BullMQ + LangGraph only when `REDIS_URL` is set

**Decision:** Same close graph runs in-process or as a queued worker.

**Why:** Demo path needs zero infra; production path needs durable checkpoints and horizontal
workers without forking the engine.

## 7. Ground-truth labeled synthetic batch

**Decision:** Fixed-seed 81-record batch across four sources with labels for precision/recall.

**Why:** Match rate is measured, not assumed. Adversarial + invariant tests lock conservation laws
(partition, netting identity, no bare-fuzzy merges).

## 8. Prisma / Supabase optional

**Decision:** Schema mirrors harness types, but the close loop works from Redis/in-memory stores
for the demo.

**Why:** Persistence is valuable; it is not on the critical path for proving reconciliation math.

## 9. Razorpay test mode + webhooks as adapters

**Decision:** Live sync and HMAC webhooks are opt-in; CSV upload and the synthetic batch remain
first-class.

**Why:** Real formats without forcing live money or fragile demo credentials.

## 10. Co-located dashboard screens

**Decision:** Follow `next-shadcn-admin-dashboard/AGENTS.md` — page + `_components/` + sidebar
registration.

**Why:** Keeps UI consistent with the shared admin shell used across related hackathon tracks.
