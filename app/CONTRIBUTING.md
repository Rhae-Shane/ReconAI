# Contributing to ReconAI

Thanks for helping improve **ReconAI**. This package is the Next.js app (`app/`); the reconciliation engine lives in `harness/`.

## Setup

```bash
# from repo root
cd harness && npm install && npm test

cd ../app
cp .env.example .env.local
npm install
npm run dev
```

## Layout

```
app/
├── src/app/                 # App Router (landing, auth, close screens)
├── src/components/          # Shared UI + landing
├── src/lib/close|ops|…      # Thin adapters over controller-harness
├── src/navigation/          # Sidebar registry
├── prisma/                  # Optional Postgres mirror of harness types
└── src/worker/              # BullMQ close-run worker
```

Co-locate screen UI: `src/app/(main)/dashboard/close/<screen>/page.tsx` + `_components/`, and register nav in `src/navigation/sidebar/sidebar-items.ts`.

## Rules of the road

- Types are owned by `harness/src/core/types.ts` — do not redefine them in the app.
- Currency is integer **paise** (signed).
- Deterministic matching first; LLM only for residual ambiguity when `OPENAI_API_KEY` is set.
- Never silently drop exceptions — use structured reason codes.

## Checks before a PR

```bash
npm run lint
npx tsc --noEmit
npm test
npm run verify:ops
npm run build
```

Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

## License

By contributing you agree your changes are licensed under the MIT License in this repo (Copyright © 2026 Rhae-Shane / ReconAI).
