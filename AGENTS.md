# AGENTS.md

Guide for coding agents (and humans) working on Pulse: a self-hosted Next.js app that turns Fitbit Air data from the Google Health API into recovery, strain, sleep, Pulse Age, stress, Energy Bank and journal insights.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server on :3000. With `GOOGLE_OAUTH_ENABLED=false` it seeds 180 days of demo data into `data/demo.db` |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: `*.test.ts` in Node, `*.test.tsx` in happy-dom |
| `pnpm e2e` | Playwright sweep and journeys on its own dev server (:3300, `.next/e2e`, throwaway DB) |
| `pnpm db:generate` | New drizzle migration from `src/server/db/schema.ts`. Migrations run at boot |

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. Run `pnpm e2e` after UI changes.

## Layout

- `src/core/`: pure TypeScript with no I/O.
  - `scoring/` is the port of noop's analytics (baselines, recovery, strain, sleep, readiness, training load, illness, HR recovery).
  - `algorithms/` holds Pulse's own models: healthspan, strain target, sleep planner, energy bank, stress, SRI, fitness level, health monitor, journal impact and reports.
- `src/server/`: server-only code: the database, sources (`seed/` demo data, `google/` OAuth + Health API), the sync worker, the two-stage `pipeline.ts`, and `queries/` (one view model per screen, with reason codes).
- `src/components/`:
  - `ui/` holds the shadcn primitives.
  - `shells/` holds the layout: AppShell, PageShell, DetailShell, the headers, sheets and calendar.
  - `metrics/` and `charts/` hold the kit components.
  - `brand/` holds the wordmark and mark.
- `src/app/(app)/`: routes. Each page is a Server Component that calls its query and composes shells with kit components.
- `docs/`:
  - `plans/` is the build plan.
  - `design/` holds `spec.md` (the UI contract), `sticky.md`, `orb.md`, `brand.md`, the audits, and `algorithms/` (one spec per algorithm).

## Rules

- **Scales.** Core keeps Effort on 0–100. `toWhoopStrain` (×21/100) is applied only for display and in Strain Target. Recovery's `sleepPerf` is on [0, 1].
- **Causality.** A day's scores depend only on that day and earlier days. Baselines fold from earlier nights only. Never let a later night change history.
- **Honest states.** Every nullable metric is `{ value, reason, provisional }`, using the reason codes in `src/lib/reasons.ts`. Never show a fabricated number.
- **UI.** Build only from shells and kit components, using Tailwind utilities and the tokens in `globals.css`. No new CSS files, and no breakpoint logic inside feature components. Every metric renders its five states through `MetricState`. Spec decisions and deviations live in `docs/design/spec.md` §11.
- **Copy.** User-facing text says Pulse and Pulse Age.
- **Tests.** Algorithms get golden-value or property tests beside the file. Queries get tests on a temp DB built with `src/server/testing.ts`.
- **Design references.** `docs/design/reference/` is gitignored and holds third-party screenshots. Never commit or publish it.
- **Git.**
  - Use the `git` CLI only, never `gh`.
  - Commit as the `adityaongit` identity.
  - Use conventional commit messages.
- **Secrets.** Never log tokens or API response bodies. `.env`, `data/` and `*.db` are gitignored.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
