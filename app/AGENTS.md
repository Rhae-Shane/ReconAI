# AGENTS.md — ReconAI app

## Project overview

**ReconAI** reconciles Razorpay payments, bank UTRs, ERP, and GST lines: deterministic matching first, AI only for residual ambiguity, honest exception reporting.

This directory (`app/`) is the Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui surface. Core logic lives in `../harness` (`controller-harness`).

This repo uses the shadcn `radix-nova` style. Inspect local wrappers in `src/components/ui/` before assuming primitives.

<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

## Setup

```bash
npm install
npm run dev
```

| Command | Purpose |
|---|---|
| `npm run build` | Production build |
| `npm run lint` / `check` | Biome |
| `npm test` | Vitest |
| `npm run verify:ops` | Ops fallbacks |
| `npm run verify:reconcile` | Reconcile smoke |
| `npm run worker` | BullMQ worker |
| `npm run benchmark` | Harness bench |

## Co-location

- Close screens: `src/app/(main)/dashboard/close/<screen>/page.tsx`
- Screen components: `…/<screen>/_components/`
- Shared dashboard chrome: `src/app/(main)/dashboard/_components/`
- Shared components: `src/components/`
- Domain adapters: `src/lib/close/`, `src/lib/ops/`, `src/lib/razorpay/`
- Sidebar: `src/navigation/sidebar/sidebar-items.ts`

Keep feature code next to its route until it is reused.

## Extending a screen

1. Mirror an existing close screen (`exceptions`, `settlement`, `forecast`, …) — not removed template demos.
2. Prefer Server Components; isolate client interactivity.
3. Register nav in `sidebar-items.ts` when needed.
4. Import types from `controller-harness` / harness — never fork money types.
5. Use semantic theme tokens for light/dark + presets.

## Code conventions

- TypeScript strict; avoid `any`.
- `@/` import aliases.
- Biome: double quotes, semicolons, 2-space indent, sorted imports, 120-char width.
- Conventional commits (`feat:`, `fix:`, `docs:`, …).
- Follow `CONTRIBUTING.md`.
