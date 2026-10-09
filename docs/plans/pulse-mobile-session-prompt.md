# Prompt: Pulse Mobile, Phase 0

Paste everything below the line into a new Claude Code session started in an empty directory `~/personal/pulse-mobile`
(the pulse web repo is at `~/personal/pulse`).

---

Goal: start `pulse-mobile`, the React Native (Expo) version of Pulse where every byte lives on the phone. The plan is
`~/personal/pulse/docs/plans/2026-10-10-003-pulse-mobile-react-native-plan.md`; read it fully first, then
`~/personal/pulse/AGENTS.md`, `~/personal/pulse/docs/architecture/system-design.md` (sections 3 and 4) and
`~/personal/pulse/docs/plans/2026-10-08-007-backend-architecture-plan.md` section 2 (contracts) and 2.5 (hard to port).

## Ground rules
- This session does Phase 0 only, by hand, no subagents. Stop and report at the end of Phase 0; Phase 1 starts in the
  next session with the stream agents, after I approve the model/effort table.
- Git identity adityaongit, git CLI only, never gh. Conventional commits, signed off. Do not commit until I say so.
- Report before changing: when a decision is not in the plan, list the options and ask. Measure before fixing.
- No local e2e or device automation; I run the app on my phone myself when you ask me to.
- I am learning React Native. Explain each Expo and React Native choice in one or two lines when you make it, and
  keep a running `docs/learning.md` in the new repo with those notes.

## Phase 0, in order (from the plan)
1. Scaffold: Expo SDK 54+, TypeScript strict, Expo Router, NativeWind, ESLint, Vitest, EAS config, pnpm. One screen
   that boots, opens expo-sqlite and runs an empty drizzle migration. `pnpm typecheck && pnpm lint && pnpm test` green.
2. Copy `src/core` and `src/lib` from pulse unchanged; port `src/server/time.ts`; add `scripts/sync-core.sh`.
3. Fixtures: write the export script in the pulse repo (`scripts/export-mobile-fixtures.mts`, a branch there) that
   writes F1 to F6 from the plan's parity contract into `pulse-mobile/fixtures/`. Run it. Add the F5 time test and run it
   under Node; tell me how to run it under Hermes on my phone.
4. `src/data/schema.ts` and the repository interfaces (signatures and row types only) from the plan's data model.
5. `AGENTS.md` for the new repo, from the plan's rules.
6. Google console steps for the Android and iOS OAuth clients, as a checklist for me (I do the console).

Then stop: a summary of what exists, what I must do by hand, and the proposed Phase 1 agent table.
