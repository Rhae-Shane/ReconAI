# DEPLOYMENT.md — ReconAI

Deploy the Next.js dashboard (`app/`) and optionally a durable BullMQ
worker. The deterministic harness in `harness/` has **no runtime deps** and is linked into the app
as `controller-harness` (`file:../harness`).

## Prerequisites

- Node.js 20+
- npm 10+
- Optional: Supabase (Postgres + Auth), Upstash Redis, OpenAI, Razorpay test keys

Local demo works with an empty `.env.local` — the engine falls back to in-memory / HeuristicJudge.

## 1. Local development

```bash
# core engine (tests + batch)
cd harness
npm i
npm test
npm run batch

# dashboard + API
cd ../app
cp .env.example .env.local   # fill what you need
npm i
npm run dev                  # http://localhost:3000
```

Optional durable worker (requires `REDIS_URL`):

```bash
cd app
npm run worker
```

## 2. Environment variables

Copy from `app/.env.example`. Summary:

| Variable | Required for | If unset |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + persisted app data | Seed / in-memory paths |
| `DATABASE_URL` | Prisma → Postgres | Skip DB; demo store |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Run-store, rate limit, cache | No-ops |
| `REDIS_URL` | BullMQ queue + LangGraph checkpointer + `npm run worker` | In-process close runs |
| `OPENAI_API_KEY` | Residual LLM judge, settlement chat, embeddings | HeuristicJudge + n-gram |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live test sync | CSV / 81-record batch |
| `RAZORPAY_WEBHOOK_SECRET` | `POST /api/webhooks/razorpay` HMAC | Unsigned webhooks rejected |

Never prefix Razorpay secrets with `NEXT_PUBLIC_`.

## 3. Database (optional)

```bash
cd app
# set DATABASE_URL in .env.local
npx prisma db push
# or apply SQL under supabase/
```

Schema lives in `prisma/schema.prisma` and mirrors `harness/src/core/types.ts`.

## 4. Vercel (recommended for the web app)

1. Import **https://github.com/Rhae-Shane/ReconAI**.
2. **Root Directory:** `app`.
3. Enable **Include source files outside of the Root Directory in the Build Step** so
   `file:../harness` resolves.
4. Framework Preset: Next.js. Build: `npm run build`. Install: `npm install`.
5. Add env vars from the table above in Project Settings → Environment Variables.
6. Deploy.

Webhook URL for Razorpay (test mode):

```
https://<your-vercel-domain>/api/webhooks/razorpay
```

Events: `payment.captured`, `refund.processed`, `settlement.processed`.

### Smoke checks after deploy

- `GET /api/health` → `{ service: "reconai", ... }`
- Open `/` → landing; `/dashboard/close` → Close Cockpit
- Upload CSV via Close flow or start the seeded batch run

## 5. Durable worker (production)

Vercel serverless is fine for the UI/API **without** `REDIS_URL` (synchronous in-process closes).

For queued / durable closes:

1. Provision Upstash Redis; set both REST vars **and** `REDIS_URL` (TCP / ioredis URI).
2. Run the worker on a long-lived host (Railway, Fly.io, Render, a VM):

```bash
cd app
npm i
npm run worker
```

3. Scale workers horizontally; BullMQ + RedisSaver keep run state shared.

## 6. CI

GitHub Actions (`.github/workflows/ci.yml`) runs:

1. `harness` — install, test
2. `app` — install, lint, typecheck, unit tests, ops verify, production build

## 7. Production checklist

- [ ] No secrets in the repo (`.env*` ignored; only `.env.example` committed)
- [ ] Razorpay keys are **test** mode until go-live review
- [ ] Webhook secret matches Dashboard → Webhooks
- [ ] `OPENAI_API_KEY` present if you want live residual judgment / chat
- [ ] Redis + worker only if you need durable queues at scale
- [ ] `npm run batch` / harness tests green on the release commit
