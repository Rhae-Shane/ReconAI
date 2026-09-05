# ReconAI — App

Next.js UI, API routes, and optional BullMQ worker for **ReconAI** (settlement reconciliation controller).

The deterministic engine lives in [`../harness`](../harness). This package is a thin surface over it.

## Quick start

```bash
cp .env.example .env.local   # empty is fine for the local demo
npm install
npm run dev                  # http://localhost:3000
```

Optional: `npm run worker` when `REDIS_URL` is set.

## Scripts

| Command | What |
|---|---|
| `npm run dev` | Dev server (Turbopack, port 3000) |
| `npm run build` / `npm start` | Production build + serve |
| `npm test` | Vitest unit tests |
| `npm run verify:ops` | Ops / Redis fallback checks |
| `npm run verify:reconcile` | Reconciliation smoke |
| `npm run benchmark` | Harness CloseEngine bench |
| `npm run worker` | Durable close-run worker |

## Routes

| Screen | Path |
|---|---|
| Landing | `/` |
| Close Cockpit | `/dashboard/close` |
| Run Detail | `/dashboard/close/[runId]` |
| Exceptions | `/dashboard/close/exceptions` |
| Trust | `/dashboard/close/trust` |
| Settlement Q&A | `/dashboard/close/settlement` |
| Forecast | `/dashboard/close/forecast` |
| Tax | `/dashboard/close/tax` |
| Metrics | `/dashboard/close/metrics` |

## Env

See [`.env.example`](./.env.example). Redis, OpenAI, Razorpay, Supabase, and Postgres are all optional — the demo falls back to in-memory + HeuristicJudge.

## License

MIT — see [LICENSE](./LICENSE). Repo: [github.com/Rhae-Shane/ReconAI](https://github.com/Rhae-Shane/ReconAI).
