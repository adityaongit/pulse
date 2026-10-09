# AGENTS.md

<!-- Whoop Design Guidelines -->
https://developer.whoop.com/assets/files/WHOOP%20-%20Brand%20%26%20Design%20Guidelines-bdea3554e94b4ea09e68695b1e8dc8e7.pdf

Guide for coding agents (and humans) working on Pulse: a self-hosted Next.js app that turns Fitbit Air data from the Google Health API into recovery, strain, sleep, Pulse Age, stress, Energy Bank and journal insights.

## Commands

| Command | What it does |
|---|---|
| `docker compose -f compose.dev.yaml up -d` | Postgres on localhost:5432 for `pnpm dev` and e2e |
| `pnpm seed:demo` | Local only: a demo account (`demo@pulse.local` / `pulse-demo-generated-data`) with 180 days of generated data, for a Google-mode dev server |
| `pnpm dev` | Dev server on :3000. With `DATA_SOURCE=demo` it seeds 180 days of demo data for the demo user |
| `pnpm typecheck` | `next typegen` + `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest: `*.test.ts` in Node, `*.test.tsx` in happy-dom |
| `pnpm e2e` | Playwright sweep and journeys on its own dev server (:3300, `.next/e2e`, throwaway DB), plus a profile-less one on :3301 for the onboarding journey |
| `pnpm db:generate` | New drizzle migration from `src/server/db/schema.ts`. Migrations run at boot |

Run `pnpm typecheck && pnpm lint && pnpm test` before every commit. Run `pnpm e2e` after UI changes.

## Layout

- `src/core/`: pure TypeScript with no I/O.
  - `scoring/` is the port of noop's analytics (baselines, recovery, strain, sleep, readiness, training load, illness, HR recovery).
  - `algorithms/` holds Pulse's own models: healthspan, strain target, sleep planner, energy bank, stress, SRI, fitness level, health monitor, journal impact and reports.
- `src/server/`: server-only code: the database, sources (`seed/` demo data, `google/` OAuth + Health API), the sync worker, the two-stage `pipeline/` (stage 1, stage 2 and one scorer per score in `scores.ts`), and `queries/` (one view model per screen, with reason codes).
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

- **Scales.** Core keeps Effort on 0–100. `toStrainScale` (×21/100) is applied only for display and in Strain Target. Recovery's `sleepPerf` is on [0, 1].
- **Causality.** A day's scores depend only on that day and earlier days. Baselines fold from earlier nights only. Never let a later night change history.
- **Honest states.** Every nullable metric is `{ value, reason, provisional }`, using the reason codes in `src/lib/reasons.ts`. Never show a fabricated number.
- **UI.** Build only from shells and kit components, using Tailwind utilities and the tokens in `globals.css`. No new CSS files, and no breakpoint logic inside feature components. Every metric renders its five states through `MetricState`. Spec decisions and deviations live in `docs/design/spec.md` §11.
- **Auth.** better-auth (`src/server/auth.ts`, Drizzle adapter on Postgres): sign-up with name, username and email, gated by the sign-up mode (invite / open / closed, admin panel, else `SIGNUP`) in the `user.create.before` hook; an `ADMIN_EMAILS` address may sign up only while the server has no accounts; sign-in by username or email. Admins (`src/server/admin.ts`: owners plus `user.role = 'admin'`) use `/admin`; its actions check `isAdmin` themselves. `src/proxy.ts` only checks that a session cookie exists; the `(app)` layout looks the session up and sends users without a profile to `/onboarding`. Every Server Action calls `currentUser()` and every route handler `requestUser(req)` itself; never rely on the proxy alone. The profile, including the user's time zone, lives in the database (`src/server/profile.ts`), never in `.env`.
- **Copy.** User-facing text says Pulse and Pulse Age.
- **Landing site.** `site/` (Astro) is the public landing page and must always show the app as it is today. Any change to a feature, screen, component UI or theme token in the app updates the site in the same pull request:
  - recapture the app's screens with `pnpm screens` in `site/` against a demo app (`DATA_SOURCE=demo pnpm dev -p 3317`), so every device frame and feature card shows the current UI;
  - add, rename or remove the feature in `site/src/pages/index.astro` (hero, feature bento, "Also in Pulse", coach, FAQ) and in `site/src/data/metrics.ts` when it is a score;
  - keep `site/src/styles/global.css` tokens equal to `src/app/globals.css`;
  - check the landing page on a phone (390 px) and a laptop (1440 px) before pushing.
- **Blog and comparisons.** Posts are Markdown in `site/src/content/blog/`, dated in the past, never before an event they describe (plan and dates: `docs/plans/2026-10-09-001-blog-and-comparisons.md`); a post that quotes newer facts gets an `updated` date. Diagrams are ```sketch blocks (`docs/blog-diagrams.md`). No page that names WHOOP shows the app's screens: posts and comparison pages carry no device frames, and the landing page names WHOOP only in the not-affiliated notice. Never call Pulse "WHOOP-style" or say it looks like any product.
- **Tests.** Algorithms get golden-value or property tests beside the file. Queries get tests on a temp DB built with `src/server/testing.ts`.
- **Design references.** `docs/design/reference/` is gitignored and holds third-party screenshots. Never commit or publish it.
- **Git.**
  - Use the `git` CLI only, never `gh`.
  - Commit as the `adityaongit` identity.
  - Use conventional commit messages, signed off (`git commit -s`).
  - `main` is protected (`.github/rulesets/main.json`): work on a branch and land it through a pull request with green CI. See CONTRIBUTING.md and docs/maintainers.md.
- **Secrets.** Never log tokens or API response bodies. `.env` and `backups/` are gitignored.
- **Coach.** `src/server/coach/` (AI SDK 7: read `node_modules/ai/docs/`, not older snippets). Tools are closed over the session's `QueryCtx`; the model never names a user. The read tools only read. The log tools (`logTools.ts`) write through `src/server/logging.ts`, the log sheets' path, and only after the user taps Log: `coachApproval` makes every one wait, and the answer comes back as approval ids and yes/no only, applied to the saved chat (`approvals.ts`), never as client-sent tool input. Cycle log tools exist only on a female profile. Each user's provider key is encrypted (`crypto.ts`) and never reaches the browser, logs or exports. No user-supplied base URLs. The instructions and every tool and parameter description come from `texts.ts` (defaults) overridden by the admin dashboard's versions in `coach_prompts`; a new tool or parameter needs its entry in `TOOL_DOCS` (a test checks they match). Tests and e2e use `COACH_MOCK=true` (scripted model; refused in production).
- **Admin dashboard.** `src/app/admin/` is its own frame, not the app shell; every page calls `adminGate()` and every action checks `isAdmin` itself. It never shows health data. Password reset is owner-only. `pnpm seed:people` fills a local database with sample people and invites.
- **Users.** Every per-user table has `user_id`; every query and write filters on it (`ctx.userId`). `src/server/queries/isolation.test.ts` checks no screen leaks another user's data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
