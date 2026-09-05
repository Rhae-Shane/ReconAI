# BUILD_PLAN.md — ReconAI (Settlement Reconciliation Controller)

> Implementation roadmap for the finance-ops closing loop. The **dashboard repo is
> `app/`** (follow its `AGENTS.md`); the accuracy-critical engine lives in
> **`harness/`** (framework-agnostic, no runtime deps). Every phase has an exit gate — nothing
> advances until the gate passes.

**Conventions that apply everywhere:**
- Types and data shapes are owned by `harness/src/core/types.ts` and imported by the app; never
  redefine them.
- Currency is integer **paise** (₹), signed: `+` inflow, `-` outflow.
- Zero runtime deps in `harness/` (only `vitest` + `tsx` as devDeps) so it runs anywhere.
- The app only does thin API + UI; all logic lives in the harness engine.
- Co-locate UI: `src/app/(main)/dashboard/<screen>/page.tsx` + `_components/`, register the screen in
  `src/navigation/sidebar/sidebar-items.ts`.
- **Deterministic-first:** exact key → normalized → fee-netted → fuzzy/semantic residual → LLM only
  for the residual (and only when an API key is present). Nothing is ever guessed.

---

## Current state (audited baseline — these are real numbers, locked by tests)

The seeded synthetic batch is **81 records across 4 sources** with a known ground-truth label set.
Its composition and outcomes are asserted in `harness/tests/close.test.ts`, `labels.test.ts`,
`semantic.test.ts`, and the newer adversary/invariant suites:

```
records  = 81            (4 sources: razorpay-gateway · bank-utr · erp-orders · gst-invoices)
matched  = 66            (clean + pass-tolerance + 6 netted legs)
partial  = 2             (some signals matched, not enough to resolve → PARTIAL_FLAP)
unresolved= 13           (orphans NO_KEY, content-duplicates DUPLICATE, LOW_CONFIDENCE, AMOUNT_MISMATCH)
resolved = 66/81 (81.48%)
exceptions = 15          (each with a ReasonCode — never hidden)
precision = 1.00 · recall = 1.00
```

- **Full settlement math (P0):** netting is the review's identity
  `gross − gatewayFee − taxOnFee − refund + adjustment = settlement` (see `reconcile.ts →
  nettedGroup`). Every netted group carries an explicit `NettingBreakdown`
  (`grossPaise / feePaise / taxOnFeePaise / refundPaise / adjustmentPaise / netExpectedPaise /
  actualSettlementPaise / variancePaise`) and a specific `matchType`
  (`FEE_NETTED` / `REFUND_NETTED` / `ADJUSTMENT_NETTED`). Nothing is guessed — every field is
  populated only from FEE/REFUND/ADJUSTMENT records actually present in the group.
- **Explicit match types (P1):** every group and link carries a `MatchType`
  (`EXACT | NORMALIZED | FEE_NETTED | REFUND_NETTED | ADJUSTMENT_NETTED | PARTIAL | FUZZY |
  AI_RESOLVED | UNRESOLVED`), wired through judge/close. Exceptions are enriched with
  `expectedPaise / actualPaise / variancePaise / feePaise / adjustmentPaise / refundPaise /
  matchType / confidence / aiReasoning / reviewerDecision`.
- **Adversarial + invariant tests (P1):** `tests/adversarial.test.ts` proves zero false
  auto-match across cross-match, fee-coincidence, partial-payment, duplicate and one-invoice-once
  traps; `tests/invariant.test.ts` locks the conservation laws (partition, netting identity,
  disjoint consumption, exception→audit, no bare-fuzzy merges).
- **Semantic matcher:** `harness/src/core/semantic.ts` is the opt-in fuzzy layer for the residual
  only — `NgramSemanticMatcher` (deterministic, offline, default) or `EmbeddingSemanticMatcher`
  (cosine over OpenAI embeddings (`OPENAI_API_KEY`)). With no provider/key the audited batch is unchanged.
- **CloseReport** carries an explicit `breakdown { records, matched, partial, unresolved, matchRate }`
  plus a per-record `UnresolvedLine[]` (`expectedPaise` / `actualPaise` / `differencePaise` /
  `reason` / `confidence` / `status`) for human review.
- **Ops layer:** durable close-runs over Redis — BullMQ queue + worker (`npm run worker`), LangGraph
  state graph (`ingest → reconcile → judge → settle → forecast → tax → fileExceptions → closeRun`),
  RedisSaver checkpoint, and a Redis run-store. Everything degrades gracefully to in-process demo
  mode when Redis is unset. CSV upload at `POST /api/close/upload`; engineering summary at
  `GET /api/close/reconcile?runId=...`.

---

## Phase 0 — Core engine + scaffold (test-first) — COMPLETED

**Goal:** a tested, headless engine with a runnable batch runner that emits a report.

```
harness/
  package.json            # type: module; devDeps: vitest, tsx, @vitest/coverage-v8
  tsconfig.json
  src/core/types.ts       # FinRecord, MatchGroup, MatchLink, Settlement, ForecastDatum,
                          #  TaxCategory, TaxLineMatch, AuditEvent, ExceptionRecord,
                          #  CloseReport, MatchBreakdown, UnresolvedLine, ReasonCode, SourceKind, MatchMethod
  src/core/ingest.ts      # IngestService.normalize(rawRow, source) -> FinRecord  (idempotent by source+ref)
  src/core/reconcile.ts   # ReconciliationEngine: exactKeys(), normalizedKeysPass(), nettedGroup(), link()
  src/core/judge.ts       # Judge interface + HeuristicJudge (default, reproducible; optional SemanticMatcher)
  src/core/semantic.ts    # SemanticMatcher: Ngram (default) + Embedding (opt-in)
  src/core/settle.ts      # SettlementService: bindToSettlements(), settleQuery(), lagStats()
  src/core/forecast.ts    # CashForecaster.project(windowDays, matchedLags) -> ForecastDatum[]
  src/core/tax.ts         # TaxMatcher.match(line) via rules + optional judge
  src/core/exception.ts   # ExceptionLedger.add(rec, code, rationale, candidates)
  src/core/audit.ts       # AuditEngine.record(event)
  src/core/close.ts       # CloseEngine.run(batch) -> CloseReport  (orchestrates all above)
  src/core/config.ts      # FinanceConfig + DEFAULTS (tolerances, thresholds)
  src/cli/run-batch.ts    # reads seeded batch, runs CloseEngine, writes report.json/.csv, prints summary
  src/cli/generate-batch.ts # writes the synthetic 81-record batch (see Phase 1)
  src/cli/agent-driver.ts # headless agent tool loop -> prints the tool trace + the CLOSE control
  src/cli/benchmark.ts    # throughput baseline
  tests/*.test.ts         # Vitest unit + integration tests (incl. labels + semantic)
```

**Exit gate (met):** `npm test` green; `npm run batch` writes `report.json` + prints the summary;
`npm run test:cov` reports coverage.

---

## Phase 1 — Synthetic batch with ground truth + measured accuracy — COMPLETED

**Goal:** the **81-record** batch with **known labels** so accuracy is measured, not assumed.

**Step list (met):**
1. `src/core/dataset.ts` — realistic shape generation: Razorpay gateway captures (`pay_…`, `RZP`),
   bank UTR rows (`UTR` + amount + date), ERP orders (`ORD-…`), GST invoices (`INV-…`, HSN lines).
2. `src/cli/generate-batch.ts` — deterministically build **N=81** records across 4 sources with:
   - clean multi-source matches,
   - pass-tolerance matches,
   - **fee-netted** matches (gross `₹10,000 = settlement ₹9,823 + fee ₹177`) → 3 NETTED groups,
   - above-tolerance **mismatches** (→ `AMOUNT_MISMATCH`),
   - content-**duplicates** (→ `DUPLICATE`),
   - **orphans** (bank row with no gateway match → `NO_KEY`),
   - **near-duplicates** only the judge can disambiguate (→ `LOW_CONFIDENCE` / `PARTIAL_FLAP`),
   - a **ground-truth label set** `{ recordId | expectedGroupKey | expectedStatus }` — exactly
     49 MATCHED and 12 EXCEPTION.
3. Fixed seed keeps the batch reproducible so the demo numbers are stable.
4. `close.ts` computes per-source + overall **match rate** and **precision/recall** on the judged
   subset vs labels, plus the explicit matched / partial / unresolved **breakdown** and the
   per-record **UnresolvedLine[]**.
5. `tests/labels.test.ts`, `tests/close.test.ts`, `tests/semantic.test.ts` lock the composition.

**Exit gate (met):** `npm run batch` prints `records=81 · sources=4 · resolved=81.48% …` and the
breakdown `Matched: 66 · Partial: 2 · Unresolved: 13`; labels test locks the composition.

---

## Phase 2 — Agent tool layer (Claude via Vercel AI SDK) — COMPLETED

**Goal:** the recruiting + arbitration loop over the deterministic core.

**Step list (met):**
1. In the app repo `app/`, `src/lib/close/tools.ts` — Zod-schematized tools.
2. `src/lib/close/agent.ts` — Vercel AI SDK loop wiring the tools to the engine (works headless when
   `OPENAI_API_KEY` is absent).
3. `src/lib/close/claude-judge.ts` — `ClaudeJudge` implementing the `Judge` interface.
4. `harness/src/cli/agent-driver.ts` — headless driver: loads batch → runs the tool loop → prints the
   report (uses `HeuristicJudge` when no API key is present).
5. `tests/agent.test.ts` — asserts tool ordering and that the `CLOSE` control never finalizes with
   unresolved records pending.

**Exit gate (met):** `agent-driver` completes the batch and prints the report.

---

## Phase 3 — Forecast + tax matcher — COMPLETED

**Goal:** forward cash + tax-line mapping, both measured.

**Step list (met):** `forecast.ts` settlement-lag projection with confidence band; `tax.ts`
rule-based HSN/category assignment with judge fallback; tests green.

**Exit gate (met):** forecast series + tax match data in the report; tests green.

---

## Phase 4 — Dashboard UI + CSV upload — COMPLETED

**Goal:** real screens wired to a completed run's data. Follow `AGENTS.md` co-location exactly.

**Step list (met):**
1. Close cockpit `/dashboard/close`, run detail `/dashboard/close/[runId]` (match-rate KPIs,
   confidence distribution, reconciliation grid with Matched / Flaps / Exceptions tabs), exceptions,
   settlement Q&A, forecast, tax screens; sidebar Close entry.
2. API routes in §7 of the spec calling into the engine — including **`POST /api/close/upload`**
   (raw CSV body or `payments.csv` / `settlements.csv` / `invoices.csv` multipart; parses, reconciles
   a fresh run, rate-limited, 10 MiB cap, returns `{ runId, report }` with `breakdown` + `unresolved`).

**Exit gate (met):** a finished run's data renders across the screens; page builds.

---

## Phase 5 — Ops layer: Redis + LangGraph + BullMQ worker — COMPLETED

**Goal:** durable, queued close runs that still work locally with zero infra.

**Step list (met):**
1. `app/src/lib/ops/redis.ts` — Upstash Redis client (`@upstash/redis`,
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) for app reads/cache + run-store, and the
   ioredis TCP endpoint (`REDIS_URL`) for BullMQ + the LangGraph checkpointer. All accessors are
   safe no-ops when unconfigured.
2. `src/lib/ops/queue.ts` — BullMQ `close-runs` queue + worker. Queue is OFF unless `REDIS_URL` is
   set; when on, `POST /api/close/runs` enqueues a job consumed by **`npm run worker`**.
3. `src/lib/close/graph.ts` — LangGraph `StateGraph` (`ingest → reconcile → judge → settle → forecast →
   tax → fileExceptions → closeRun`) with RedisSaver checkpointer; `closeRun` is a terminal control
   that refuses to mark DONE with OPEN exceptions (bounded `MAX_REVISIONS` runs).
4. `src/lib/close/run-store.ts` — durable run meta/dataset/report persistence under `close:*`.
5. `src/worker/index.ts` — `npm run worker` entrypoint (requires `REDIS_URL`; graceful SIGINT/SIGTERM).
6. `src/lib/ops/ratelimit.ts` — Upstash sliding-window limiter on upload/chat; no-op without Redis.

**Exit gate (met):** `npm run worker` consumes close-run jobs; without any Redis env the app runs
synchronously in-process (graceful degradation).

---

## Phase 6 — Hardening + demo + coverage — COMPLETED

**Step list (met):**
1. Exception "honesty" drill: forced `LOW_CONFIDENCE` appears in the exception list (never hidden).
2. `README.md` at project root — ReconAI quick start + demo + Ops / live-Redis-worker section.
3. Coverage gate: `npm run test:cov` (`vitest run --coverage` via `@vitest/coverage-v8`).
4. Final `npm run batch` + `npm test` locked the 81-record numbers.

**Exit gate (met):** all drills pass; full report numbers printed and reproducible.

---

## File ownership summary

| Path | Owner | Purpose |
|---|---|---|
| `SPEC.md`, `BUILD_PLAN.md` | main agent | planning artifacts |
| `harness/` (engine + CLI + tests) | subagent A | framework-agnostic core, measured accuracy, semantic matcher |
| `app/` agent + API + UI + ops | subagent B | tool layer, routes, screens, Redis/LangGraph/BullMQ worker |
| `README.md` | main agent | demo script + operations guide |

*End of BUILD_PLAN — phases build on each other; run `npm test` / `npm run batch` at every gate.*
