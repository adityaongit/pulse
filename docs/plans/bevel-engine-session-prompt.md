# Prompt: Bevel engine session

Paste everything below the line into a new Claude Code session, started from the repo root.

---

Goal: add a "Bevel engine" for Pulse's scoring, built from our Bevel 3.1.7 research, selectable per metric family from the admin panel. With every toggle off, Pulse must behave byte-for-byte as it does today.

## Ground rules
- Work on a new branch created from `belevel/research` (it holds the research, commit 8c4833d). Git identity must be adityaongit. Use the git CLI only, never gh. Do not commit until I approve.
- Read CLAUDE.md and your memory first. Before you say "done", sweep your output for "not traced / pending / assumed / TODO / gap". Ask me before launching any subagents, and give each one the cheapest model that can do it.
- Do NOT change any metric that the Google Health API provides directly: HRV, resting HR, SpO2, respiratory rate, skin temperature, VO2 max, steps, calories, distance, weight, body fat, zones, sleep stages as delivered, and so on. These stay as stored inputs. Where Bevel derives one of these itself (for example Bevel computes RHR from sleep HR, or HRV as the mean of samples in the sleep window), we keep Google's value as the input and record the divergence in the design doc.
- No speculative scope: only families where the Bevel algorithm is fully recovered AND Pulse already has the inputs (or the inputs need only a small connector addition, which I approve separately).

## Sources
- `docs/research/bevel/`:
  - README.md: status table, dependency graph, "What the IPA cannot give"
  - the family docs: recovery-stress-energy, sleep, strain-load, biological-age-muscular, nutrition-tdee, other-calculators
  - shared-machinery.md: windows, baselines, gates, rounding
  - pulse-gaps.md: Pulse vs Bevel per family, plus 18 decisions for me
  - evidence/: raw findings, only for disputes
- Current Pulse algorithms:
  - `src/core/scoring/*`, `src/core/algorithms/*`
  - pipeline: `src/server/pipeline/` (stage1.ts, stage2.ts, scores.ts, types.ts with `SCORING_VERSION`)
  - docs: `docs/algorithms/*`
  - origins: `docs/research/noop-parity-audit.md`, `docs/research/bevel-vs-pulse-algorithms.md`, and git history (which algorithms were imported from noop and which are custom)
- System design: `docs/architecture/system-design.md`. Backend plan: `docs/plans/2026-10-08-007-backend-architecture-plan.md`. Stay consistent with its layering: a pure scoring core, so it ports to Go later.
- Admin settings: the `server_settings` table (key/value) and `src/server/admin.ts`, `src/app/admin/`.

## Phase 1: design doc only, then STOP for my review
Write `docs/plans/<today>-008-bevel-engine.md` with:

1. **Comparison matrix:** one row per Pulse score/algorithm and per Bevel family. Columns:
   - current file
   - origin (noop-imported / custom), with evidence
   - Bevel counterpart, with a doc link
   - input availability in Pulse (file:line), and which inputs are Google-provided and therefore untouched
   - output shape and scale differences (for example, Bevel Strain has no 0-21 scale; its max is about 128.8)
   - decision: replace behind toggle / new family behind toggle / keep Pulse only / blocked by missing input
2. **Engine selection design.** My preferred direction; challenge it if you have something better:
   - One admin setting, `scoring_engine`, stored in `server_settings` as JSON: `{ [family]: "pulse" | "bevel" }`. Missing means "pulse". Shown in the admin panel as one switch per family, with its dependency notes (for example, Bevel Target Strain needs Bevel Recovery and Strain).
   - Dispatch happens once at the pipeline level through a family → implementation map. The scoring core stays pure and I/O-free. Put Bevel implementations in `src/core/bevel/<family>.ts` with the same input types as the Pulse versions where possible.
   - Compute ONLY the active engine per family. Never store both, so DB size does not double.
   - Switching a toggle invalidates scores: store an engine signature (a hash of the active map plus SCORING_VERSION) per `daily_scores` row (new column) or fold it into the version check, so `needsRecompute` triggers. Recompute in the background through the existing per-user worker, one user at a time. Show progress in admin.
   - Payloads: reuse the existing JSONB column where a family replaces a Pulse family, and add an `engine` field inside the payload so view mappers (`src/app/(app)/_lib/view`) render the right scale and labels. Add new columns only for families with no Pulse counterpart (for example muscular load/freshness, sleep bank/consistency). List every migration with its size impact per user-day.
3. **UI impact per family:** scale, labels, bands, status chips and calibration states. Bevel's presentation rules are in shared-machinery.md G09 and the family docs.
4. **Connector additions** needed for any family (for example intraday `heartRateVariability` samples for Stress), each marked as needing my approval. Do not implement them in this project unless I approve.
5. **The 18 "decisions for the user" from pulse-gaps.md:** copy them in, each with your recommendation (for example: copy Bevel's EPOC sign bug or not, Energy Bank seeding at 0, the default age of 40).
6. **Test plan:**
   - With all toggles off, the existing golden/parity/pipeline tests must pass unchanged (byte-identical `daily_scores`).
   - Per Bevel family, unit tests from the doc's pseudocode and boundary cases (each family doc and README list boundaries and reference cases).
   - A determinism test.
   - A toggle-switch test: switching invalidates, recomputes and is idempotent.
7. **Implementation order** that follows the dependency graph (Recovery and Sleep before Target Strain and Energy Bank), with an effort estimate per family.

Stop after Phase 1 and wait for my answers.

## Phase 2 (after approval)
- Implement family by family. Each family is one reviewable change: core function, dispatch entry, migration if any, view mapper, tests and a docs/algorithms note.
- Keep the Pulse engine untouched. Run the full test suite after each family.
- Verify UI changes on the local dev server with screenshots at 390 px and 1440 px before any push.
