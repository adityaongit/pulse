# Residual review findings

The findings left open after the Pulse v1 code review (ce-code-review run `20261003-100049-affd8291`). Line numbers are for commit `c36814c`.

Fixed after the review: #2 sync on Google connect (`04bac0d`), #6 clearing a check-in answer (`8ac7902`), #24 recompute after a check-in (`f40453a`), #7 DateSwitcher rapid steps (`8bdece1`) and #11 one age helper (`c36814c`).

## Known residuals

| # | Sev | Where | Finding | Why it is deferred |
|---|---|---|---|---|
| 1 | P1 | `src/server/pipeline.ts:551` | `pipeline.ts` is about 1,030 lines, and `stage2()` is a loop body of about 440 lines. | A structural split into a `pipeline/` folder with per-score functions. It needs its own refactor pass, guarded by the golden and determinism tests. |
| 3 | P2 | `src/server/pipeline.ts:392` | Stage 1 stamps the new `scoring_version` before stage 2 finishes, so a crash between stages hides stale stage-2 columns from `needsRecompute`. | It changes the version contract between stages and needs a failure-injection test. Rare in practice: stage 2 is synchronous and runs right after stage 1. |
| 4 | P2 | `src/server/sources/google/sync.ts:213` | Sleep and exercises deleted in Fitbit stay in the DB and keep scoring. | The fix assumes the Health API omits deleted points rather than returning tombstones. That needs checking against live payloads first. |
| 5 | P2 | `src/server/sources/google/client.ts:203` | The `raw_payloads` archive grows without bound. There is no retention. | Needs a decision on how long to keep evidence of schema drift (e.g. 30 days) and on WAL checkpointing. Growth is slow for one user. |
| 10 | P2 | `src/server/pipeline.ts:600` | Stage 2 builds each day's row as `Record<string, unknown>`, keyed by a separate `cols` list (`:961`). Neither is linked to the types. | Best done together with #1, which reshapes the same code. |
| 12 | P2 | `src/server/queries/common.ts:213` | The strength-activity regex (also `pipeline.ts:502`) and the effort-to-strain scale (`pipeline.ts:909`, `common.ts:163`) are duplicated between the pipeline and the queries. | Needs a shared home that both layers may import, and a scoring-version bump if the pipeline copy changes. Low churn today. |
| 19 | P3 | `NOTICE:9` | The noop credit named only `src/core/scoring/`. | Already fixed: the credit at `NOTICE:9-13` now also covers the healthspan, stress, health monitor and sleep planner models in `src/core/algorithms/`. |
