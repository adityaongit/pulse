# Pulse: open tasks

Work through these one at a time, top to bottom. Each task says what kind of work it is: **Read**, **Review**, **Decide**, **Measure** or **Do**. Tick it when done. Updated 2026-10-09. Measurements and the first fixes: [plans/2026-10-09-002-app-speed-measured.md](plans/2026-10-09-002-app-speed-measured.md).

## 1. Close out what is already on the branch

- [x] **1.1 Review: the uncommitted service-worker fix.** (on main as 4cbae91) `public/sw.js` now names its cache per build (`pulse-static-<build id>`), so each deploy deletes the previous build's files. Read the 3-line diff (`git diff public/sw.js`).
- [x] **1.2 Do: commit the new docs and the SW fix** once 1.1 is approved. (docs brought to main 2026-10-09)
  - `docs/architecture/system-design.md`
  - `docs/plans/2026-10-08-007-backend-architecture-plan.md`
  - `docs/plans/scale-10k-users.md`
  - `docs/plans/bevel-engine-session-prompt.md`
  - `docs/tasks.md`
  - `public/sw.js`
- [ ] **1.3 Measure (after the next deploys): site data.** In DevTools → Application → Cache Storage there should be exactly one `pulse-static-…` cache, about 2-3 MB, after two or three deploys.

## 2. Understand the system (read and audit)

- [ ] **2.1 Read: `docs/architecture/system-design.md`.** It covers topology, frontend, backend, the ER diagrams, caching at every layer, the end-to-end flows and the known bottlenecks. Note questions as you go.
- [ ] **2.2 Review: ask the questions from 2.1** in a session and get them answered with file:line references. Fix the doc where it is wrong.
- [ ] **2.3 Read: `docs/plans/2026-10-08-007-backend-architecture-plan.md`.** It covers target layers, Go-port contracts, refactors R1-R14, tiering and the TimescaleDB decision (R7), and phases.
- [ ] **2.4 Decide: which refactors and in what order.** Mark each R1-R14 as do now, later or never.

## 3. Measure production (needed before big backend decisions)

- [x] **3.1 Measure: real heart-rate storage.** 31,000 to 37,700 samples a day, about 160 KB per user-day; `hr_days` is 90 MB of 150 MB. Run on production Postgres:
  - rows, samples per day and bytes per day of `hr_days` per user
  - total size of each table

  Local numbers were demo data. Real Fitbit is about 37,000 samples a day.
- [x] **3.2 Measure: recompute time.** 340 to 810 ms per user on production (stage 1 on 0 to 3 days). Read the production logs for `[pipeline] user … recomputed in … ms`. Note stage 1 and stage 2 times and how they grow with history.
- [ ] **3.3 Measure: Google calls per sync,** and how many return new data. This sets the per-type sync cadence.
- [ ] **3.4 Decide: hot window (30 days suggested) and the TimescaleDB question,** using 3.1. The plan says "not now", but that reasoning used wrong per-sample numbers. Re-check it with real data.

## 3b. The phone, measured 2026-10-09

- [x] **Measure: where the 3 to 5 s goes.** Server render 115 to 235 ms per page; on a 4x-throttled phone the chart commit took 2.5 s, 1.9 s of it in forced reflows from Recharts' text measurement.
- [x] **Do: Recharts measures text on a canvas** (`patches/recharts@3.10.1.patch`): forced reflows 436 to 8 on the Sleep page.
- [x] **Do: app resume asks `/status` instead of re-rendering every screen** (`ShellStatusProvider.recheck`).
- [ ] **Do: lazy-load the coach page** so its 332 KB AI SDK and zod chunk leaves the prefetch set.
- [ ] **Measure on the real phone** after the next deploy: open the app after 10 minutes away, then tap Sleep and Strain.

## 4. Backend fixes (one at a time, each with tests)

Follow the order chosen in 2.4. The likely first steps, smallest and safest first:

- [x] **4.1 Do: journal check-in must not force a full Google sync per tag** (`requestSync({ pull: false })`) (`src/server/actions/journal.ts:55`). Plan R5.
- [ ] **4.2 Do: move the worker out of the web process** (or into a worker thread), so pages never wait on a recompute.
- [ ] **4.3 Do: narrow `loadDays` reads** to the columns each screen needs.
- [x] **4.4 Do: incremental stage 2 with a small stored fold state** (plan R3), with a test that it equals a full fold byte for byte. (`fold_checkpoints`, 2026-10-09: 180-day fold 260 ms to 71 ms on the seed)
- [ ] **4.5 Do: job queue with SKIP LOCKED, parallel workers and a global Google rate limiter.** The sequential sync topped out near 105 users per 15 minutes; the cycle now runs 4 users at a time (`CYCLE_CONCURRENCY`), the rest stays open.
- [x] **4.6 Do: storage tiering and compaction** (raw heart rate to per-minute after 30 days: `compactHr`, 2026-10-09). Intraday encoding left as jsonb.
- [ ] **4.7 Do: remove dead data and code:**
  - `raw_payloads` is write-only
  - unread `daily_metrics` columns (`hr_zones`, `hrv_deep_ms`, `rhr_method`)
  - the unused `daily-heart-rate-zones` fetch
  - a stray re-export in `queries/settings.ts:11`

## 5. Bevel engine (scoring behind an admin toggle)

Reference: the metrics table in this session's notes and `docs/research/bevel/pulse-gaps.md`.

- [ ] **5.1 Do: start a new session with `docs/plans/bevel-engine-session-prompt.md`.** It produces the Phase 1 design doc only.
- [ ] **5.2 Review: the design doc.** Check the comparison matrix, the toggle design, migrations and UI impact.
- [ ] **5.3 Decide: the 18 "decisions for the user"** in `docs/research/bevel/pulse-gaps.md`. Examples: copy Bevel's EPOC sign bug or not, Strain without a 0-21 scale, Energy Bank starting at 0.
- [ ] **5.4 Do: implement family by family** in the order from the design doc. Recovery and Sleep come first, then Strain, Cardio Load, Target Strain and HR Recovery, then the rest.
- [ ] **5.5 Measure: compare Bevel and Pulse outputs** on your own data for a few weeks before switching any toggle on for everyone.

## 6. Data gaps (small probes before any connector work)

- [ ] **6.1 Do: probe Google `heartRateVariability` samples for one day.** Check whether they arrive, how many, and whether only at night or all day. This decides whether Bevel Stress can use HRV or stays HR-only.
- [ ] **6.2 Decide: connector additions,** using 6.1 and the Bevel design doc. Candidates: intraday HRV samples, per-reading glucose, richer workout fields.

## 7. Before growing past 100 users

- [ ] **7.1 Do: start Google app verification.** An unverified app is capped at 100 users. Health scopes may need a security assessment that takes weeks. See `docs/google-verification.md`.

## Parked (not now)

- Google Health webhooks (push instead of polling). Design kept in `docs/plans/scale-10k-users.md`.
- TimescaleDB. Revisit with 3.4.
- Loading-skeleton screenshot audit. All routes already have `loading.tsx`. Suspected layout shifts are in activities (no filter pills), reports (placeholder switch) and metric detail (no hourly summary slot).
- Runtime parity checks of Bevel outputs against the real Bevel app (V01-V04, F01-F18).

## Done

- [x] Bevel 3.1.7 algorithm research (`docs/research/bevel/`, commit 8c4833d).
- [x] Scaling plan, system design and backend architecture plan written.
