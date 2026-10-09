# Prompt: Pulse Mobile, all phases in one session

Paste everything below the line into a new Claude Code session started in an empty directory `~/personal/pulse-mobile`
(the pulse web repo is at `~/personal/pulse`). The session runs every phase, fanning each phase's tasks out to
subagents, and stops for the owner's go between waves.

---

Goal: build `pulse-mobile`, the React Native (Expo) version of Pulse where every byte lives on the phone: Google
Health data pulled by the phone itself, SQLite, Pulse's own scoring, the same screens, no server. The plan is
`~/personal/pulse/docs/plans/2026-10-10-003-pulse-mobile-react-native-plan.md`: read it fully first, then
`~/personal/pulse/AGENTS.md`, `~/personal/pulse/docs/architecture/system-design.md` (sections 3 and 4) and
`~/personal/pulse/docs/plans/2026-10-08-007-backend-architecture-plan.md` section 2 (contracts) and 2.5 (hard to port).
The plan's stack, repository layout, data model, parity contract, phases, streams and done-when rules are the spec;
this prompt says how to run them.

## Ground rules
- Git identity adityaongit, git CLI only, never gh. Conventional commits, signed off. Commit only when I say so; never
  push to main; every wave lands as a pull request I merge.
- Report before changing: a decision not in the plan gets a short list of options and my answer first. Measure before
  fixing: no guess-patch loops, read the web app's original code beside every port.
- No local e2e or device automation. When something must be seen on a phone, tell me exactly what to run and look at.
- I am learning React Native. Explain each Expo and React Native choice in one or two lines when it is made, and keep
  `docs/learning.md` in the new repo current.
- Parity is the rule: `src/core` byte-identical to pulse, the pipeline's F3 and F4 fixture hashes equal, the view
  models reproduce F6. A stream that cannot reach parity reports the exact difference; it does not round it away.

## How to work: you orchestrate, agents build
- You do the Phase 0 scaffold yourself. Everything else is fanned out: one subagent per task or stream, in parallel,
  each in its own git worktree of `pulse-mobile` on a branch named after the task.
- Before every wave, show me the agent table (task, model, effort, files owned, files forbidden, the test or fixture
  that proves it) and wait for my go. Models: Sonnet by default; Opus for the pipeline port, the fixture export and the
  time port; Haiku for mechanical checks and screenshot sweeps.
- Every brief contains: the task's scope and done-when from the plan, the pulse files to read (path and lines), the
  files it owns, the files it must not touch, the fixture or test it must pass, "do not spawn agents, forks or
  workflows", "leave no background process running", "stop and report when done; do not widen scope". Briefs must
  stand on their own: an agent has no other context.
- While agents run, check `ListAgents` and `ps` for strays. When a wave reports, merge the branches yourself, resolve
  conflicts in shared files yourself (`schema.ts`, repository interfaces, tokens, the kit's exports change only in
  your hands, between waves), run `pnpm typecheck && pnpm lint && pnpm test`, review each port with the original open,
  then report and stop for my merge.

## Phase 0: scaffold and contracts (you, then one wave)
1. **You:** Expo SDK 54+, TypeScript strict, Expo Router, NativeWind, ESLint, Vitest, EAS config, pnpm. One screen that
   boots, opens expo-sqlite and runs an empty drizzle migration. Typecheck, lint, test green. This commit is the base.
2. **Agent, Opus:** copy `src/core` and `src/lib` from pulse unchanged; port `src/server/time.ts`; add
   `scripts/sync-core.sh`; the F5 time test under Node, plus how I run it under Hermes on my phone.
3. **Agent, Opus:** `scripts/export-mobile-fixtures.mts` in the pulse repo (a branch there, in a worktree of
   `~/personal/pulse`) writing F1 to F6 into `pulse-mobile/fixtures/`; run it; a loader and a test that F3's hashes
   equal pulse's `golden.test.ts` values for the current `SCORING_VERSION`.
4. **Agent, Sonnet:** `src/data/schema.ts` (drizzle SQLite) and the repository interfaces (signatures and row types,
   empty bodies) from the plan's data model; a test that the migration applies to an empty database.
5. **Agent, Sonnet:** `AGENTS.md` from the plan's rules and the pulse one; `docs/learning.md` seeded; `README.md`.
6. **Agent, Haiku:** `docs/google-console.md`: the Android and iOS OAuth client steps in the existing Google Cloud
   project (package name, SHA-1 from the EAS keystore, bundle id, the scopes of `src/server/sources/google/oauth.ts`).
Exit: the plan's Phase 0 exit; I do the Google console by hand and install a dev build.

## Phase 1: foundation (one wave, four agents)
Streams A to D of the plan, in parallel: **A data layer** (Sonnet), **B pipeline port** (Opus; starts on an in-memory
implementation of the repository interfaces, switches to A's when it lands), **C Google on the phone** (Sonnet),
**D UI kit** (Sonnet). Done-when per the plan's Phase 1 table. Exit: a dev build signs in to Google, backfills,
recomputes with F3 and F4 equal, and the kit screen renders every component at 390 px in light and dark.

## Phase 2: screens (one wave, six agents)
Streams E to J of the plan, in parallel, each porting its query files onto the repositories (F6 where a fixture
exists) and building its routes from the kit, route for route with `src/app/(app)`, same copy, same five metric
states and reason codes. E finishes the shared day strip and date switcher first and reports early so the others can
use them. Exit: every web route opens on my phone with my data; a screenshot sweep (Haiku) at 390 px, light and dark,
reviewed against the web app.

## Phase 3: coach, background, release (one wave, three agents)
**K coach** (Sonnet), **L background and notifications** (Sonnet), **M release** (Sonnet) per the plan's Phase 3
table. Exit: TestFlight and an internal Play track with my account; a morning notification arrives on both platforms
without opening the app, with the platform limits written down.

## After each phase
Stop with: what exists, what I must do by hand, what did not reach parity or done-when and why, and the next wave's
agent table. Never report a phase as done with a gap left unnamed.
