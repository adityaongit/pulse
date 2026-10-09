# Prompt: Pulse Mobile, Phase 0

Paste everything below the line into a new Claude Code session started in an empty directory `~/personal/pulse-mobile`
(the pulse web repo is at `~/personal/pulse`).

---

Goal: start `pulse-mobile`, the React Native (Expo) version of Pulse where every byte lives on the phone. The plan is
`~/personal/pulse/docs/plans/2026-10-10-003-pulse-mobile-react-native-plan.md`; read it fully first, then
`~/personal/pulse/AGENTS.md`, `~/personal/pulse/docs/architecture/system-design.md` (sections 3 and 4) and
`~/personal/pulse/docs/plans/2026-10-08-007-backend-architecture-plan.md` section 2 (contracts) and 2.5 (hard to port).

## Ground rules
- Git identity adityaongit, git CLI only, never gh. Conventional commits, signed off. Do not commit until I say so.
- Report before changing: when a decision is not in the plan, list the options and ask. Measure before fixing.
- No local e2e or device automation; I run the app on my phone myself when you ask me to.
- I am learning React Native. Explain each Expo and React Native choice in one or two lines when you make it, and
  keep a running `docs/learning.md` in the new repo with those notes.

## How to work: fan out
- You are the orchestrator. Do the scaffold (task 1) yourself, then fan out tasks 2 to 6 to subagents running in
  parallel, one agent per task, each in its own git worktree of `pulse-mobile` on a branch named after the task.
- Before launching, show me the agent table (task, model, effort, files it owns) and wait for my go. Models: Sonnet
  by default; Opus only where parity arithmetic is at stake (the fixture export and the time port); Haiku for
  mechanical checks.
- Every brief must contain: the task's scope and done-when from this prompt and the plan, the files it owns, the
  files it must not touch (the other tasks' files, and `src/data/schema.ts` once task 4 owns it), the fixture or test
  it must pass, "do not spawn agents, forks or workflows", "leave no background process running", and "stop and
  report when done; do not widen scope". Write the briefs so an agent with no other context can do the task.
- While agents run, check `ListAgents` and `ps` for stray processes. When all report, merge their branches yourself,
  resolve conflicts in shared files yourself, run `pnpm typecheck && pnpm lint && pnpm test`, and report.

## Phase 0 tasks
1. **Scaffold (you):** Expo SDK 54+, TypeScript strict, Expo Router, NativeWind, ESLint, Vitest, EAS config, pnpm.
   One screen that boots, opens expo-sqlite and runs an empty drizzle migration. `pnpm typecheck && pnpm lint &&
   pnpm test` green. Commit this as the base the agents branch from (I will say when).
2. **Core copy and time port (agent, Opus):** copy `src/core` and `src/lib` from pulse unchanged; port
   `src/server/time.ts`; add `scripts/sync-core.sh`; the F5 time test runs under Node and the agent writes how to run
   it under Hermes on my phone.
3. **Fixtures (agent, Opus):** write `scripts/export-mobile-fixtures.mts` in the pulse repo (on a branch there, in a
   worktree of `~/personal/pulse`) that writes F1 to F6 from the plan's parity contract into `pulse-mobile/fixtures/`,
   run it, and add the loader plus a test that F3's hashes equal pulse's `golden.test.ts` values for the current
   `SCORING_VERSION`.
4. **Schema and repository interfaces (agent, Sonnet):** `src/data/schema.ts` (drizzle SQLite) and the repository
   interfaces (signatures and row types only, empty bodies) from the plan's data model; a test that the migration
   applies to an empty database.
5. **AGENTS.md and docs (agent, Sonnet):** `AGENTS.md` for the new repo from the plan's rules and the pulse one;
   `docs/learning.md` seeded with the stack choices; `README.md`.
6. **Google console checklist (agent, Haiku):** the steps for the Android and iOS OAuth clients in the existing
   Google Cloud project (package name, SHA-1 from the EAS keystore, bundle id, the same scopes as
   `src/server/sources/google/oauth.ts` SCOPES), as `docs/google-console.md` for me to do by hand.

Then stop: a summary of what exists, what I must do by hand, and the proposed Phase 1 agent table (streams A to D
from the plan, with models and effort).
