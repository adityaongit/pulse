# Agent R findings: residual items 1-10 (supersedes A-G where they conflict)

Conventions: unslid VAs. `FUN_x` = decompile entry in `out/decomp-main/<shard>.c`. Asm = `work/G/text.asm` (otool -tV). Async function pointer records were resolved as `record + int32(record)` (`work/R/afp.py`), absolute pointers through the chained-fixup map (`work/R/pref.py`, `work/R/pd.py`), and type names from descriptors (`work/R/dname.py`). Comparison stubs were checked against `otool -Iv`: `0x104e57d84` is `>=`, `0x104e57d90` is `<=`, `0x104e511fc` is `Date.<`. GRDB operator wrappers: `0x102fee870` = `">="` (`mov w6,#0x3d3e`), `0x102fee804` = `"<="` (`mov w6,#0x3d3c`). I started no background processes.

---

### R1 — RESOLVED (A is right, G M13.04 is wrong): Google/Air active energy never reaches TDEE

Call path, verified with every hop:
1. `FUN_100112638` (TDEE compute) calls the async record `0x104f98258` → `FUN_1016afe1c(x0 = calculator + 0x10)`. `+0x10` is the first stored property of `TDEECalculator` (descriptor 0x1051ff840: `healthKitManager {HKMProtocol}`, `userAttributesProvider`, `userDefaultsService`).
2. `FUN_1016afebc`: `from = startOfDay(now − 30 d)`. It runs an async let (`0x104f98268` → `FUN_1016b01a4` → `FUN_1016afc44`/`FUN_1016afc64`) with a task group over the types `[12,13,14] + [9]`.
3. Each child task runs `0x104f97c58` → `FUN_1016a523c` → `FUN_1016a0f94`/`FUN_1016a100c`. That opens a task group with a 300 s timeout (`0x4072c00000000000`), then `0x104f97c78` → `FUN_1016a55e4` → `FUN_1016a154c`/`FUN_1016a156c`.
4. `FUN_1016a156c` calls the async record `0x104f96c38` = `FUN_10166cff0(DAT_106a11620 /*data-source settings*/, hkmExistential, type, from, to)` → `FUN_10166d124`. That function calls HKMProtocol witness slot **+0x60** on the TDEE calculator's existential.
5. HKMProtocol has exactly two conformances, found by relative references to the protocol GOT slots `0x1060c5300`/`0x106073d28`:
   - HealthKitManager: conformance descriptor `0x104fa3bd4`, witness table `0x1060c4eb8`.
   - MockHealthKitManager: conformance `0x104f378a0`.
6. For HealthKitManager, slot +0x60 is entry `0x1060c4f18` → record `0x104fa3c18` → `FUN_10183104c` → `FUN_10182c058`. That function builds an `HKStatisticsCollectionQueryDescriptor`, so it is HealthKit only.
7. The integration fan-out (`FUN_101663b18`, which unions Google, Oura and Garmin samples) is not on this path.

Result: E (key 9 `activeEnergyBurnedDisplay`) is the mean daily sum of HealthKit statistics buckets. Sources disabled in the user's source list are filtered out by `FUN_10182d0c0`.
- Google, Fitbit and Oura energy that sits only in Bevel's integration stores contributes nothing to TDEE.
- It can only enter if another app (for example the Fitbit iOS app) has written it into Apple Health.
- Correction to G M13.04: "a Fitbit/Google (Air) connector that supplies active kcal can feed it" is false for the integration connector.

### R2 — RESOLVED (four conflicts)

**(a) Energy Bank initial state: C is right. It seeds at 0 when nothing is cached.**
- In `FUN_1015424a0`, when `latest` is nil (enum tag 1), the code copies `slice.seedDate` (`slice + field 0x28`) into the seed timestamp and sets `*(float*)(seed + energyOffset) = 0`.
- Full recalculation `FUN_101532ecc` stores tag 1 (nil) before calling `0x104f917f8` → `FUN_10154229c`.
- The incremental path `FUN_10153aa2c` passes `latest = cache.last`, or nil when the cache array count is 0 (`(lVar3 == 0)` → tag 1).
- So no cache means seed = `(window.start, 0.0)`. The first update clamps to at least 1 (C M05.01).
- A's G12 line "Energy Bank initial state (not recovered)" is superseded.

**(b) Recovery dashboard label: half-even, 0 decimals, confirmed on the actual dashboard view.**
- The main dashboard cards are `DashboardChartCardItem` (descriptor 0x10525db64: `type: DashboardMetricType {sleep, recovery, strain, stress, nutrition, energy}`, `value: Float?`, `targetBounds`).
- Its View witness (conformance `0x1050347e0`) body is `0x1024af350` → `FUN_1024ae0b8`. That calls `FUN_1032f0850` with `s0 = 100.0` (`mov w9,#0x42c80000` at `0x1024ae404`, unconditional) to build `DashboardDonutChart` (descriptor 0x105281258: `maxValue: Float`, `unit`, `targetBounds`, `value: Binding<Float?>`).
- The label in the donut (`0x1032f1ba0`–`0x1032f1bd8`) is `formatDecimal(value, DecimalFormatOptions{fractionDigits: 0 ([x26]=xzr), grouping on (byte9=1), no plus sign}, Locale.autoupdatingCurrent)` via `0x1030d3ca4`. This is the same option layout `HealthMetric.formatValue` uses (`0x1038c2f6c`–`0x1038c2f94`).
- The only `setRoundingMode:` sender in the binary is `FUN_104e205e0`, which is outside the app's formatter. So every app `NumberFormatter` uses the iOS default `.halfEven`.
- Recovery 66.5 therefore displays "66", and 67.5 displays "68". The value is not clamped.

**(c) Default CalculationsOptions: B is right.**
- `FUN_101915fbc` reads key `0xf` (`health_settings.calculations_options_key`). If the key is absent (`uVar6 >> 0x3c >= 0xf`) or the JSON decode throws (second `mov w0,#0x101` at `0x1019160a0`), it returns packed `0x0000000000000101`:
  - hrvMethod = bevelRMSSD
  - rhrMethod = bevel
  - hrvContext = rhrContext = entireSleep
  - caloriesDisplay = total
  - temperatureSource = wrist
  - sp02Window = rrWindow = entireSleep
- A's "BLOCKED" sub-item is closed.

**(d) Temperature: B's bounds are right, and A's "the baseline value is not used" is wrong.**
- **Conversion.** The dispatcher `FUN_10166038c` (tags 1/2, baseline non-nil) fetches daily `temperatureDeviationFahrenheit` (type 0xb) and then, in `FUN_101660c60`, calls `FUN_1016689e8(baselineF = request word 0, samples, source "GOOGLE_HEALTH")`.
  - That function sets every sample's `doubleValue = baselineF + deviationF` (`param_1 + dVar14`).
  - The same function is used for Garmin (`FUN_10165ed1c`) and Oura (`FUN_10167bc80`).
  - So integration temperature samples are **absolute °F = user baseline + nightly delta**, not a delta.
- **Baseline value.** Key `data_integrations.temperature_baseline_fahrenheit` is case 1 of `DataIntegrationsUserDefaultsKeys` (descriptor 0x10524507c; raw-value table at 0x1061104e8/0x106110500). The UI input is bounded 95.0–99.9 °F (35.0 °C lower bound in Celsius), per B.
- **New: the default baseline is seeded locally** by `TemperatureBaselineDefaultCalculator` (`FUN_10149dbf4`, asm 0x10149dc1c–0x10149dc64). It writes Float(value) to that key (`strb #1` key case, witness +8):
  ```ts
  sex = effectiveSex(profile)                    // FUN_10310dea8: 0 male, 1 female, 2 other, 3 notSet
  age = profile.ageYears                         // FUN_10310e084 → Int?
  base = ((sex & 0xfd) == 0) ? 97.9 : 98.1       // male/other 97.9 °F; female/notSet 98.1 °F (doubles at 0x104f8c838/0x104f8c830)
  if (age != nil && age > 64) base = 95.7        // cmp x19,#0x40; ccmp ..., gt; fcsel ne (double at 0x104f8c840)
  ```
- Because Recovery uses a z-score against the baseline, a constant baseline cancels. A baseline change mid-history shifts the samples.

### R3 — RESOLVED: day S is computed; calculationWindow and the TRIMP RHR baseline traced

**Key correction: `FUN_1030c7b04(interval, comps)` includes interval.start.**
- It allocates the result array with header `{count 1, capacity 1}` (`ldr q0,[0x104ebd9f0]` = (1, 2), stored at `x0+0x10`).
- It writes `interval.start` into element 0 (`DateInterval.start` getter with x8 = element 0, `0x1030c7c54`–`0x1030c7c58`).
- Only after that does it call `Calendar.enumerateDates(startingAfter: start, matching: comps, .nextTime, .first, .forward)` with closure `FUN_1030c7d60`, which appends `m` while `m < interval.end` (`Date.<`).
- So the result is `[start] + midnights in (start, end)`.

Consequences, which correct E (M07.02, M17.01):
- The checkpoint path builds `DateInterval(S, E + 1 d)` (`FUN_1015e9840`, decomp lines 512–525) and computes **S, S+1, …, E**. The checkpoint is `cache[S − 1]`, so there is no gap and no double count.
- The no-checkpoint path (`FUN_1015f0884`) builds the warm-up list from `DateInterval(startOfDay(S − 60 d), S)` = **S−60 … S−1 (60 days, not 59)**, then the window `DateInterval(S, end)` = **S … E**.
- Target-strain seed (`FUN_1015eecc0`): `DateInterval(startOfDay(S − 1 d) − 14 d, startOfDay(S) − 1 s)` = **S−15 … S−1 (15 values)**. The first computed day drops one (`count >= 15 → removeFirst`), so the fold still sees S−14 … S−1 as E stated.
- `active42` initial content (`0x10000a384`) = date−42 … date−1 (42 values).

**Who supplies calculationWindow.** `calculateMetricsHistory(endDate:lookbackDays:activityContext:baselines:metricHistories:timelineDays:context:trace:)` (`FUN_10168beb0`, params at frame +0x268 endDate, +0x270 lookbackDays) → the `setMetricHistoryState` closure (`FUN_10168ca5c` → record 0x104f975c0 → `FUN_10169b294` → `FUN_10168d344`/`FUN_10168d3b8`) → `FUN_10168d5b4(…, currentDay = endDate, cumulativeLookback, windowDays = lookbackDays, …)`. Asm:
- `0x10168dde0`: `D = startOfDay(currentDay)` stored at +0xee8.
- `0x10168de9c`–`0x10168df14`: `start = D − lookbackDays` (`FUN_1030cbe4c`).
- `0x10168e070`: `calculationWindow = DateInterval(start, D)`.
- Async let 0x104f97548 → `FUN_10169b0d0` → `FUN_101690768` → `FUN_1015e9400(strainMetrics, recoveryMetrics, workoutsByDay, calculationWindow, cumulativeMetricsLookbackDays)`.

So `S = startOfDay(endDate) − lookbackDays` and `E = startOfDay(endDate)`. On this path `cumulativeMetricsLookbackDays = (dataLoadingOption & 0xff) * 365 + 365`, where the option comes from `FUN_101dce914` (`data_loading.full_metrics_recalculate_window`); unset or 5 maps to 0, so 365 (asm in `FUN_10168ca5c`: `uVar3*0x16d + 0x16d`).

The other caller, `loadMetricsFromCache(currentDay:maxLookbackDays:trace:)` (`FUN_1016909fc`), passes a nil recalc marker. That path only reads the cache over `[D − maxLookbackDays, D]` (`FUN_1015ec004`).

**TRIMP baselineRestingHeartRate.**
- `calculateScoresForWorkout(hkm:inputs:baselineRestingHeartRate:trace:calculateDetailedScores:)` (entry `FUN_100f59c50`) gets x3 = `[frame+0x1330] & 0xffffffffff` (Float?) at `0x100f59048`.
- That value is set in `FUN_100f58f50` from async record `0x104f8f638` = `FUN_1014eceb8(workoutInterval.start)`, which is called from `FUN_100f58e64`.
- On error `FUN_100f59074` runs, the value is nil, and so TRIMP is nil.
```ts
// FUN_1014eceb8 → HealthDataBaselines.load(date, 60) (record 0x104f93330 = FUN_10158cd6c) → FUN_1014ecff0
FUN_101586380(date, 60)                                         // ensure baselines for the date
const dict = baselinesActor.baselines /* actor +0x10 */[startOfDay(workout.start)];
const s = dict?.[CalculatedMetric.restingHeartRate /*3*/];      // FUN_1017fe49c (date key), FUN_1017fe384 (key 3)
return s ? Float(s.average) : nil                               // word2 == 1 ⇒ Optional nil
```
- This is the **60-day pooled RHR baseline**: a Chan merge of the per-day RHR statistics of the 60 functional days before the workout day, excluding that day (B G05).
- The per-day RHR samples are `metricHistories[0]`. See R5 for how they are built: with the default rhrMethod = bevel they are HR minute aggregates tagged otherSleep or remAndDeepSleep, inside the sleepSession window of each day (factory metric 3, `rhrContext = entireSleep`).
- The same function is also called from `0x100f604fc` and `0x1017a1d74`.

### R4 — RESOLVED: no 0–21 mapping; the dashboard ring is value/100 and the text is unclamped

- **Main dashboard card (all metric types, strain included).** `DashboardDonutChart(maxValue: 100)` (see R2b).
  - `FUN_1032f157c` (`0x1032f1674`–`0x1032f1690`) computes `progress = Double(Float(value ?? 0) / maxValue)` and passes it to `FUN_1032f2918`.
  - `FUN_1032f2918` uses `progress` while `_drawingStroke` is true, otherwise 0 (`0x1032f3610 fcsel`).
  - The ring is drawn with `DonutRingView` (descriptor 0x1052815f0; body `0x103303eb4`): arc angle = `progress * 360°` (0x4076800000000000) with a separate tip/branch when `progress > 0.95`.
  - **No clamp to 1 exists**. A strain above 100 overdraws past a full turn.
  - The label is `formatDecimal(value, 0 decimals, half-even)` and is unclamped (128.8 displays "129").
  - Target bounds are drawn by `DonutTargetBoundChart` (descriptor 0x105281650) with low/high and 100.0 (`0x1032f36dc`–`0x1032f36f4`).
- **Activity strain card** (`BevelFitness/ActivityStrainCard.swift`, `ActivityStrainGauge {score: Float}`, body `FUN_103f81580`):
  - Gauge fraction = `clamp(score/100, 0, 1)` (`0x103f81a6c`–`0x103f81a98`: `fdiv` by 100.0, `fcsel ls` with 0, `b.le` 1.0); 0 unless drawing or reduce-motion.
  - Label = `Int(score.rounded(.toNearestOrAwayFromZero))` (`frinta` at `0x103f81bfc`) with locale formatting, unclamped.
  - Color band `FUN_103f80284`: `r = frinta(score)`; `r ≤ 20`, `≤ 40`, `≤ 60`, `≤ 79`, else top band (`b.ls` at `0x103f8063c`…).
- Elsewhere: `HealthMetric.strainScore (23)` formats with 0 decimals and half-even (B G09). Target-strain bounds are rounded half away from zero (E M17.04). No rescaling exists anywhere.

### R5 — RESOLVED: HR stream per consumer and the exact labeling

**How samples are labeled** (applied when the per-type histories are built: `FUN_1016a3d68`, called from `1016a0460`, `1016a5b90`, `1016a6604`, `1020a2650`, `101f57f20`):
```ts
// t = sample.startDate (HealthQuantitySample field-offset slot 0x24); isHR = (type & 0xfe) == 4 (types 4 minute-aggregates, 5 samples)
stagesA = activity.sleepStages.filter(s => s.stage != asleepUnspecified)   // loop 1 of FUN_1016a3d68
stagesB = activity.sleepStages.filter(s => s.stage == asleepUnspecified)   // loop 2
function find(list, t) {          // FUN_1016a16e4 / FUN_1016a19b8: binary search, assumes sorted, non-overlapping
  lo=0, hi=n-1; while (lo<=hi) { mid=(lo+hi)/2; s=list[mid];
    if (t >= s.start /*0x104e57d84*/ && t < s.end /*Date.<*/) return s;      // half-open [start,end)
    if (t < s.start) hi=mid-1; else lo=mid+1 } return nil }
stage = find(stagesA,t)?.stage ?? find(stagesB,t)?.stage ?? NONE(6)          // FUN_1016a2ec0
if (stage == rem(4)) return remAndDeepSleep(1)                               // 0x1016a33f8 → mov w0,#1
if (stage != awake(1) && stage != NONE) return stage == deep(3) ? 1 : 0      // 0x1016a3780: cset eq 3; core/unspecified/inBed → otherSleep(0)
// awake or no stage: same [start,end) search on the context SortedLists, in this order
if (find(workouts,t))    return workout(2)      // 0x1016a39b8
if (find(mindfulness,t)) return mindfulness(3)  // 0x1016a3b64
if (isHR && find(exercise,t)) return exercise(5) // 0x1016a3d28, only for HR types 4/5
return awake(4)                                  // 0x1016a39f0
```
- Ties: a sample exactly at a segment boundary belongs to the segment that **starts** there.
- Overlapping segments: the binary search returns whichever probe hits first. There is no priority, and the input is assumed non-overlapping. HealthKit sessions are de-overlapped upstream (D M03.01).
- Stress and Energy Bank do **not** use these per-sample tags for their slot context. They classify each 6-minute slot by overlap (`seg.end >= s && seg.start <= e`) with the priority workout > exercise > non-awake sleep > mindfulness > awake (`FUN_1015e0ca8`, C M04.02).

| Consumer | HR stream | Label use |
|---|---|---|
| Daily Strain | key 4 heartRateMinuteAggregates only (`0x1015d45c4`, E) | per-sample tag: exercise pool {2,5}, passive pool {4} |
| Stress | key 4 (slot HR, median/trimmed mean) + key 1 HRV | slot overlap context; awake-context key-4 histogram baseline |
| Energy Bank | key 4 (slot mean) + key 1 HRV | slot overlap context |
| Sleep Score HR dip | key 4 (`lVar4 = 4` at `0x1015d24c4`) | per-sample tag ∈ {0,1} inside primary sleep [start,end); baseline = inactiveHR (key 4, awake) |
| RHR / Recovery | key 0 restingHeartRate, built from **key 4** (see below) | per-sample tag via factory contexts (default [[remDeep, other]], sleepSession window) |
| HR Recovery | raw `heartRateSamples`: HealthKit `FUN_101676ea0` + Garmin (`FUN_1017befb8`) + integrations `heartRate` type 6 (`FUN_1017bd0f0(source, 6, …)`) via `WorkoutHeartRatesFetcher` (`FUN_1017bdf3c` → three async lets 0x104fa1530/48/58) | none (time window only) |
| Workout TRIMP / units | workout HR segments (E) | none |

**How the RHR key 0 history is built** (`FUN_1016a5f80`):
- `hr = metricHistories[4]` (`thunk_FUN_1017fef0c` with key 4), already tagged.
- The samples are split by source metadata tag (+0x18): 0 → Garmin list, 1 → Oura list, 2 → Google list, else HealthKit list.
- The request is `HealthDataFetchType.restingHeartRate(HealthDataRHRCalculation{healthKit: rhrMethod == bevel ? .bevel(hkList) : .appleHealth, garmin: .bevel(...), oura: .bevel(...), googleHealth: .bevel(...)})`. rhrMethod is the Published CalculationsOptions byte at +0x242 (`== 1` → bevel).
- It is fetched through `fetchSamplesWithFallback` (`FUN_1016a2698`). The integration branch keeps tag < 2 (`FUN_101655bcc`). The result is re-tagged by `FUN_1016a3d68` and stored as key 0 (`FUN_100ba3474(…, 0, dict)` in `FUN_1016a6604`).

**New discovery: HealthKit HR timeout fallback** (`MetricSampleHistoryCalculator.fetchSamplesWithFallback`, `FUN_1016a2728`/`FUN_1016a2988`):
- The primary fetch has a 300 s timeout.
- On timeout, for heartRateMinuteAggregates, heartRateSamples (`(word0 & ~4) == 1`) and bloodGlucose, it runs `fetchAggregatedFallback` (`FUN_1016a1d1c` → `FUN_10166f24c`/`FUN_10166f33c`): an `HKStatisticsCollectionQuery` with `.discreteAverage` (options 2; steps use 0x10 cumulativeSum) and interval `DateComponents(minute: 5)` (`mov w8,#5` at `0x10166f520`), also with a 300 s timeout.
- Otherwise the result is `[]`.

### R6 — RESOLVED: Muscular Freshness feed writer and first date

- `MuscleGroupTrendStreamProvider` (`FUN_101db3880`, decomp 101db.c:2380–2440) subscribes to `HealthDataModel._publishedData` (Published projected value; `PublishedHealthDataItems` descriptor 0x105232304) through an `AsyncMapSequence` whose transform is record 0x104fec3a0 → `FUN_101db7ed4` → `FUN_101db3cbc` → `FUN_101db3e48`/`FUN_101db51e4` → `FUN_101db6a30`. That last function calls `FUN_100081efc` with x0 = the provider's dictionary (`0x101db6c80`).
- The only `[Date: CumulativeMetrics]` in `PublishedHealthDataItems` is `cumulativeMetricHistory`. F's `FUN_101db7440` is a different helper: it sums workouts inside a date interval for the chart, not the feed.
- The writers of that dictionary are the cumulative-metric paths that feed `HealthDataModel`:
  1. **Recalculation**: `calculateAndUpsertCumulativeMetrics` → cache read `FUN_1015ec004(E − cumulativeLookback, E)` → `FUN_1016c88b4(from, to, algorithmVersion "35")` → `FUN_1015931cc`. The GRDB filter is `version == "35" AND date >= from AND date <= to` (operators `0x102fee870` >=, `0x102fee804` <=). Recomputed days S…E are then merged in.
  2. **Load from cache**: `FUN_10168d5b4`, nil branch at `0x10168de30`, reads `[startOfDay(currentDay) − maxLookbackDays, startOfDay(currentDay)]`.
- **First date covered** = `startOfDay(currentDay) − cumulativeMetricsLookbackDays`:
  - 365 × (DataLoadingWindow option + 1) on the recalculation path (default 365 days).
  - `maxLookbackDays` on the cache path.
  - Inside it, the recurrence started from a zero state 60 days before the earliest recomputed S (R3).
- Rest-day semantics are unchanged (F M09.02).

### R7 — RESOLVED: BioAgeDisplayState mapping, gating order and ranges

Pipeline: `streamBiologicalAge(for:)` = `FUN_10058bb4c(weeks, date)` → `FUN_10058c1a4` → … → `FUN_10058bd88`.
- Scores stream (closure `FUN_10058fe50` → `FUN_10058c960`) builds `{scores, chronologicalAge = FUN_100589b14() (Double?), isCalibrating = FUN_10058feb4(scores, date)}`.
- Restriction stream: `Deferred` (`FUN_10058cef4` → `FUN_10058cc88`; `CurrentValueSubject` seeded with 6 = unknown) → `share` → `compactMap` (`FUN_1003afb50`).
- `CombineLatest(scores, restriction)` → `compactMap(FUN_10058c638)`, which produces `BioAgeState`.
- The view model (`FUN_100459120`, transform of the VM stream) calls `FUN_10045b834(…)`, which produces `BioAgeDisplayState`.
- The same builder is also used by `0x101e64ca8` and `0x101e8c9a0`.

```ts
// FUN_10058feb4 (asm 0x100590044–0x100590168)
isCalibrating = (s = scores.first(x => Calendar.current.isDate(x.weekStart, inSameDayAs: date))) ? s.bioEstimate == nil : false

// BioAgeRestrictionService (FUN_100597de8 → FUN_1005981b4, asm 0x1005983a4–0x1005986b0)
function restriction(profile: SharedUserProfile?, isPaid: Bool /*StoreModel via FUN_101e93180, debug override FUN_101b99830*/, onboardingDone: Bool) {
  const age = profile ? profile.ageYears /*FUN_10310e084*/ : nil
  if (age != nil && age < 18) return userUnderAge18            // cmp x25,#0x12 lt; precedes the paid check
  if (!isPaid) return unpaid
  if (!onboardingDone) return onboardingIncomplete
  if (profile?.birthday == nil) return missingAgeOrSex
  if (profile == nil || effectiveSex(profile) == other(2)) return missingAgeOrSex   // cmp w19,#2 → 3
  return nil /*4*/ }

// FUN_10058c638 (asm 0x10058c650–0x10058c6a4): input {scores, chrono?, isCalibrating, restriction? (4 = none, 5 = not yet known)}
if (restriction == NOT_KNOWN) → no emission (compactMap nil, 0xfcfe)
else if (restriction != nil) → BioAgeState.blocked(Data{scores, chrono}, restriction)   // 0x4000 | r<<8
else if (isCalibrating)      → .calibrating(Data)
else                         → .ready(Data)                                            // 0x8000

// FUN_10045b834(out, scores, chrono?, state, date)
(weekRange, daysUntilUpdate) = FUN_10045c230(date)   // startOfWeek(+1 week) formatting " - " and day count
range = chrono == nil ? [20, 40] : [chrono − 5, chrono + 5]
switch (state) {
  case calibrating: return .calibrating({weekRange, daysUntilUpdate, chrono, minAge: range.lo, maxAge: range.hi, missingBlood: FUN_10045dc80(cur)})
  case blocked(r):  return .blocked({r, weekRange, daysUntilUpdate, chrono, range.lo, range.hi, missingBlood})
  case ready:
    cur = FUN_10045bf60(scores, date)                    // this week's DerivedAgeScore
    if (!cur || cur.bioEstimate == nil) return .loading({weekRange, daysUntilUpdate})
    prev = FUN_10045bf60(scores, previous week)
    comparison = (prev?.bioEstimate == nil || |bio − prev.bio| < 0.1) ? noChange      // FUN_10045de0c: 0.1 at 0x104ebf1b0, fabd/fcmp
               : (bio − prev.bio <= 0 ? decreased(prev) : increased(prev))
    hist = sorted scores' bioEstimate ages (FUN_10045df3c)
    [minAge, maxAge] = gaugeRange(bio, cur.chronologicalAge, hist)                      // FUN_103c462fc
    return .ready({bioAge: bio, chronologicalAge, weekRange, daysUntilUpdate, minAge, maxAge, comparison, confidence: cur.bioEstimate.confidence, missingBlood})
}
missingBlood(cur) = cur == nil ? 9 : (cur.bloodEstimate == nil ? 9 − cur.presentBloodBiomarkerCount : nil)   // FUN_10045dc80; 9 = PhenoAge markers
function gaugeRange(bio, chrono, hist) {          // asm 0x103c46324–0x103c46448
  devs = [|bio − chrono|] ; if (hist.length) devs.push(|hist.last − chrono|)
  dev = max(devs)
  ladder = [5,10,20,30,45,60,75]                   // array 0x10621a008
  span = ladder.find(L => !(dev > 0.85*L)) ?? 75   // 0.85 = 0x3feb333333333333; empty ladder impossible
  return chrono >= 18 ? [max(chrono − span, 18), min(chrono + span, 120)] : [18, min(18 + span, 120)]
}
```
- Gating order: not-known restriction (nothing shown yet) → blocked → calibrating → ready, where ready falls back to loading when the current week has no bio estimate.
- F's "delta badge" at `0x100448a74` is a view helper. The model comparison is the week-over-week rule above.

### R8 — RESOLVED (request) / NOT IN IPA (proven) (row order)

- **Request** (`FUN_100557580`, calls in order). Filters through `FUN_102fcddc4`:
  - `deletedAt IS NULL`;
  - `date IS NOT NULL`;
  - `date <= D` (`0x102fee804`);
  - optional `date >= lower` (`0x102fee870`);
  - optional `markerId IN (array)` (`FUN_102fefd58`, only when the array argument is non-nil).
- After the filters come the join and selection (`FUN_10302f484`, `FUN_102fc7d40`, `FUN_102fd1540`), then the annotation `document.date AS "collectedAt"` (`FUN_10301ccc8` → `FUN_102febf40` → `FUN_102fddfec(…, "collectedAt")` → `FUN_102fce144`), then fetch (`FUN_102f5d354`, `FUN_102f4d23c`).
- No ordering term (`SQLOrdering`) and no limit is built anywhere in the function. **There is no ORDER BY and no LIMIT.**
- **Fold** (asm 0x100558264–0x100558624), per row in SQLite return order:
  - Unknown biomarker strings (`FUN_101c84b00` returns 0x59) are skipped (`b.ne`/continue at `0x100558298`, not a break).
  - If the row does not convert to a PhenoAge sample (`FUN_101c7fa0c` result tag 3), any existing entry for that marker is **removed** (`FUN_100baf020`).
  - Otherwise `dict[marker] = sample`, overwriting (`FUN_100557484` = assignWithTake). There is no date comparison.
- **Which sample wins:** the last convertible row SQLite returns for that marker. That order is SQLite query-planner behaviour (system libsqlite3, not app code). It depends on index choice among `idx_confirmed_biomarker_sample_biomarker`, `idx_confirmed_biomarker_sample_document_id`, `idx_health_document_date` and `idx_health_document_deleted_at` (schema strings 0x10593e070–0x10593e220):
  - With the biomarker index driving: insertion (rowid) order inside each marker.
  - With the date index driving: date ascending.
  - Boundary: the app supplies no ordering, so the IPA does not fix it.
- **Parity rule:** take the latest `collectedAt` per marker within `[D−365 d, D]`. Bevel will usually agree, but can pick an older re-uploaded report.

### R9 — RESOLVED: both of D's inferences confirmed

1. **The tonight planner reads the same SettingsModel value.** `TonightSleepNeededService` (descriptor 0x105244a9c: todayModel +0x40, healthData +0x48, settings +0x50) builds `CombineLatest4(todayModel.$today, healthData.$publishedData, settings.$sleepHours, healthData.$loadingStatus)` (`FUN_101d7e544`, decomp 101d7.c:10560–10650; `_TtC8Superset13SettingsModel::_sleepHours` projected value). It feeds `FUN_101d7ece0`, which reads the (hours, minutes) pair from the combined input (field +0x40) and calls `calculateSleepNeeded` `0x1015cc358`. This is the same Published property that the score, bank and Energy Bank read.
2. **The defaults getter.** `FUN_1019383e0` calls the existential `UserDefaultsServiceProtocol` witness +0x10 with key `SettingsUserDefaultsKeys(12)`.
   - The raw-value table entry at 0x106112260 = `"health_settings.sleep_goal_key"`.
   - The conformance is `0x104ff017c` with witness table `0x106113060`, where +0x10 = `FUN_101dd5ed0` → `FUN_101dd8b14` (routes through `UserDefaultsService.migrations` to a store) → `FUN_101b98e54` → `FUN_101b98028`.
   - That function is `objectForKey(key) == nil ? nil : Float(floatForKey(key))` and returns `0x100000000` (nil) when the key is absent.
   - The type is `Float?` hours. Nil becomes 7.5 (`fcsel` at `0x1019384f8`).
   - The method is read from key 13 (`health_settings.sleep_goal_method_key`) through witness +0x68 (String?), compared with the case table 0x1060d04f8.

### R10 — RESOLVED: A's "R" edges in G12, each verified

| Edge | Verification |
|---|---|
| Strain history → Target Strain | `FUN_1015efbc4` calls fold `0x1016e233c` and range `0x1016e2394` (direct callees). History values are `strainMetrics[startOfDay(d)]` appended per day; seed from `FUN_1015eecc0`. A second caller, `FUN_1016892a4` (today/service recalculation), runs the same kernels. |
| Recovery dictionary → Target Strain (and Cardio status) | `recoveryByDay[d]` lookup at `0x1015efe94`–`0x1015eff1c` inside `FUN_1015efbc4` (E, re-checked call graph). The input is the `recoveryMetrics` argument of `FUN_1015e9400` (R3 path). |
| Strain/workouts → Cumulative load | `FUN_1015ef6c4` (daily TRIMP from `workoutsByDay`) is a direct callee of `FUN_1015e9840`/`FUN_1015ec8e4`/`FUN_1015f166c`. Arguments come from `FUN_1015e9400(strainMetrics, recoveryMetrics, workoutsByDay, window, lookback)`. `0x1015ec700` has no callers or relative references; it is not on the path. |
| Sleep Needed → Sleep Score | Component inputs use `need = SleepNeeded.sleepNeededSeconds (+0xc)` in `0x1015c3524`/`0x1015c3938` (D M03.02, asm c3938 `1015c396c..1015c3a54`). |
| Sleep Score → Recovery (weight 0.30) | `S*0.3` at `0x1015b21d8`–`0x1015b2200` (C M01.02). `ignoreSleepScore` forces S = 100. |
| Recovery → automatic sleep goal (input types) | `0x101d75518` → `0x1015b0ba4` with `ignoreSleepScore = true` (`mov w6,#1` at `0x101d75cac`). The estimator `0x101d79054` takes `(primarySleep, recovery)` pairs, uses suffix(90) and the top 15% (D M16.01b). |
| Baseline spans | 60 days for every HealthDataBaselines metric, temperature included (`0x1015b9360` with 0x3c; `baselineDays` unused, B G05). The automatic goal uses 120 windows × 60 (D). |
| Sleep Bank 7 days | `bank(slice(-7))` in `0x1015be838`/`0x1015c09d0` → `0x1015cd324` (D M14.01). |

---

## Corrections to earlier findings (summary)

- A G01/G03, temperature: integration temperature = user baseline °F + deviation °F (`FUN_1016689e8`). The default baseline is seeded at 97.9, 98.1 or 95.7 °F (R2d).
- A G12: Energy Bank initial state is recovered (seed 0). The "R" edges are now verified (R10).
- A: the default CalculationsOptions are 0x101, so the BLOCKED sub-item is resolved.
- A G01(a): which consumer reads minute aggregates versus samples is now resolved (R5). Sample-to-stage lookup boundaries are `[start, end)` binary search, non-unspecified stages first.
- E M07.02 / M17.01: `FUN_1030c7b04` includes the interval start. Day S is computed. The warm-up is 60 days, the seed list is 15 values (14 used), and the active42 seed is 42 values.
- E M02.03: the UI ring is value/100. The dashboard ring has no upper clamp; the activity card clamps to [0, 1]. Labels round half-even (dashboard) or half away from zero (activity card).
- F M06: the display-state gating, the comparison status (week over week, |Δ| < 0.1 → noChange) and the gauge range are recovered. F's `101db7440` is not the freshness feed.
- G M13.04: Air/Google active energy does not feed TDEE.

## New discoveries
- HealthKit history fetches have a 300 s timeout. HR and glucose then fall back to 5-minute `discreteAverage` statistics buckets (R5).
- A temperature-baseline default exists, seeded from profile sex and age (R2d).
- The bio-age gauge range uses the ladder [5,10,20,30,45,60,75] with a 0.85 rule and is clamped to [18, 120] (R7).
- A blood row that cannot be converted deletes the marker's earlier sample in the fold (R8).
- Dashboard cards use one shared `DashboardDonutChart` with maxValue 100 for every metric type (R4).

## Hand-offs
- None blocking. If parity work needs the per-source split tag values used in R5 (0 = Garmin, 1 = Oura, 2 = Google), they come from `HealthDataSource.metadata` word +0x18. They are consistent with A's dispatcher note (Google metadata tag 2).
