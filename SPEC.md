# ReconAI — Settlement Reconciliation Controller

**Track: AI Finance Controller · Run the books and the cash position (Razorpay Hackathon)**

> Close one finance-ops loop across a **81-record audited batch** of synthetic data — and report the
> **match rate**, the explicit **matched / partial / unresolved** breakdown, and the **exceptions it
> could not resolve**. The bar is throughput plus *measured* accuracy plus an *honest* exception
> list. One cherry-picked match proves nothing.

```
          ┌─────────────────────────────────────────────────────────────┐
          │              RECONAI  (this project / app)                  │
          │                                                             │
 DATASETS ─▶  INGEST      ─▶  RECONCILE   ─▶  SETTLE   ─▶  FORECAST     │
 81-rec batch normalize        multi-source     Q&A         forward      │
 bank UTR     finite keys      match + fuzzy   agent        cash + tax   │
 gateway      ledger           residual                         match    │
 ERP/inv      idempotent       confidence                      lines     │
          │                    │                                          │
          │              ┌─────▼──────────────────────────────┐          │
          │              │       FINANCECORE  (chokepoint)     │          │
          │              │  ReconciliationEngine · Judge(Claude)│          │
          │              │  SettlementService · TaxMatcher     │          │
          │              │  CashForecaster · Audit/Exception   │          │
          │              └────────────────────────────────────┘          │
          │                          │                                   │
          │                    CLOSE REPORT (JSON/CSV + UI)              │
          │              match rate · confidence · honest exceptions      │
          └─────────────────────────────────────────────────────────────┘
```

- **App repo:** `next-shadcn-admin-dashboard/` (Next.js 16 · React 19 · TS strict · Tailwind v4 · shadcn/ui `radix-nova` · Prisma 7 · Supabase). This is the UI/home for the dashboard, following its own `AGENTS.md` conventions.
- **Core:** `harness/` — framework-agnostic TypeScript engine shared by the agent and the app (no runtime deps; `vitest` only for tests). Interfaces with the app via shared data shapes.
- **Spec:** this file — planning artifact. Code builds per `BUILD_PLAN.md`.

---

## 1. Why this wins

1. **It's the exact "why now".** Finance-ops verification — reconciliation, settlement, forecasting,
   tax mapping — is still done by hand for millions of small merchants. The bottleneck isn't
   generating money movement, it's *verifying* it: matching one payment across the gateway, the bank
   statement (UTR), the ERP order, and the GST invoice. That is pure agentic judgment + data work.
2. **The bar is engineered in, not bolted on.** Matching is a *measured* pipeline: deterministic
   exact-key matching first, then normalized/fuzzy residual, then Claude as the final arbiter — and
   every result carries a **confidence** and a **reason**. We publish the **match rate, precision,
   recall** (against known ground truth in the synthetic batch) and, above all, an **honest,
   structured exception list** of everything we could *not* resolve. Nothing is hidden or fudged.
3. **It closes a full loop.** Not a single tool or a single match — the agent takes a messy batch in,
   reconciles it across sources, answers settlement questions, projects tomorrow's cash, matches tax
   lines, and ships a closing report. One narrative from raw data to signed-off books.
4. **Deterministic-first, so it's actually trustworthy and auditable.** The LLM only judges the
   residual ambiguity; every assertion passes through `FinanceCore` which records provenance,
   confidence and a reason in an append-only audit ledger. A blocked/exception record is itself a
   first-class, presentable artifact.

---

## 2. Product architecture

### 2.1 FinanceCore — the verification chokepoint (build this first, test-first)

Every financial assertion — from an agent tool, an API route, or the harness CLI — flows through one
funnel. Match decisions are made by rules first; the model only arbitrates the residual.

```
 Agent tool / API / CLI ─▶ FinanceCore.run(input)
                             │
  ─ 1. ingest: normalize record(s) into FinRecord (idempotent, source-tagged)
  ─ 2. reconcile: deterministic pass (exact keys → normalized → reference-hash)
        leaves only truly ambiguous residual for the judge
  ─ 3. judge residual: deterministic HeuristicJudge, or Claude (ResidualJudge) →
        decision { confidence, reason, matchedRef, matchedSourceIds }
  ─ 4. settle: tie matched records to settlement batches; answer Q&A over them
  ─ 5. forecast + tax: project forward cash from settlement lags; map lines to tax categories
  ─ 6. audit + report: append decision to AuditEvent; any unresolved record becomes an
        ExceptionRecord (structured reason code — NEVER dropped); compute CloseReport
```

**The three deliverables ("the bar"):**

| Deliverable | What it means | Where it lives |
|---|---|---|
| **Throughput** | Processes a full 81-record audited batch in well under a second; scales to thousands behind the BullMQ queue | `BatchRunner` + streaming-status hooks + worker |
| **Measured accuracy** | Match rate per source + overall, precision/recall on the fuzzy/judged subset vs known ground truth | `CloseReport` + labeled subset in the generator |
| **Honest breakdown** | Explicit `matched / partial / unresolved` split + per-record `UnresolvedLine` (expected vs actual vs reason) so nothing is hidden | `CloseReport.breakdown` + `CloseReport.unresolved` |
| **Honest exceptions** | Every unresolved record listed with a machine reason code + human rationale; zero silent drops | `ExceptionLedger` (append-only) + report section |

### 2.2 The FinanceCore modules

| Module | Responsibility | Key outputs |
|---|---|---|
| `IngestService` | Normalizes heterogeneous records (gateway capture, bank UTR, ERP order, GST invoice) into one `FinRecord` shape; idempotent by `sourceRef`. | normalized records, source stats |
| `ReconciliationEngine` | Deterministic multi-source matching: exact key match, amount+window match, normalized-reference hash, cross-source linkage, and **fee netting** — a component whose amounts differ beyond tolerance is rescued as a **NETTED** group only when `gross === settlement + fee(s)` within tolerance (the fee line stays visible). Produces match groups, conflicted sets and residual flaps. | `MatchGroup[]`, conflicted `FinRecord[]`, `remaining` flaps |
| `Judge` (interface) | Resolves the residual ambiguity. Default `HeuristicJudge` (rules, fully reproducible); pluggable `ClaudeJudge` (Vercel AI SDK + Claude) for real deployments. | `{ confidence, reason, refs }` per candidacy |
| `SemanticMatcher` (`semantic.ts`) | Optional fuzzy layer for the *residual only*. `NgramSemanticMatcher` (deterministic, offline, default) or `EmbeddingSemanticMatcher` (cosine over embeddings via `EMBEDDINGS_API_KEY`). Opt-in — with no key the audited batch is unchanged. | similarity score per candidate pair |
| `SettlementService` | Binds matched payments to settlement batches, computes settlement lag, exposes a queryable settled ledger. | `Settlement`, lag stats, ledger rows |
| `CashForecaster` | Projects next-day / week-ahead cash balance from matched inflows, outflows and historical settlement-lag distribution. | forecast series + interval |
| `TaxMatcher` | Maps raw lines to GST/HSN categories + ledger accounts by rules; Claude fallback for ambiguous item descriptions. | category map + confidence |
| `AuditEngine` | Append-only log of every decision, assertion, and exception — provenance, confidence, reason. | `AuditEvent[]` |
| `ExceptionLedger` | Structured store of unresolved records, each with a reason code + rationale; never deleted. | `ExceptionRecord[]` |
| `CloseEngine` | Orchestrates the whole loop, computes aggregate metrics, emits the `CloseReport`. | `CloseReport` |
| `BatchRunner` | CLI/server loop that feeds the batch through and writes the report (JSON + CSV). | report files |

### 2.3 Why deterministic-first matters for "honesty"

A naive agent that just "tries its best" on every record would produce plausible-looking but
unverifiable results. Here:

- Default single-source matches are **exact** (hard key equality) → confidence `1.0`, reason `exact:key`.
- Near-misses go to **normalized** matching (case/space/zero-padding/date normalization) → confidence `0.95`.
- A component whose amounts differ beyond tolerance but is fully explained by a linked gateway fee is
  **netted** (`NETTED`, confidence `0.98`) — never a blind `AMOUNT_MISMATCH`. The fee is never guess;
  it only fires when a real `FEE` record is present and the arithmetic balances.
- Anything still ambiguous goes to the **judge** (optionally boosted by the semantic matcher) and gets
  a real confidence (< `1.0`).
- If confidence < `RESOLVE_THRESHOLD` (e.g. `0.7`) or no candidate meets the bar, the record is
  **partial** or **unresolved** and becomes an **exception** — surfaced, never guessed.

This keeps the ethics of the bar intact: we report exactly what we know and exactly what we don't.

---

## 3. Tech stack (best possible, consistent with the dashboard repo)

| Layer | Choice | Why |
|---|---|---|
| App framework | **Next.js 16 App Router**, React 19, TS strict | The repo's existing stack; Server Components by default, client `_components/` co-located. |
| UI | **shadcn/ui (radix-nova)** + Tailwind v4, `lucide-react`, `recharts` (forecast/series charts), `@tanstack/react-table` (match grids + exception table), `zustand`, `sonner` (close-run toasts), `cmdk`, `vaul` (exception detail drawer) | Reuses the dashboard shell, theme tokens, component set; no new UI framework. |
| Agent runtime | **Anthropic Claude** via **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`), streaming + tool calling | Most capable production agent loop in TS; used as the final arbitration layer over the deterministic core. `claude-sonnet-5` for bulk throughput, `claude-opus-4-8` for the critical/ambiguity-heavy judgment path. |
| Tool contracts | **Zod** schemas for every agent tool + every API input | Same Zod idiom already in the repo (`@hookform/resolvers`, `zod`). |
| Persistence | **Prisma 7 + Postgres** (Supabase or local `pg`) | Already wired in the repo (`prisma/`, `prisma.config.ts`, `@prisma/adapter-pg`). Persist batches/runs/reports. |
| Auth / roles | **Supabase Auth** (`@supabase/ssr`) | Already wired; gives roles (`owner`, `accountant`, `viewer`) for the close cockpit + approval of exception overrides. |
| Scheduler | **Vercel Cron** (or `node-cron` locally) for daily close runs | Zero extra infra; the daily-close loop is a natural scheduled job. |
| Ops / queue | **Upstash Redis** (`@upstash/redis` REST + ioredis TCP) + **BullMQ** queue/worker + **LangGraph** (`@langchain/langgraph` StateGraph + RedisSaver checkpointer) | Durable, queued close-runs; `npm run worker` consumes jobs. Everything degrades to in-process mode when Redis is unset. |
| Core engine | **Framework-agnostic TypeScript** in `harness/` — zero runtime deps | Run headless, scriptable, CI-friendly, unit-testable; shared by agent + app. |
| Testing | **Vitest** (unit: matching, judge confidence, exception classification, idempotency) + coverage (`@vitest/coverage-v8`) + **Playwright** smoke of the demo flows | The repo has no test command; we add a focused harness around the accuracy-critical core. |

> **LLM-everywhere is the trap.** We deliberately keep the model out of the deterministic matching
> path. Claude arbitrates only residual ambiguity, so match rate, precision and recall stay
> reproducible and honest. The agent is the companion that narrates, explains, and files exceptions —
> it never fudges a number.

---

## 4. Data model (Prisma)

All models live in the existing Prisma setup of `next-shadcn-admin-dashboard/prisma/`.

```
Tenant 1─n CloseRun 1─n SourceBatch ── FinRecord[]
Tenant 1─n FinRecord 1─n MatchLink        (record belongs to a reconcile group)
Tenant 1─n MatchGroup ── MatchLink
Tenant 1─n Settlement 1─n SettlementLine  (bound to matched records)
Tenant 1─n ForecastDatum
Tenant 1─n TaxCategory 1─n TaxLineMatch
Tenant 1─n AuditEvent         (append-only)
Tenant 1─n ExceptionRecord    (append-only, never deleted)
```

```prisma
model Tenant {
  id        String  @id @default(cuid())
  name      String
  currency  String  @default("INR")
  timezone  String  @default("Asia/Kolkata")
  financeCfg Json    // tolerance windows, resolve thresholds, tax maps
  runs      CloseRun[]
  records   FinRecord[]
  settlements Settlement[]
  forecasts ForecastDatum[]
  taxCategories TaxCategory[]
  audit     AuditEvent[]
  exceptions ExceptionRecord[]
  createdAt DateTime @default(now())
}

model CloseRun {           // one executed daily-close loop
  id          String   @id @default(cuid())
  tenantId    String
  status      String   @default("RUNNING") // RUNNING|DONE|FAILED
  batchRef    String?                    // external batch identifier
  totals      Json                      // {"records":81,"matched":66,"partial":2,"unresolved":13,"resolvedPct":81.48}
  reportPath  String?                   // CloseReport JSON/CSV artifact
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
  batches     SourceBatch[]
  matches     MatchGroup[]
  settlements Settlement[]
  forecasts   ForecastDatum[]
  audit       AuditEvent[]
}

model SourceBatch {         // one raw input file / export
  id        String   @id @default(cuid())
  runId     String
  name      String               // "razorpay-gateway" | "bank-utr" | "erp-orders" | "gst-invoices"
  format    String               // csv | json
  rowCount  Int
  ingestedAt DateTime @default(now())
  records   FinRecord[]
}

model FinRecord {            // normalized finance record
  id         String    @id @default(cuid())
  tenantId   String
  batchId    String
  source     String            // which source this came from
  kind       String            // PAYMENT|SETTLEMENT|REFUND|FEE|INVOICE|CHARGEBACK
  sourceRef  String            // gateway ref / UTR / invoice no (idempotency key per source)
  ts         DateTime          // value date
  amountPaise Int              // signed? use +In for inflow, -In for outflow
  currency   String @default("INR")
  counterparty String?         // merchant/beneficiary name (fuzzy match fodder)
  description String?          // raw line description (for LLM tax attribution)
  raw        Json?             // original row, preserved verbatim
  tenant     Tenant  @relation(fields:[tenantId], references:[id])
  batch      SourceBatch @relation(fields:[batchId], references:[id])
  links      MatchLink[]       // group membership
  @@index([source, sourceRef]) @@unique([source, sourceRef]) // per-source idempotency
}

model MatchGroup {           // a set of records judged to be the same underlying money movement
  id         String   @id @default(cuid())
  runId      String
  key        String            // canonical key of the group
  method     String            // EXACT | NORMALIZED | JUDGED | NETTED
  confidence Float             // final confidence of the group
  reason     String            // explainable line
  amountPaise Int              // reconciled amount
  links      MatchLink[]
  settlements Settlement[]
}

model MatchLink {
  id        String   @id @default(cuid())
  groupId   String
  recordId  String
  record    FinRecord @relation(fields:[recordId], references:[id])
  group     MatchGroup @relation(fields:[groupId], references:[id])
  matchedOn String   // "gatewayRef" | "utr" | "amountWindow" | "normalizedRef" | "judge"
  @@unique([groupId, recordId])
}

model Settlement {           // a settlement batch from the gateway to the bank
  id          String  @id @default(cuid())
  runId       String
  settledAt   DateTime
  amountPaise Int
  utrNumber   String?
  status      String          // EXPECTED | RECEIVED | MISSING | RECONCILED
  lagDays     Int?            // settlement lag vs value date
  lines       SettlementLine[]
}

model SettlementLine {
  id        String @id @default(cuid())
  settlementId String
  groupId      String
  amountPaise  Int
}

model ForecastDatum {        // forward cash projection point
  id        String @id @default(cuid())
  runId     String
  date      DateTime
  balancePaise Int
  deltaPaise Int               // net change vs previous
  confidence Float             // how much of this is grounded in matched data
  reconciledIn True @default(true)   // true if based on matched settlement lag
}

model TaxCategory {          // GST/HSN + ledger mapping (a small taxonomy)
  id        String @id @default(cuid())
  tenantId  String
  code      String            // HSN or GL code
  label     String            // e.g. "Business Services"
  description String?
  children  TaxLineMatch[]
}

model TaxLineMatch {
  id          String @id @default(cuid())
  runId       String
  recordId    String
  categoryId  String?
  matchedBy   String         // RULE | JUDGED
  confidence  Float
  reason      String
  record      FinRecord @relation(fields:[recordId], references:[id])
  category    TaxCategory? @relation(fields:[categoryId], references:[id])
}

model AuditEvent {           // APPEND-ONLY
  id        String   @id @default(cuid())
  tenantId  String
  runId     String
  actorType String            // AGENT | SYSTEM | USER
  actorId   String
  action    String            // INGEST|MATCH|JUDGE|SETTLE|FORECAST|TAX|EXCEPTION|CLOSE
  recordId  String?
  detail    Json?             // {"confidence":..,"reason":..,"source":..}
  createdAt DateTime @default(now())
  @@index([tenantId, createdAt]) @@index([runId])
}

model ExceptionRecord {      // the honest exceptions - never deleted
  id          String @id @default(cuid())
  tenantId    String
  runId       String
  recordId    String?
  recordJson  Json            // the offending record preserved in full
  reasonCode  String          // NO_KEY|AMOUNT_MISMATCH|PARTIAL_FLAP|DATE_SKEW|LOW_CONFIDENCE|DUPLICATE|UNKNOWN_SOURCE
  rationale   String          // human + model explainable line
  candidateIds String[]       // records it nearly matched (for review)
  status      String @default("OPEN") // OPEN|REVIEWED|OVERRIDDEN|RESOLVED
  createdAt   DateTime @default(now())
}

// The engine-side report shapes live in `harness/src/core/types.ts` and are mirrored in the app:
//   MatchBreakdown { records, matched, partial, unresolved, matchRate }  — explicit outcome split
//   UnresolvedLine { recordId, ref, expectedPaise, actualPaise, differencePaise, reason, confidence, status }
// These are what `CloseReport` carries alongside `totals` and `perSource`.
```

---

## 5. Domain rules & tolerance model (the numbers that make it "finance")

FinanceCore follows real finance-ops tolerances. These are configurable per tenant (`financeCfg`)
and are a big part of the story — they are what turns arbitrary "matching" into credible accounting.

| Rule | Default | Meaning |
|---|---|---|
| `PAISE_TOLERANCE` | `50` | Allow amount differences of ≤ ₹0.50 (fee/rounding) when matching |
| `DATE_WINDOW_DAYS` | `1` | Allow settlement/value dates within 1 day of each other |
| `RESOLVE_THRESHOLD` | `0.7` | Minimum judge confidence to count a residual match as resolved |
| `EXACT_THRESHOLD` | `1.0` | Hard key equality |
| `NORMALIZED_THRESHOLD` | `0.95` | Key equality after normalization |
| Fee netting | `NETTED` | A component differing beyond tolerance becomes a match group iff a real `FEE` record is present and `gross === settlement + fee(s)` within `PAISE_TOLERANCE`. Confidence `0.98`; never guessed. |
| `MAX_EXCEPTION_AGE` | `5` | Exceptions auto-flagged for a human if unresolved for 5 days |

---

## 6. Agent design (Claude via Vercel AI SDK)

### 6.1 Shared tool set — every financial assertion routes through FinanceCore

| Tool | Kind | Core module | Notes |
|---|---|---|---|
| `ingestSource(meta)` | action | IngestService | Loads a raw export; idempotent by source+ref |
| `runReconciliation(method)` | action | ReconciliationEngine | Run deterministic pass (EXACT→NORMALIZED) |
| `judgeCandidates(candidates, hint)` | **decision** | Judge | Resolve residual ambiguity; returns confidence+reason. Passed to Claude. |

Semantic residual (opt-in): the judge can be constructed with a `SemanticMatcher` (`semantic.ts`) to
boost clearly-similar near-misses. This is strictly residual-only and never changes the audited batch
unless an embeddings provider is supplied.
| `settlementQuery(query)` | read | SettlementService | Natural-language Q&A over the settled ledger |
| `forecastWindow(days)` | read | CashForecaster | Project forward cash with confidence intervals |
| `matchTaxLine(recordIds)` | decision | TaxMatcher | Assign tax categories; Claude fallback for ambiguous descriptions |
| `fileException(recordIds, reason)` | action | ExceptionLedger | Explicitly mark a record as unresolved (honest!) |
| `closeRun()` | **terminal** | CloseEngine | Finalize the run, emit the CloseReport (match rate + exceptions) |

**Hard rules:**
- The agent may *discuss* anything, but may not assert a match or resolve an exception except via the
  tools. Every decision the model influences returns a **confidence** and a **reason**.
- `closeRun` is the only terminal action; if confidence on any record is below `RESOLVE_THRESHOLD`
  it must be `fileException`'d, never silently marked done.
- All tools emit `AuditEvent`s; `closeRun` computes the aggregate and persists the `CloseReport`.

### 6.2 The daily-close loop (the demo narrative)

```
User: "Close today's books."
  Agent: ingestSource(gateway|bank|erp|gst)  → 81 records across 4 sources
         runReconciliation(EXACT)   → exact-key + fee-netted groups take most matches
         runReconciliation(NORMALIZED) → normalized/fuzzy residual groups
         judgeCandidates(...)       → arbitrate only the remaining residual ambiguity
         fileException(unresolved, <ReasonCode>) → honest exception list (never hidden)
         settlementQuery("which UTRs settled on 14 Aug?")
         forecastWindow(7)
         matchTaxLine(all unmatched expense lines)
  Agent: ✔ DONE — 66/81 matched (81.48%), 2 partial, 13 unresolved (exception list). Full report written.
```

### 6.3 Prompt & safety framing

- System prompt: *"You are the finance controller. You reconcile, settle, forecast and match tax.
  You never guess a match — you assign confidence and file exceptions when you are not sure. The
  decisive numbers are computed by the engine, not by you."*
- The model sees the reconciled groups, candidate lists, tolerance config, and previous exceptions —
  but the engine enforces thresholds in code.

---

## 7. API / route map (inside `next-shadcn-admin-dashboard`)

| Route | Purpose |
|---|---|
| `POST /api/close/runs` | Start a daily-close run (return runId). Enqueues a BullMQ `close-runs` job when `REDIS_URL` is set; otherwise runs synchronously in-process. |
| `GET /api/close/runs/:id` | Run status + progress + partial metrics |
| `POST /api/close/runs/:id/finalize` | Terminal — emits `CloseReport` (guarded by tenant role) |
| `GET /api/close/runs/:id/report` | Download `CloseReport.json` / `.csv` |
| `POST /api/close/upload` | **CSV upload** — raw CSV body or `payments.csv` / `settlements.csv` / `invoices.csv` multipart; parses, reconciles a fresh run (rate-limited, 10 MiB cap), returns `{ runId, report }` with `breakdown` + `unresolved` |
| `GET /api/close/exceptions` | The honest exception list (filterable by reasonCode/status) |
| `POST /api/close/exceptions/:id/resolve` | Accountant resolves/overrides an exception (audited) |
| `POST /api/close/agents/chat` | Streaming settlement Q&A (`ai` SDK) |
| `POST /api/close/agents/tools` | Direct tool invocation (internal, for the harness) |

**Ops / worker:** when `REDIS_URL` is set, `POST /api/close/runs` enqueues onto the BullMQ `close-runs`
queue and a separate worker process (`npm run worker` in `next-shadcn-admin-dashboard/`) consumes it,
driving the LangGraph `StateGraph` (`ingest → reconcile → judge → settle → forecast → tax →
fileExceptions → closeRun`) with a RedisSaver checkpointer and a Redis run-store. Without any Redis
env the same run executes in-process (graceful degradation).

> The cleanest path is to run the heavy lifting in the **harness** (engine + generator) and have the
> API layer call into it, so the Next.js app stays light and the accuracy logic stays untangled.

---

## 8. Dashboard UI map → existing repo conventions

Reuse the dashboard repo's `AGENTS.md` conventions: co-located screens at
`src/app/(main)/dashboard/<screen>/page.tsx` with `_components/`, entries in
`src/navigation/sidebar/sidebar-items.ts`, and existing cards/charts/components.

| Screen | Route | Builds on | Content |
|---|---|---|---|
| **Close Cockpit** | `/dashboard/close` | existing `finance` screen patterns (`overview-kpis.tsx`, `transactions-overview-card.tsx`) | Open/runs list, per-run summary KPI cards (records, resolved %, matched, exceptions), start-run button |
| **Run Detail** | `/dashboard/close/[runId]` | `@tanstack/react-table` grid | Match-rate KPIs, confidence distribution (recharts), per-source breakdown, reconciliation grid with tabs (Matched / Exceptions / Flaps) |
| **Exception List** | `/dashboard/close/exceptions` | `@tanstack/react-table` + `vaul` drawer + `sonner` | The honest list: reasonCode, record, rationale, status; resolve/override actions |
| **Settlement Q&A** | `/dashboard/close/settlement` | existing `chat` conventions + `ai` SDK streaming | Ask questions over the settled ledger; answers cite matched records |
| **Cash Forecast** | `/dashboard/close/forecast` | recharts `AreaChart` (like `income-breakdown`) | Next-7-day projection with confidence band; "grounded in X matched records" label |
| **Tax Match** | `/dashboard/close/tax` | `@tanstack/react-table` + chips | Matched lines by HSN/category, confidence badges |

Sidebar addition (in `src/navigation/sidebar/sidebar-items.ts`, Dashboards group):

```ts
{ id: "close", title: "Close", url: "/dashboard/close", icon: Calculator }
```

---

## 9. Build plan (phases)

> Order chosen so the **accuracy-critical core is built and verified first** — the bar is
> foundational, not decorative. Detailed file map in `BUILD_PLAN.md`.

- **Phase 0 — FinanceCore + spec + harness scaffold (test-first).** — **COMPLETED.** `spec.md`,
  `BUILD_PLAN.md`; modular `harness/` engine (types, ingest, reconcile, judge, settle, forecast, tax,
  exception, audit, close, batch runner) with **Vitest** unit tests + coverage (`@vitest/coverage-v8`).
  **Exit:** all core tests green, batch runner emits a report.
- **Phase 1 — Deterministic matching + synthetic ground-truth batch.** — **COMPLETED.**
  `ReconciliationEngine` exact + normalized passes + **fee netting** (`NETTED`); `generate-batch`
  produces the **81-record** batch across 4 sources with known labels (true matches, fee-netted legs,
  planted mismatches, duplicates, orphans). **Exit:** match rate, matched/partial/unresolved
  breakdown, and precision/recall computed against labels (66/2/13 → 81.48%).
- **Phase 2 — Agent loop.** — **COMPLETED.** Vercel AI SDK tool layer over the core; `ClaudeJudge`
  as the pluggable residual judge (with the optional `SemanticMatcher` from `semantic.ts`); headless
  `agent-driver`. **Exit:** a headless agent driver closes the batch and prints the report.
- **Phase 3 — Forecast + tax + semantic.** — **COMPLETED.** `CashForecaster` from settlement-lag
  distribution; `TaxMatcher` rules + Claude fallback; `semantic.ts` opt-in fuzzy residual
  (`NgramSemanticMatcher` default, `EmbeddingSemanticMatcher` opt-in). **Exit:** forecast + tax-match
  data in the report; audited batch unchanged without an embeddings key.
- **Phase 4 — Dashboard UI + CSV upload.** — **COMPLETED.** Co-located close screens + sidebar entry;
  API routes to the core including `POST /api/close/upload` (raw CSV or multipart). **Exit:** screens
  render real run/exception/forecast data from a completed run; CSV upload returns `{runId, report}`
  with breakdown + unresolved.
- **Phase 5 — Ops layer: Redis + LangGraph + BullMQ worker.** — **COMPLETED.** Upstash Redis
  (`UPSTASH_REDIS_REST_URL`/`TOKEN`) for reads/cache/run-store, ioredis `REDIS_URL` for BullMQ +
  LangGraph RedisSaver; `close-runs` queue + `npm run worker`; graceful in-process fallback. **Exit:**
  `npm run worker` consumes jobs; the app runs synchronously without Redis env.
- **Phase 6 — Hardening + coverage + ops README.** — **COMPLETED.** Exception "honesty" drill,
  `npm run test:cov` coverage gate, ReconAI README with demo + Ops/live-redis-worker section,
  final 81-record numbers locked. **Exit:** all drills pass; full report numbers reproducible.

---

## 10. Testing & verification plan

| Level | Scope | Tool |
|---|---|---|
| Unit | Matching rules (EXACT/NORMALIZED boundaries, tolerance, window), judge confidence assignment, exception classification, forecaster arithmetic, tax rules, batch idempotency | Vitest (in `harness/`) |
| Integration | `CloseEngine` end-to-end on the seeded batch: overall + per-source match rate, precision/recall vs ground-truth labels, exception list integrity | Vitest |
| CLI / headless | `npm run batch` — runs the 81-record audited batch, writes `CloseReport.json` + `.csv`, prints summary | tsx runner |
| E2E / smoke | Close Cockpit → Run Detail → Exception Drawer; settlement Q&A answer cites a matched record | Playwright |
| Demo drill | Force ambiguity (`LOW_CONFIDENCE`) and show it in the exceptions; show a resolved match's confidence + reason chip | scripted |

**Acceptance gate for "the bar":** for one full batch run we can show on one screen: (a) total
records processed, (b) resolved % with per-source breakdown, (c) precision/recall on the judged
subset, and (d) the complete, honest exception list with reason codes. If the list is empty because
we hid records, or the numbers were hand-picked, it fails.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| "Accuracy" looks good only because of one cherry-picked case | Ground truth labels in the generator; measured precision/recall; honest exception list; no per-record hiding |
| LLM hallucinating matches | Deterministic-first; Claude only arbitrates residual; confidence threshold enforced in code; reason provenance on every match |
| Model cost/latency on a 81-record batch | Bulk deterministic path is instant; only residual candidates hit the model; prompt caching + bounded rounds |
| Data not "real" (synthetic) | Generator mirrors real Razorpay/bank/ERP/GST formats; provenance recorded; easy to swap real exports later |
| Dashboard heavier than needed | Run heavy logic in `harness/`; Next.js app only thin API + UI; co-located screens per `AGENTS.md` |
| No API key in the demo environment | `HeuristicJudge` default keeps everything locally reproducible; Claude key is a plug-in |

---

## 12. Demo script (the 2-minute story)

1. **Run the batch headless:** `npm run batch` in `harness/` → prints `records=81 · sources=4 ·
   matched=66 · partial=2 · unresolved=13 · resolved=81.48%` and the explicit breakdown
   `Matched: 66 · Partial: 2 · Unresolved: 13`. It's a real number, from real rules, locked by
   `npm run test:cov`.
2. **Dashboard — Close Cockpit:** start a run, watch live KPIs climb as the batch is processed
   (locally in-process, or queued to `npm run worker` when `REDIS_URL` is set).
3. **Run Detail:** click a run → per-source match-rate bars, confidence distribution, the
   reconciliation grid. Click a resolved match → a chip explains *why* (`exact:utr`, conf `0.99`).
4. **The honesty moment:** open the **Exception List** — 12 records (2 partial + 10 unresolved) with
   reason codes and per-record `UnresolvedLine` expected-vs-actual. The agent files one as
   `LOW_CONFIDENCE` live and explains the candidates it considered.
5. **Settlement Q&A + Forecast:** "which UTRs settled on 14 Aug?" (answer cites matched records),
   then the 7-day cash forecast with a confidence band and the matched-lag grounding badge.

---

## 13. Out of scope (kept tight for a hackathon)

- Multi-tenant billing / onboarding SaaS → single demo tenant with seed data.
- Real money, real bank integration → Razorpay test mode + synthetic exports; adapters ready for real
  statements.
- A general ledger + double-entry accounting engine → we reconcile, settle, forecast and tax-match;
  we do not book journals.
- Full GST filing compliance → we match tax lines to categories/HSN; filing is out of scope.

---

*End of SPEC.md — planning artifact. Implementation proceeds per `BUILD_PLAN.md`, phases 0-first,
with the FinanceCore accuracy tests as the foundation.*
