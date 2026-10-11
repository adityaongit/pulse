# What Pulse must change to match Bevel 3.1.7

Purpose: for each Bevel metric family, compare Bevel's input and algorithm with what Pulse has today, and say what Pulse must retain or derive. Pulse line numbers were read from the working tree on 2026-10-07 (branch `belevel/research`); re-check them before editing because the files move.

Sources: A.md G11 (integration inputs per family), C's stress note (Pulse has no intraday HRV), G's connector gaps (glucose, meals, categories), and the earlier comparison in [../bevel-vs-pulse-algorithms.md](../bevel-vs-pulse-algorithms.md), checked against the code. The earlier A.md "Pulse retains?" columns cited old line numbers; the lines below replace them.

Important framing differences:

- Bevel never calls Google. Its server holds the tokens and sends `value: Double` samples (see [ingestion.md](ingestion.md)). Pulse calls the Google Health API v4 itself (`src/server/sources/google/client.ts`), so Pulse can request raw Google types directly, but what Bevel's server picks for each field (RMSSD or SDNN, sample or daily, aggregation, scaling) is NOT IN IPA (G10). Pulse must choose its own Google fields and cannot copy Bevel's.
- Bevel is Float32 throughout. A bit-for-bit port needs `Math.fround` at the places the family docs mark.
- Every Pulse score here is on its own scale ("Charge" logistic, "Effort" 0-100 log, display 0-21). None of the Bevel kernels is a re-parameterization of those; each is a different algorithm.

## Contents

- [Connector status (Google)](#connector-status-google)
- [Per-family gaps](#per-family-gaps)
- [Decisions for the user](#decisions-for-the-user)

## Connector status (Google)

What Pulse stores today, with the lines that decide it:

| Bevel input (type, unit) | Pulse today | Gap |
|---|---|---|
| HR samples (heartRate, minute aggregate), bpm, per sample | `mapHeartRate` keeps one bpm per unix second, drops `HEALTH_CONNECT`, last point wins (`src/server/sources/google/map.ts:171-180`); `heart-rate` list job (`sync.ts:89`, `catalogue.ts:50`) written by `writeHr` (`sync.ts:379-386`) into `hr_days` | No per-minute aggregate (derivable by mean per minute; Bevel's server aggregation is unknown). No sleep-stage label on samples, no source id. |
| HRV samples (ms, per sample with start/end) | Only the daily average and deep-sleep RMSSD: `map.ts:58-62`, `catalogue.ts:34` | Intraday HRV samples are not fetched. Stress, Energy Bank and Recovery's sleep-window mean all need them (Google type name per Bevel's backfill list is `heartRateVariability`; availability on the Fitbit Air is unconfirmed). |
| Resting HR | Daily `rhrBpm` (`map.ts:63-66`) | Bevel does NOT use a daily resting HR for integrations (type 4 is never fetched). It uses the mean of HR samples tagged otherSleep/remAndDeepSleep in the primary sleep window. Needs HR samples plus stage-labelled sleep segments (both are stored: `map.ts:171-180`, `map.ts:240-300`). |
| Respiratory rate | Daily `respBpm` (`map.ts:67`) | none (Bevel reads daily rows) |
| SpO2 | Daily `spo2Pct` in percent (`map.ts:75`) | Bevel's contract is a FRACTION (percentDecimal); store as value/100 or divide on use, then x100 inside Recovery. |
| Temperature | `nightlyTempC`, `tempBaselineC`, `tempSdC` in Celsius (`map.ts:69-73`) | Bevel consumes a Fahrenheit DELTA from the server, then adds the user baseline: sample = baselineF + deviationF (see ingestion.md, Temperature). Deviation = (nightly - baseline) C x 1.8 (no +32). Baseline default 97.9 / 98.1 / 95.7 F by sex and age. |
| Steps | Minute steps with max across sources (`map.ts:187-209`) plus daily rollup (`map.ts:119`) | Bevel sums awake-stage step samples with midnight proration (strain-load.md). Pulse's minute rows can feed this; stage labels are needed. |
| Total / active / resting energy | Total calories rollup (`map.ts:120`); active energy only as a shown extra (`map.ts:343`) | Resting = total - active per day, dropped if negative (ingestion.md). Both inputs exist in different tables. Note Bevel's TDEE ignores integration energy entirely (R1). |
| VO2 max, weight, body fat | `vo2maxDaily` / `vo2maxRun` (`map.ts:76-78`), `weightKg` (`map.ts:79`), `bodyFatPct` percent (`map.ts:80`) | Body fat must be a fraction for Bevel's units (lean percentage = lean mass / weight x 100 is derived at ingestion). |
| Blood glucose samples | Daily average only: `glucose` extra (`map.ts:353`, rollup in `catalogue.ts:66`) | Per-reading series (timestamp, mg/dL) is required for Food Glucose. |
| Blood pressure | not retained | Needed only for the BP category display and BioMetric; no data type in `catalogue.ts`. |
| Sleep sessions | Sessions with `isMain`, stage vocabulary awake/light/deep/rem, stages cleared when any stage unknown (`map.ts:240-300`, `map.ts:281-283`); short awakenings omitted by Google's summary | Bevel needs `asleepUnspecified` (classic sleep), every session id, naps, and the whole session window as the in-bed interval. Pulse's `STAGES` map (`map.ts:215`) has no unspecified stage. |
| Workouts | id, day, start, end, type, name, calories, distance (`map.ts:303-324`) | Bevel's DTO adds active and resting calories, average HR, active duration, elevation gain/loss, speed, pace, power, effort, pauses, splits, route locations. Per-workout TRIMP/strain units need the workout's HR segments and pauses. |
| Meals / food logs | Only rollup totals (`map.ts:347-352`) | Food Quality and Daily Nutrition need per-food logs with timestamps, category weights, sugar, sodium, alcohol. NOT in Google data. |

## Per-family gaps

Columns: Bevel input; Pulse status; what to retain or derive; algorithm differences.

### Recovery

See [recovery-stress-energy.md](recovery-stress-energy.md#recovery).

| Bevel input | Pulse status (file:line) | Retain or derive | Algorithm differences |
|---|---|---|---|
| HRV: mean of intraday samples tagged otherSleep/remAndDeepSleep inside the primary sleep window; 60-day baseline (population mean/SD of nightly means, excluding the day) | Daily HRV only (`map.ts:58-62`); baselines are Winsorized EWMAs (`baselines.ts:5-60,77-118`) | Fetch HRV samples with start/end; keep timestamps; label by sleep stage with the `[start, end)` rule | Bevel: `0.4 H + 0.3 R + 0.3 S`, then `+RR +O2 +temp` adjustments, clamp [1, 100] (lower clamp 1, not 0), `compUp` / `compDown` with `z in [-1, 1]` mapped `((min(z,1))*0.5+0.5)*100`. Pulse: weighted z-sum through a logistic (`recovery.ts:8-25,99-125`, weights .55/.2/.05/.15/.05..., logisticK 1.6, z0 -0.2). |
| RHR: mean of HR samples in sleep contexts | Daily `rhrBpm` (`map.ts:63-66`), `restingHr.ts` bin gate | Derive from stored HR plus sleep segments | Bevel baseline = pooled (n-1) mean/SD of all selected samples over 60 days; Pulse EWMA on one value per night. |
| RR daily, SpO2 daily, temperature daily | RR yes (`map.ts:67`); SpO2 percent (`map.ts:75`); temperature C with 30-night SD (`map.ts:69-73`) | SpO2 as fraction; temperature as F delta plus a baseline | Bevel RR/O2/temp are additive adjustments (`rrAdj = (B-50)*0.2`; `o2Adj = -min(30, 30*atan(deficit/5))`; `tempAdj` max(-30, 30 atan(min(z,0)/10))). Pulse uses them as weighted z terms and symmetric skin-temp penalty (`recovery.ts:108-110`). |
| Sleep score (Bevel's own, 0-100); `ignoreSleepScore` forces 100 (goal estimation only) | Sleep `rest()` composite (`sleep.ts:106-127`) | Needs the Bevel sleep score from [sleep.md](sleep.md) | Different sleep model; see Sleep Score row. |
| Gates | `minBaselineNights = 7` and trust gates (`recovery.ts:33,155-162`) | Bevel gate: HRV and RHR current plus baselines present plus a sleep score; baseline exists after one prior day | Bevel has no minimum-days gate (calibration badge only: 60-day span plus 5 data days). Pulse waits 7 accepted nights. |

### Daily Strain

See [strain-load.md](strain-load.md#daily-strain).

| Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|
| HR minute aggregates tagged by stage (workout/exercise vs awake) | per-second HR in `hr_days`; Pulse strain from `strain.ts`, stage1 | Minute aggregates plus stage tags; exercise windows | Bevel: `16 atan(steps/7000) + 66 atan(U/20000)`, open-ended, max about 128.8, zone weights (0,1)(2,2)(3,4)(4,7)(7,12)(12,20) interpolated. Pulse: Edwards HRR zones (`strain.ts:29-35`) to log Effort 0-100 (`strain.ts:11,14`: denominator 7201) and display 0-21 (`strain.ts:12,40-43`). |
| Zone settings: bpmLowest zone1..5 + maxHR (default 195) with five derivation methods | Karvonen %HRR (`strain.ts:92-102`); Google zone bounds stored (`map.ts:83-95`) | Per-day zone settings history | Different zone definitions. |
| Steps (awake stage only, prorated at midnight) | minute steps (`map.ts:187-209`) | stage tag to exclude workout/sleep steps | `strain.ts` has no step term. |
| Stored workout units (cardio + muscular) | none | per-workout HR segments, pauses, TRIMP | not present |

### Sleep Score

See [sleep.md](sleep.md#sleep-score).

| Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|
| Stage seconds (asleep, deep, rem, awake interruptions) of the PRIMARY session with awake edges trimmed; sleep need seconds | Segments with light/deep/rem/awake (`map.ts:240-300`) | Keep `asleepUnspecified` and every awake segment (no minimum duration) | Bevel: six components with exponents (3,2,2,3,15,10), weights (.35,.2,.2,.1,.075,.075), targets by age/sex, drop of missing components with renormalization, nil when asleepRatio is 0. Pulse: .5 duration / .2 efficiency / .2 restorative / .1 consistency (`sleep.ts:67-70,106-127`), missing consistency neutral 0.5. |
| HR dip: mean HR in sleep samples vs 60-day inactive-HR baseline (awake histogram) | none | HR samples tagged by stage; awake baseline | not present |
| Sex, age (age now, not at the scored day) | profile age/sex | profile birthday | Bevel has `other`/nil defaults (deep .125, HR dip .255). |

### Stress

See [recovery-stress-energy.md](recovery-stress-energy.md#stress). C's note: Pulse has no intraday HRV, so a Bevel-equivalent Pulse stress would be HR-only for every slot unless an intraday HRV fetch is added.

| Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|
| 6-minute slots on a UTC-midnight grid; per-slot HR median (n < 8) or 15% trimmed mean (n >= 8) with gap fill from +/-1, +/-2 slots | Per-minute mean HR on a local-midnight grid (`stress.ts:37-49`) | Minute HR aggregates | Bevel: HR percentile of the 30-day awake-context histogram CDF mapped by a piecewise table to 0-100 plus HRV score `0.4/0.6` blend, display filter nils active slots and caps 100. Pulse: z against a personal daytime resting baseline, logistic 0-3 (`stress.ts:13-29,52`). |
| HRV mostRecent in last 36 min (non-workout) or mean in slot (workout); 30-day averageHRV mean/SD | Daily HRV only (`map.ts:58-62`) | Intraday HRV samples | not present |
| Context: workout > exercise > sleep > mindfulness > awake by overlap | Excluded minutes: workouts and sleep, steps within +/-2 min (`stress.ts:96-104`) | The connector has no mindfulness source | Different handling: Pulse excludes, Bevel classifies. |

### Energy Bank

See [recovery-stress-energy.md](recovery-stress-energy.md#energy-bank).

| Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|
| Raw stress per 6-minute slot (the Stress kernel), mean HR per slot, context, sleep goal seconds, awake seconds (7-day rolling mean of 86400 - sleep), 8-day history | `stress()` minutes (`stress.ts:89-134`), `load` Edwards weights (`energyBank.ts:26-27`), naps | Everything above; sleep goal; sleep sessions split at local midnight | Bevel: state machine with charge/drain curves (`0.93^(S-5)+0.1`, `1.0115^S+0.4084`, `1.0150^S-0.9`, cap `1.05^...`), 360 s slots, clamp [1, 100], seed `(window.start, 0)` and NO reset at midnight. Pulse: per-minute k0..k4 drains/recharges from a wake seed `0.6*recovery + 0.4*sleep` (`energyBank.ts:7-23,79,98-120`), clamp [0, 100]. |

### Sleep Bank, Consistency, Needed

See [sleep.md](sleep.md).

| Family | Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|---|
| Sleep Bank | primary + naps seconds (all stages except awake) of last 7 days, goal hours | 14-night non-positive debt ledger with 0.55 carry (`sleep.ts:15-18,50-76`) | Naps already credited (`sleep.ts:39-42`) | Bevel: signed surplus/deficit weighted by `exp(0.3*(j-6))` from the oldest slot; zero night skipped with slot consumed; two banks per day (previous, current). |
| Consistency | primary sleep of the up-to-7 most recent days with sleep, 1440-bin agreement over included days | Phillips SRI with adjacent-day pairs and coverage mask on noon-to-noon days (`sleepRegularity.ts:18-39`) | Sessions with local time | Bevel: `agr = sum km(km-1) + (N-km)(N-km-1)` over `N(N-1)*1440`, x100, local midnight days, naps ignored. Pulse: `-100 + 200*P(same)`. |
| Needed | goal hours (default 7.5), previous day strain z (population SD of <= 30 prior days), previous 7-day bank, tonight: efficiency and latency adjustments | `sleepPlan` with personalized need from upper quartile, strain per 21-scale point, 20% of debt, naps subtracted (`sleepPlanner.ts:6-17,77-105`); `personalizedNeedHours` (`sleep.ts:90-99`) | Goal setting in settings | Bevel: `need = goal + max(0, goal*(1+0.02z) - goal) + 0.25*(-bank*60 if bank<0)`; tonight adds `min(base/(avgEff/100) - base, 3600)` and `min(mean latency, 60)*60`. Automatic goal: last 90 eligible days, top floor(15%) by recovery (sleep fixed at 100), +30 s, gated by >= 15 days with recovery >= 67. |

### Biological Age

See [biological-age-muscular.md](biological-age-muscular.md).

| Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|
| 28-day windows of sleep minutes, sleep consistency, steps, zone2-3 and zone4-5 minutes, strength minutes, RHR; VO2 max and lean percentage samples; nutrition score; alcohol and smoking logs; optional PhenoAge blood panel | Pulse Age inputs in `healthspan.ts` (sleep hours, SRI, zone minutes, strength, steps, VO2, resting HR, lean mass) | Daily HR-zone minutes derived from HR plus zones locally (Bevel derives; Google roll-up `map.ts:123-128` differs); blood pressure: not retained | Bevel: nine hazard kernels with exact formulas and clamps, plain sums of `10 ln(HR)` with no overlap shrink and no renormalization (missing factors only lower the confidence mean), blend of other/blood by age. Pulse: piecewise-linear log-hazard curves from papers (`healthspan.ts:53-77`), `overlapShrink 0.75` (`healthspan.ts:82`), Gompertz doubling 8 y, `minTerms 5` gate. |

### Cardio Load (and Target Strain, HR Recovery)

See [strain-load.md](strain-load.md).

| Family | Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|---|
| Cardio Load | Daily sum of per-workout Banister TRIMP (`b` 1.92/1.67/1.795, factor 0.64) using the 60-day RHR baseline | EWMA of daily Effort, alphas from 42/7-day constants (`trainingLoad.ts:13-19`) | Per-workout HR segments and pauses; 60-day RHR baseline | Bevel alphas .25 (ATL) and 2/43 (CTL), zero seed, status by ratio 1.0/1.4, trend +/-5 %, confidence = min(density, recency) >= 0.35. Pulse primes from the mean of the first 7 days and needs contiguous days. |
| Target Strain | Strain history (14 values after removeFirst), same-day recovery | `strainTarget` 28-day mean on 0-21 with recovery bands and ACWR (`strainTarget.ts:6-24,42-70`) | none | Bevel fold `B = B*0.75 + v*0.25`, continuous recovery factor `((R-50)/100*0.6+1)`, bounds `[-5-5r, 10+20r]`, floors 20/40, cap 120. |
| HR Recovery | Raw HR samples within workout end + 2 min | Sustained-intensity gate and +1/+2/+5 minute medians (`hrRecovery.ts:5-12,27-51`) | HR at native cadence | Bevel: maximum drop in any 120 s window with the earlier point at or before the active end, zone-four gate on the max HR of the slice. |

### Muscular Load and Freshness

Not present in Pulse. Needs workout types and strain units (cardio-derived) and, for the strength term, per-set exercise, effort and muscle mapping, which the Google connector does not provide (`map.ts:303-324` keeps summaries, not sets). Without sets Pulse can only produce the cardio-derived part; see [biological-age-muscular.md](biological-age-muscular.md#muscular-load).

### Food Glucose, Food Quality, Daily Nutrition, TDEE

See [nutrition-tdee.md](nutrition-tdee.md).

| Family | Bevel input | Pulse status | Retain or derive | Algorithm differences |
|---|---|---|---|---|
| Food Glucose | Glucose samples (mg/dL, timestamps), meal times, CGM method, 60-day per-meal baselines (60 days, Chan merge, prior pseudo-days) | Daily mean only (`map.ts:353`); no scorer | Raw per-reading series; meal log timestamps | Not present. |
| Food Quality | Per-food category weights (server), sugar, sodium, alcohol | No scorer; connector keeps macro rollups (`map.ts:347-352`) | Food logging with categories | Not present. |
| Daily Nutrition | Quality, glucose, calorie goal/TDEE, `goal*0.3` threshold | No scorer | same | Not present. |
| TDEE | HealthKit statistics only; user profile weight/height/birthday | No scorer; Google total calories exist (`map.ts:120`), profile has age/sex/height | Profile weight (lbs) | Mifflin-St Jeor `10 kg + 6.25 cm - 5 age + 5/-161`, active energy mean (coverage >= 0.8), macro term; fallback 2500. If Pulse feeds Google active energy into TDEE it will deliberately differ from Bevel (R1). |

### Other calculators

See [other-calculators.md](other-calculators.md). Pulse has `journalImpact.ts` and `healthMonitor.ts` in `src/core/algorithms/`. Only the vital status band was compared:
- Bevel marks a vital normal within ±1 population SD of the mean of the trend window being viewed. The current point is included, and there is no per-day baseline (R2; `0x10183d970` over `selectedData`).
- Pulse's `healthMonitor.ts:79-80` uses its Winsorized EWMA baseline ± `rangeSigmas`·σ (2σ per the file header), or Google's own range.
- Matching Bevel needs the window-mean ±1 SD rule. Bevel's journal insight is a binary OLS slope plus pooled t-test over 90 days with the factor from the day before, requires at least 5 values in each group, with a 30-entry t table. Cycle prediction, EPOC, cardio focus, sport statistics, BP categories and glucose status bands have no Pulse counterpart.

## Decisions for the user

These are Bevel behaviours that look like quirks or bugs. Decide for each whether Pulse copies them (parity) or fixes them (intended behaviour).

1. EPOC sign bug (other-calculators.md). When HR is below resting HR, `inc = 0.05 * epoc` is added each minute (positive), so EPOC grows when resting and the increment is credited to the lowAerobic zone. Looks like an intended decay with the wrong sign. Copy for parity, or decay?
2. Strain has no 0-21 scale. Bevel's strain is open-ended (`16 atan(steps/7000) + 66 atan(U/20000)`, max about 128.8); the dashboard ring is value/100 and overdraws past a full turn (no clamp), the activity card clamps to [0,1], labels are unclamped. Pulse today uses Effort 0-100 and a 21-scale (`strain.ts:11-14,40-43`). Adopting Bevel's value changes target-strain bounds (floors 20/40, cap 120 are on Bevel's scale), the sleep-need strain z (relative, so scale-free except for z of today versus a rolling mean) and every display.
3. Energy Bank seeds at 0 (clamped up to 1 at the first update) when no cache exists, and never resets at midnight. Pulse seeds at wake from `0.6*recovery + 0.4*sleep` (`energyBank.ts:79`). A full recalculation therefore starts every user at 1.
4. Default age 40 when the age is missing in cycle variability. Threshold 5 days applies only to ages 18-25 and 42-45; ages below 18, above 45 and missing get 4. The in-app copy says otherwise.
5. The blood-row order depends on SQLite. The request has no ORDER BY, so the winning sample per PhenoAge marker is whatever the query planner returns last, and a row that cannot be converted deletes the marker's earlier sample. Parity rule proposed: latest `collectedAt` per marker within [D-365 d, D]. Bevel usually agrees but can pick an older re-uploaded report.
6. Rounding. Dashboard labels use half-even with 0 decimals (66.5 shows 66, 67.5 shows 68); target strain bounds and notifications round half away from zero; activity card label rounds half away. Pulse should state which one each display uses.
7. Missing sleep goal reads as 7.5 h (27000 s). Onboarding normally overwrites it by age (8:00, 7:45, 7:30, 7:15, 7:00).
8. Recovery lower clamp is 1, not 0; a nil score is returned when HRV, RHR, a baseline or the sleep score is missing, while RR, SpO2 and temperature never gate.
9. Biological Age has no renormalization for missing factors and no overlap correction (the marketed "overlap correction" is NOT IN IPA). Missing factors only reduce the confidence mean, and `Dp` sums only the present deltas.
10. Integration temperature is `baseline + deviation`, with a default baseline by sex and age (97.9, 98.1 or 95.7 F). A mid-history baseline change shifts stored samples.
11. Google energy does not feed TDEE. A Pulse TDEE that uses Google active energy will not match Bevel.
12. The sleep-segment sort comparator is not a strict weak ordering (reverses order within each inBed group for small counts). Replicating it only matters for overlapping segments from several sources; Pulse has one source per session.
13. Two HealthKit sessions with equal start timestamps would both be marked primary. Not reachable with Google session ids, but relevant if Pulse ever merges HealthKit.
14. Sleep Bank weights are aligned from the oldest slot, so windows shorter than 7 days give the newest night a weight below 1.
15. Stress and Energy Bank grids are 360 s slots aligned to UTC midnight, not local midnight. Day keys use the local calendar. Pulse's minute grid is local (`stress.ts:37-49`).
16. TRIMP sums per-minute heart rate bins in dictionary iteration order (Float32), so the last bits of TRIMP are order dependent.
17. Score gates differ. Bevel's calibration badge (60-day span plus 5 data days for Recovery, 30 for Stress) never changes the score; Pulse nulls scores below `minBaselineNights`.
18. Whether to port Float32 (`Math.fround`) semantics. Bevel's kernels are Float32 with specific operation order (Recovery, Strain, Stress, Energy Bank, Chan merge); a double-precision port will differ in low-order digits and can flip status at exact thresholds.
