# Agent C findings: Recovery (M01), Stress (M04), Energy Bank (M05)

Bevel 3.1.7 main binary. Addresses are unslid VAs. "decomp" = `/Users/adityajindal/bevel-re/out/decomp-main/<shard>.c:<line of function header>`. Scratch extracts, disassembly and helper scripts live in `/Users/adityajindal/bevel-re/work/C/` (`recovery.s`, `s_e344c.s`, `e_3698.s`, `fn.sh`, `dis.sh`, `ops.sh`, `swd.py`).

## 0. Facts that apply to all three families (read first)

**Ghidra operator names (affects earlier research).** Ghidra replaces `=` with `_` in Swift operator names, so `Comparable::>__infix` is **`>=`** and `Comparable::<__infix` is **`<=`**. Stub table: `0x104e57d6c` is `>`, `0x104e57d78` is `<`, `0x104e57d84` is `>=`, `0x104e57d90` is `<=` (all `Comparable`). `0x104e511f0` is `Date.>` and `0x104e511fc` is `Date.<` (strict). `0x104e51250` is `Date.==`. These come from `index/functions.tsv`. `work/C/ops.sh <start> <end>` lists the comparisons each function uses. Every inclusive or exclusive bound stated below was checked this way.

**Enum and struct layouts used below.** All were decoded from the Swift field descriptors with `work/C/swd.py`:

| Type (descriptor) | Cases or fields |
|---|---|
| `CalculatedMetric` (`0x105246bd4`) | 0 averageHeartRateVariability, 1 restingHeartRateVariability, 2 respiratoryRate, 3 restingHeartRate, 4 inactiveHeartRate, 5 sleepingHeartRate, 6 wristTemperature, 7 bodyTemperature, 8 spO2, 9–11 foodGlucose AUC/Peak/Delta |
| `HealthQuantityType` (`0x105277e88`) | 0 restingHeartRate, 1 heartRateVariability, 3 respiratoryRate, 4 heartRateMinuteAggregates, 5 heartRateSamples, 18 spO2, 19 temperature, 20 bodyTemperature … |
| CalculatedMetric → HealthQuantityType, byte table `0x104f935be` (also `0x104ff340c`) | `01 01 03 00 04 04 13 14 12 0f 0f 0f` |
| `CalculationsOptions` (`0x105236898`), 8 packed bytes | b0 hrvMethod (0 appleHealth, 1 bevelRMSSD), b1 rhrMethod (0 appleHealth, 1 bevel), b2 hrvContext, b3 rhrContext (MetricContext: 0 entireSleep, 1 remDeepSleep, 2 mindfulnessOnly, 3 sleepAndMindfulness, 4 entireDay), b4 caloriesDisplay, b5 temperatureSource (0 wrist, 1 body), b6 sp02Window, b7 rrWindow (MetricWindow: 0 entireSleep, 1 entireDay) |
| Default options | `0x101` (`0x101915fbc`, `0x101916484`): bevelRMSSD, bevel RHR, entireSleep for both contexts, wrist temperature, entireSleep SpO2 and RR windows |
| `WindowType` (`0x105233b58`) | 0 midnightToMidnight, 1 sleepSession, 2 sleepStartToSleepStart |
| `SampleContextType` (`0x1052332ac`) | 0 otherSleep, 1 remAndDeepSleep, 2 workout, 3 mindfulness, 4 awake, 5 exercise (Optional nil is tag 6) |
| `SleepStage` (`0x105233a48`) | 0 asleepUnspecified, 1 awake, 2 core, 3 deep, 4 rem, 5 inBed |
| `AggregateStatistics` (`0x1052311c8`) | average Float, stdDev Float, count Float, histogram `[HistogramValue]?` (Optional-nil marker: word2 == 1) |
| `HistogramValue` | value Int, count Int |
| `HealthMissingData` (`0x105233314`) | 0 recoveryHRV, 1 recoveryHRVBaseline, 2 recoveryRHR, 3 recoveryRHRBaseline, 4 recoverySleepScore, 5 stressRHRBaseline, 6 stressHR, 7 sleepMissingInputs |
| `HealthMetric` (`0x10529f840`) | 0 recoveryScore, 1 restingHeartRate, 2 heartRateVariability, 3 respiratoryRate, 7 meditationMinutes, 9 sleepScore, 30 stressScore, 31 activeStress, 32 inactiveStress, 33 sleepStress, 36 spO2, 37 temperature, 38 bodyTemperature … |
| `StressScoreInput` | averageHR Float?, mostRecentHRV HealthQuantitySampleWithStage?, averageHRV Float?, context SampleContextType? |
| `StressDataPoint` | timestamp, value Float?, hrvValue Float?, ahrValue Float?, level StressScoreLevel (0 high, 1 mediumHigh, 2 medium, 3 lowMedium, 4 low, 5 undefined), stage ActivityStage (0 active, 1 inactive, 2 sleep) |
| `EnergyBankInput` | averageHR Float?, mostRecentHRV?, context SampleContextType? |
| `EnergyBankInputWithStress` | input, rawStress Float?, displayStress Float? |
| `EnergyDataPointWithStress` | timestamp, energyValue Float, stressValue Float? (display), rawStressValue Float? |
| `EnergyRecalcSlice` | sleep, sleepStages, workouts, mindfulness, exercise (SortedLists), freezePoint, seedDate, window |

**Shared per-day baseline machinery.** Agent B owns this framework; it is traced here only as far as these families need it. The `HealthDataBaselines` actor (`0x10158bf80`) keeps two dictionaries keyed by `startOfDay(functionalDay.dayEnd)`:

- `perDay` (actor +0x18): `[Date: [CalculatedMetric: AggregateStatistics]]`. `0x101589ec8` builds it by running `0x10158b508` for each day, which calls `0x10158b7a4`, which calls `0x1015bab50(samples, [thatDay], config)`. That is the day's own window statistics:
  - daily metrics: the mean of that day's window;
  - combined metrics: population mean, SD and count of the day's samples, plus a histogram when `computeHistogram` is set (`0x1015baf78`, then `0x10183c038`).
- `baselines` (actor +0x10): `[Date: [CalculatedMetric: AggregateStatistics]]`, built by `0x1015869a4`.
  - Each tuple from `0x1015b9360(days, n, 60)` (decomp `1015b.c:5255`) has a history slice `days[max(0,i−60) ..< i]` for i ≥ 2, so it **excludes the day itself**. For i = 0 and i = 1 the slice is `days[0..<1]`, so the oldest day is its own baseline.
  - The per-day dictionaries of those history days are combined by `0x10158bad4`:
    - daily aggregation (`0x10158db9c`): `statistics(mean of each day's average)`, i.e. mean, population SD and count = number of days;
    - combined aggregation (`0x10158d9b8`): pooled Chan merge with **(n−1)** denominators. Seed with day 0 as `(m, s², c)`; for each next day `(mᵢ, sᵢ, cᵢ)` set `N=c+cᵢ; d=mᵢ−m; var=((c−1)·var + sᵢ²·(cᵢ−1) + d²·(cᵢ·c/N))/(N−1); m = d·cᵢ/N + m; c=N`; finally SD = sqrt(var). Histograms are merged by summing counts per bpm (`0x10158d680`), then sorted ascending.
- The 60 comes from the literal `0x3c` at every recovery and baseline caller (`0x1017db4a4`, `0x100054dc4`, `0x10005e5d4`, `0x10161fc44`). `BaselineConfiguration.baselineDays` (+0x28: 30 or 60) is **not read** on these paths. `0x10158bad4` reads only aggregationMethod, windowType and contexts (stride-0x38 reads at `10158.c:7595`), and `0x10158b7a4` reads only computeHistogram (+0x30).
- The statistics helper `0x10183bdc0` skips nil, takes a Float32 sequential sum / n, uses the population SD, and has no minimum count and no outlier rejection.

---

## M01 Recovery

### M01.01 — RESOLVED

**Call path.**
- Recalculation pipeline `0x1017d7fb8` ("Calculate Recovery History", string `0x1059280b0`) → closure `0x1017df7f4` → `0x1017d9358` (decomp `1017d.c:6846`).
- `0x1017d9358` keeps the functional days with `day.dayEnd <= startOfDay(X)+1d` (`Comparable.<=`), then calls `0x1015b9360(days, recoveryDays, 60)`.
- For each day it calls **`calculateRecoveryMetricsForDay(selectedDay:sleepHistory:metricHistories:baselines:mindfulness:options:ignoreSleepScore:isToday:)`** = `0x1015b0ba4` (`1015b.c:9723`, name string `0x10591bf80`) with `ignoreSleepScore=false` (`w6=0` at `0x1017d98cc`) and `isToday = (day.dayStart == startOfDay(now))`. `isToday` only enables the debug log (`0x1015b2224`).
- The second caller `0x101d75518` (sleep-goal path, 120 days) passes `ignoreSleepScore=true` (`w6=1` at `0x101d75cac`).

**Which HRV value Recovery uses (the "current HRV").**
- Input samples: `metricHistories[HealthQuantityType.heartRateVariability (1)]`, read with `FUN_101e3d520(1, …)`.
- Config: factory `0x101e23994(metric=1 restingHRV, options)`:
  - `aggregationMethod = daily`;
  - `windowType = [ (0x0202000101 >> (hrvContext*8)) & 0xff ]`, i.e. entireSleep→sleepSession, remDeep→sleepSession, mindfulnessOnly→midnight, sleepAndMindfulness→sleepStart→sleepStart, entireDay→sleepStart→sleepStart;
  - `contexts = table 0x106115818[hrvContext]`;
  - `forceIncludeMindfulness = (hrvContext == 3)`.
- Value: `FUN_1015bab50(samples, [selectedDay], cfg)`. This is the **arithmetic Float32 mean of every HRV sample whose stage passes the context filter inside that window**. Daily mode with one day gives `mean(dayValues)`, and the day mean is then fed through the statistics helper. The selector catches errors such as a missing sleep session, which leaves the value nil.
- With defaults (entireSleep), the current HRV is the mean of all HRV samples tagged otherSleep or remAndDeepSleep inside the primary sleep session window. It is a per-sample average computed locally. **Bevel never uses a source-supplied nightly HRV aggregate.**
- `hrvMethod` (appleHealth vs bevelRMSSD) is not read by Recovery or the config factory. It chooses which samples populate key 1 (ingestion, handed to Agent A).

**Source of the samples on Google.**
- Google data reaches the app as `IntegrationHealthSampleResponse{sourceId, sampleType:String, startDate, endDate, value, platform}` (`0x10520bc44`), decoded into `IntegrationHealthSample` (type `IntegrationHealthSampleType.heartRateVariability`, tag 8; `GoogleHealthSampleSyncType.heartRateVariability`, tag 2).
- The conversion from Google's API into these timestamped samples happens **server-side**. The IPA only decodes the DTO (boundary type `0x10520bc44`, fields from `0x105b38fd8`).
- Mapping `IntegrationHealthSampleType` → `HealthQuantityType` and stage tagging: handed to Agent A.

**Which RHR value Recovery uses.**
- Samples: key 0 (`HealthQuantityType.restingHeartRate`).
- Config: factory metric 3. Combined aggregation; window and contexts chosen by rhrContext exactly as for HRV, with `forceIncludeMindfulness = (rhrContext == 3)`.
- Current RHR = the mean of all selected samples (`FUN_1015bab50`).
- For Google, `HealthDataRHRCalculation.googleHealth` is `IntegrationRHRCalculation.bevel(hrHistory: [HealthQuantitySampleWithStage])` (descriptor `0x105231e38`/`0x105231e54`). The RHR "samples" are therefore heart-rate samples, so RHR = **mean HR over the sleep session's sleep-stage samples**.
- UI copy at `0x1059546f0` says ranges are "standardized to sleeping HR". The wiring is handed to Agent A.

**Other inputs.**

| Input | Samples | Window and context | Current value | Baseline |
|---|---|---|---|---|
| Respiratory rate | key 3 | `[rrWindow == entireDay ? midnight : sleepSession]`, no contexts, `useEndTime = false`, via the selector `0x1015b9fbc` directly (array object built at `0x1015b1b20`) | mean of the window's samples | `baselines[day][respiratoryRate (2)]` |
| SpO2 | key 18 | `[sp02Window == entireDay ? midnight : sleepSession]` | mean of the window's samples, Float32 sequential sum / n (`0x1015b1dc0`–`0x1015b1e0c`), passed through stats, then **×100** | `FUN_101586158(day, spO2 (8))`, i.e. the same dictionary |
| Temperature | `temperatureSource == body ? key 20 (metric 7) : key 19 (metric 6)` (`0x1015b1e98`–`0x1015b1ed0`) | daily aggregation, **`windowType=[midnightToMidnight]` for both sources**, `useEndTime = true`, no contexts (config built inline at `x19+0x300`, `0x1015b1ea0`–`0x1015b1ec0`). Both static arrays `0x1060b8820` and `0x1060b8848` hold element 0. | daily mean via `FUN_1015bab50` | `FUN_101586158(day, metric)` |
| Sleep | `sleepHistory[day]` (`FUN_1017ff48c`, 0x60-byte record) | — | first Float? field (sleep score) | — |
| Mindfulness | segments with `start >= dayStart && start <= dayEnd` (`Comparable.>=` / `<=`) | — | `Σ(end − start)/60` → `HealthMetric.meditationMinutes` | — (**not** part of the score) |

SpO2 baseline values must be fractions (0.97). Percent inputs break the deficit term; see M01.02.

**Baseline lookup.** `baselines[Calendar.current.startOfDay(selectedDay.functionalDay.dayEnd)][metric]` for HRV, RR and RHR (inlined at `0x1015b0ffc`, `0x1015b11a4` and `0x1015b15c8`), plus `FUN_101586158` for SpO2 and temperature.

**Evidence.** Disassembly is in `work/C/recovery.s`:
- HRV normalisation: `0x1015b13e8`–`0x1015b1470`.
- RHR: `0x1015b1a6c`–`0x1015b1b14` and `0x1015b36c8`.
- RR: `0x1015b1a90`–`0x1015b1aec`.

### M01.02 — RESOLVED

**Baseline inclusion.**
- `baselines[D]` holds statistics over the **per-day aggregates of up to 60 preceding functional days, excluding D**. The oldest day in the run uses `days[0]`, which includes itself.
- restingHRV (daily): population SD of the nightly means, count = number of nights.
- RHR and RR (combined): pooled n−1 statistics of all selected samples.
- Temperature and SpO2 (daily): statistics of daily means.
- A day is skipped when its selector returned nothing, so missing days are omitted rather than counted as zero.
- No minimum count: one history night gives SD 0. **No outlier, Winsorization or nonfinite filter** exists anywhere on the path (`0x10183bdc0`, `0x10158db9c`, `0x10158d9b8`, `0x1015bab50`).
- The values are `doubleValue` narrowed to Float32 in the selector `0x1015b9fbc` (`1015b.c` region, loop at the end of the function).

**Exact kernel.** Float32, operation order taken from the ARM64 instructions:

```ts
const f = Math.fround;
// normalised components
function compUp(cur, mean, sd)   { let z = sd === 0 ? 0 : f(f(cur - mean) / sd);      // HRV  (0x1015b13f8)
  if (z < -1) return 0; return f(f(f(Math.min(z,1)) * 0.5 + 0.5) * 100); }           // fcsel gt / mi; NaN z -> NaN
function compDown(cur, mean, sd) { if (sd === 0) return 50;                            // RHR, RR (0x1015b1a74 / 0x1015b1a84)
  const z = f(-f(cur - mean) / sd); if (z < -1) return 0;                            // b.pl: NaN goes to the compute path
  return f(f(f(Math.min(z,1)) * 0.5 + 0.5) * 100); }

H = compUp(hrvCur, hrvMean, hrvSD)        // only if hrvCur != nil && baseline != nil
R = compDown(rhrCur, rhrMean, rhrSD)      // only if rhrCur != nil && baseline != nil
B = compDown(rrCur, rrMean, rrSD)         // optional
S = ignoreSleepScore ? 100 : sleepScore   // required unless ignoreSleepScore

rrAdj   = (rrCur && rrBase) ? f(f(B + -50) * 0.2) : 0                               // 0xc2480000, 0x3e4ccccd (0x1015b20c4)
o2Adj   = (spo2Cur && spo2Base)
          ? (() => { let d = f(f(f(mean - sd) * 100) - spo2CurPct); if (!(d > 0)) d = 0;   // fcsel ls -> 0
                     const a = Math.fround(Math.atan(f(d / 5)));                            // atanf
                     const p = f(a * 30); return p < 30 ? f(-a * 30) : -30; })()            // 0x1015b366c..0x1015b36bc
          : 0
tempZneg = (tempCur && tempBase) ? (sd === 0 ? -0 : f(-f(tempCur - mean) / sd)) : nil  // 0x1015b2bcc
tempAdj = tempZneg == nil ? 0 : Math.max(-30, f(Math.fround(Math.atan(f((tempZneg > 0 ? 0 : tempZneg) / 10))) * 30)) // fmaxnm

sum = f(f(f(f(f(f(H * 0.4) + f(R * 0.3)) + f(S * 0.3)) + rrAdj) + o2Adj) + tempAdj)      // 0x1015b21d8..0x1015b2200
recovery = sum <= 1 ? 1 : (sum > 100 ? 100 : sum)                                   // fcsel ls / gt; NaN stays NaN
```

Constants are Float32: 0.4 = `0x3ecccccd`, 0.3 = `0x3e99999a`, 0.2 = `0x3e4ccccd`. RR, O₂ and temperature are added in exactly that order after the three weighted terms (`fadd s3`, `fadd s2`, `fadd s15`).

**Reference cases.**
- Zero SD: HRV gives 50, RHR and RR give 50, temperature gives −0 (adjustment −0), SpO2 gives a deficit of `(mean)*100 − cur`.
- **SpO2 0.97 vs 97:** the baseline and current values must be fractions. If both are percents, the deficit becomes `100·(mean − sd − cur)`, about 100× too sensitive, and saturates at −30 for a 0.3-point drop. If only the current value is a fraction, there is no penalty.

**Correction to earlier research.** The body-temperature window was described as "sleep start to sleep start". The static window arrays used for metrics 6 and 7, both in the factory (`0x106115550` and `0x106115528`) and in Recovery (`0x1060b8820` and `0x1060b8848`), each hold the single element **0 = midnightToMidnight**, verified with xxd. The `useEndTime=true` part is correct.

### M01.03 — RESOLVED

**Gate.**
- A score is produced only when all of these hold: HRV current and HRV baseline present, RHR current and RHR baseline present, and a sleep record with a non-nil score (unless `ignoreSleepScore`). Branch at `0x1015b2198`–`0x1015b21b8`, gating byte `[x19+0x214]`.
- Otherwise the function returns `nil` (score 0.0 with nil flag 1) and builds `missingData: [HealthMissingData]` in the order 0 recoveryHRV, 1 recoveryHRVBaseline, 2 recoveryRHR, 3 recoveryRHRBaseline, 4 recoverySleepScore (decomp `1015b.c:9723`, tail of function).
- RR, SpO2 and temperature never gate.
- Every selector or aggregate error is swallowed (`cbz x21` / `swift_errorRelease`, e.g. at `0x1015b12dc`) and becomes nil.

**Output.**
- `RecoveryMetrics{recoveryScore Float?, metricMeasurements [HealthMetric: MeasurementValue], missingData}`, descriptor `0x10523157c`.
- Measurements:
  - recoveryScore(0)
  - sleepScore(9)
  - spO2(36) as a percent
  - temperature(37) or bodyTemperature(38)
  - respiratoryRate(3)
  - heartRateVariability(2) as `valueWithBaseline{current, mean, sd, z}`
  - restingHeartRate(1)
  - meditationMinutes(7)
- Per-day results go into an enum array in `0x1017d9358`: case computed (score plus dictionaries) vs. day-only.

**Presentation.**
- **Calibration badge:** `HealthMetricCalibrationService` (`0x101cc5a24` → `0x101cc5614`, decomp `101cc.c:5059`/`4674`). The window is 60 days for `recoveryScore` (tag 0) and 30 days for stressScore, inactiveStress and sleepStress (tags 30, 32, 33), at `0x101cc5ae4`–`0x101cc5b0c`. A day counts as `calibrated` when **more than 4 days** (≥ 5) have a value in that window (`4 < count`). The flag only changes the badge, never the score.
- **Demo mode** overrides recovery, sleep and strain via the `demo_mode.recovery_score_override` key (`0x10591b9d0`). Not production.
- **Sleep-goal path:** `0x101d75518` recomputes 120 days with sleep fixed at 100. These are the recoveries the automatic sleep goal ranks.
- Residual: the integer rounding of the dashboard label was not traced. Handed to the UI owner.

---

## M04 Stress

### M04.01 — RESOLVED (connector gap stated)

**What the stress path consumes** (`0x1015e344c`, decomp `1015e.c:7281`):
1. `metricHistories[heartRateVariability (1)]`: individual HRV samples (`HealthQuantitySampleWithStage`) with `startDate`.
2. `metricHistories[heartRateMinuteAggregates (4)]`: minute-level HR.

Both are sliced to `startDate ∈ [start, end)` by binary search (four `Comparable.>=` calls). They are used like this:
- **mostRecentHRV** for a 6-minute slot `[s, e)` = the latest HRV sample with `startDate > s − 36 min && startDate < e`. Backward scan at `0x1015e2110`–`0x1015e21f0`; `FUN_1030cbe7c(36)` subtracts minutes (`→ 0x1030cbc20`). This value drives HRV stress outside workouts.
- **averageHRV** for the slot = the mean of HRV samples with `startDate ∈ [s, e)` (two `>=` searches). It is used only when the slot context is workout.
- **HRV baseline** = `averageHeartRateVariability` (combined, midnightToMidnight, all contexts) over per-day aggregates whose day key lies in `[to − 30 d, to]`, where `to = min(endOfDay(dayEnd) − 1 s, now)`:
  - `0x1015e04f8` (`1015e.c:264`): `FUN_1030cbe40(+1 day)`, `startOfDay`, `FUN_1030cbe94(−1 s)`, `Comparable.<` against now, then `Calendar.date(byAdding:.day, −30)`;
  - `0x101588d0c`: `>=` and `<=`, so 30 calendar days **including the current day**.

**What Bevel needs from a Google-style source.**
- Timestamped intraday HRV samples (`IntegrationHealthSampleType.heartRateVariability`), at a cadence of at least one per 36 minutes during waking hours, for HRV to count. Without one the slot falls back to HR-only stress.
- At least 30 days of the same samples (all contexts) to form the mean/SD baseline.
- Minute HR aggregates (`heartRateMinuteAggregate`) both for the slot HR and for a 30-day awake-context histogram.

**Pulse comparison.** `src/server/sources/google/map.ts:59-61` stores only the **daily** `averageHeartRateVariabilityMilliseconds` and `deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds` (data type `daily-heart-rate-variability`). Pulse has no intraday HRV samples, so it cannot form `mostRecentHRV`. A Bevel-equivalent Pulse stress would be HR-only for every slot unless an intraday HRV fetch is added.

**Boundary.** The backend endpoint behind `GoogleHealthSampleSyncType.heartRateVariability` turns Google data into these samples server-side. The IPA only decodes `IntegrationHealthSampleResponse` (`0x10520bc44`).

### M04.02 — RESOLVED

**Pipeline (dashboard and history).**
- `0x1017d9b24` → `0x1015e5d78` (daily summary) → core `0x1015e344c(metricHistories, functionalDay, …, contextHistory{sleepStages, workouts, exercise, mindfulness}, baselines, debug=false, start = FunctionalDayWithSleep.start (0x1016ed088), end = …end (0x1016edb4c))`.
- Charts use `getDayStressHistoryForCharts` = `0x1019486d8` with the same core.
- Then `0x1015e457c` ("filterActiveStressAndClampData").

**Step 1: slots.**
- `0x1015e1940` (`1015e.c:3307`) calls `FUN_100bff304(360.0 s, start, end)`.
- The grid starts at **UTC midnight** of `start`: `Calendar.current` with `timeZone = TimeZone(identifier:"UTC")` (`0x100bff620`), then `date(bySettingHour:0, minute:0, second:0, of:start, .nextTime, .first, .forward)`.
- It strides 360 s **through** `end` (`0x10003a854`, a StrideThrough with a didReturnEnd flag).
- Intervals are `[tᵢ, tᵢ₊₁]` for each `tᵢ >= start` (`Comparable.>=`).

**Step 2: per-slot inputs.**
- HR = samples with `startDate ∈ [s, e)`, read through a monotonic cursor with `Date.<`.
- **averageHR** (`0x1015e0be0`): sort ascending.
  - n = 0 → nil.
  - n < 8 → median: odd n gives `a[n/2]`; even n gives `f(f(a[n/2−1] + a[n/2]) * 0.5)`.
  - n ≥ 8 → trimmed mean: `k = min(trunc(f(n)*0.15f), (n−1)/2)`, mean of `a[k ..< n−k]` with a Float32 sequential sum / `f(n−2k)` (`0x1015e0b4c`, `0x1015e0a78`).
- HRV values as described in M04.01.
- **Context** (`0x1015e0ca8`). The segment search `0x1015df720` uses overlap `seg.end >= s && seg.start <= e`. Priority order:
  1. workout → 2
  2. exercise → 5
  3. sleep stage (via `0x1015df41c`): rem(4) or deep(3) → remAndDeepSleep(1); core, asleepUnspecified or inBed → otherSleep(0); awake(1) falls through
  4. mindfulness → 3
  5. otherwise awake → 4

**Step 3: gap fill** (`0x1015e26e4`). For a slot whose averageHR is nil: `L = hr[i−1] ?? hr[i−2]`, `R = hr[i+1] ?? hr[i+2]`, both read from the original array. If both exist, `averageHR = f(f(L+R)*0.5)` (`0x1015e2f58`) and the other fields are kept. Otherwise the slot stays nil.

**Step 4: baselines** (`0x1015e04f8`):
- HRV mean and SD as described in M04.01.
- HR distribution = `inactiveHeartRate` histogram (heartRateMinuteAggregates; midnight window; contexts `[[awake]]`; per-day histogram `0x1015baf78` → `0x10183c038` with key `Int(trunc(bpm))` (`fcvtzs`); summed over the same 30-day range, sorted ascending).
- CDF: `0x1014ddf08`, `cdfᵢ = Σ_{j≤i} countⱼ/total` (Double, accumulated in order).
- If the histogram is missing, every point has a nil score and `HealthMissingData.stressRHRBaseline (5)` is appended (`0x1015e3734`).

**Step 5: kernel** (per point, `0x1015e3e1c`–`0x1015e41f0`):

```ts
if (averageHR == nil || cdf == nil) score = nil
else {
  // HR percentile p (Double); keys are Int bpm
  let hrScore = 0                                     // also when cdf empty or hr < key0
  if (cdf.length && hr >= key0) {
    let p = hr === key0 ? cdf[0].v : 1.0
    if (hr !== key0 && cdf.length > 1) {
      i = first index in [1,n) with key >= hr      // lower bound
      if (i < n) p = key[i-1]===key[i] ? (v[i-1]+v[i])*0.5 : v[i-1] + (v[i]-v[i-1])*((hr-key[i-1])/(key[i]-key[i-1]))
    }
    // piecewise curve, table 0x1060b9040: (0,0)(0.1,3)(0.4,18)(0.5,30)(0.75,45)(0.9,60)(0.97,85)(1,100)
    if (p > 0) hrScore = p > 1 ? 100 : f(interp_double(p))     // equal-key segment -> average
  }
  // HRV
  let hrv = nil
  if (hrvMean != nil && hrvSD != nil && mostRecentHRV != nil)
    hrv = context === 2 /*workout*/ ? averageHRV /*may be nil*/ : f(mostRecentHRV.doubleValue)
  let s
  if (hrv == nil) s = hrScore
  else {
    let x = 4
    if (hrvSD !== 0) { const z = f(f(hrv - hrvMean)/hrvSD); x = z < -4 ? 0 : f(Math.min(z,3) + 4) }
    const y = f(f(x/7)*100); const hrvScore = y < 0 ? 100 : f(100 - Math.min(y,100))
    s = f(f(hrvScore*0.4) + f(hrScore*0.6))          // 0x3ecccccd, 0x3f19999a
  }
  score = s >= 0 ? s : 0                              // NaN -> 0
}
level = score==nil ? undefined(5) : score < 30 ? low(4) : score < 60 ? medium(2) : high(0)
stage = ctx==nil?inactive : [sleep,sleep,active,inactive,inactive,active][ctx]   // 0x0101000202 table
```

**Step 6: display filter** (`0x1015e457c`). Points with stage == active get `value`, `hrvValue` and `ahrValue` set to nil and level `undefined`. Every other value becomes `min(value, 100)`. **There is no temporal smoothing** beyond the per-slot median or trimmed mean and the gap fill.

**Step 7: daily metrics** (`0x1015e5d78`, `1015e.c:5181`):
- stressScore = Float32 mean of the non-nil filtered values.
- Per-stage means feed inactiveStress and sleepStress.
- `HealthMissingData.stressHR (6)` is appended when every value is nil.
- Live status (`0x1016e48e0`): `CurrentStressStatus{score = last non-nil, highest = max, lowest = min, average = mean}`, levels at the same 30/60 thresholds.

**Reference cases.**
- Same HR with and without HRV: the score is the HR score alone vs `0.4·hrvScore + 0.6·hrScore`.
- z = −4 gives hrvScore 100, z = 0 gives 42.857, z = 3 gives 0.
- Zero SD gives 42.857.
- Stale nighttime HRV during daytime: older than 36 minutes, so HR-only.

**Corrections.**
- The "average HR" fed to stress is a **median** (n<8) or **15% trimmed mean** (n≥8), not a mean.
- The HRV baseline is the 30-day `averageHeartRateVariability`, including the current day, not the resting-HRV baseline.
- Thresholds 30/60 were not in the earlier research.
- The earlier "partial history/context processing" is now fully specified.

---

## M05 Energy Bank

Service: `EnergyBankService.recalculateCurrentEnergyBank(latest:slice:windowEnd:metricHistories:)`. The entry is `0x10154229c` (`10154.c:1357`); the continuations are `0x1015424a0`, then `0x101542f80`, then `0x101543544` → `0x10154152c` (`constructEnergyBankScoreInputs(slice:metricHistory:windowStart:windowEnd:baselines:includePrototypeData:)`), then `0x101543618` and update `0x101543698` ("Generate Energy History", `10154.c:6615`).

### M05.01 — RESOLVED

**Seed** (`0x1015424a0`):
- `latest: EnergyDataPoint?` is non-nil: seed = `(latest.timestamp, latest.energyValue)`.
- `latest` is nil: seed = **`(slice.seedDate, 0.0)`** (`*(float*)(seed+energyOffset) = 0` with `slice + 0x28`). `slice.seedDate = window.start`, where `window` is the slice's DateInterval argument (`0x10154edc8`, `DateInterval.get_start`).
- `windowStart = seed.timestamp`; `windowEnd' = min(now, windowEnd)` (`Comparable.<`).
- Callers:
  - full recalculation `0x101532ecc` passes `latest=nil`;
  - incremental `0x10153aa2c` passes `latest = the last cached EnergyDataPoint`;
  - `0x101531dc0` passes an explicit point.
- **Pulse's `.6·recovery + .4·sleep` seed has no counterpart.**

**Per-call constants.**
- `sleepGoalSeconds = f(f(f(minutes)/60) + f(hours)) * 3600`. Hours and minutes come from the published sleep-goal setting (singleton `0x106a10688`, keypaths `0x104f91828`/`0x104f91850`; `0x10154376c`–`0x10154378c`).
- `awake[day]` (see M05.02).
- Stress baselines come from `HealthDataBaselines.load(windowStart, 30 days)` (`0x10158cd6c` with argument 30 at `0x1015432a0`).

**Input points** (`0x1015415bc`):
1. `0x10153f504` builds 360 s UTC-aligned slots `[windowStart … windowEnd']` with:
   - **averageHR = arithmetic mean** of heartRateMinuteAggregates with `start ∈ [s, e)` (not the median used on the stress dashboard);
   - averageHRV = mean of HRV with `start ∈ [s − 36 min, e)`;
   - mostRecentHRV = latest HRV with `start ∈ (s − 36 min, e)`;
   - context from `0x1015e0ca8` over the slice's SortedLists.
2. `0x10154062c` fills HR gaps with the same ±1/±2 neighbour average (`0x101540f8c`).
3. `0x1015e493c` computes **raw stress**, identical to the M04 kernel. The baselines are recomputed via `0x1015e04f8` whenever `startOfDay(point) >` the current baseline day.
4. `0x1015e457c` computes **display stress** (active slots set to nil, value ≤ 100).
5. `0x101538478` zips the arrays into `EnergyBankInputWithStress`.

**State update** (per point, in order; disassembly `0x1015437c0`–`0x101543c84`, `work/C/e_3698.s`):

```ts
let E = seed.energyValue
for (pt of points) {
  const awakeSec = awake.get(startOfDay(pt.ts)) ?? 57600          // 0x47610000
  const c = pt.input.context ?? 6, S = pt.rawStress               // Float?
  let charging, base
  if (c === 0 || c === 1)      { charging = true;  base = f(80 / sleepGoalSeconds) }
  else if (c === 3)            { charging = true;  base = f(50 / awakeSec) }
  else /* 2,4,5,6 */           { charging = S != nil && S < 20;    base = f((charging ? 15 : 60) / awakeSec) }
  let delta
  if (S == nil) delta = f(f(base * 0.7) * 360)                      // 0x3f333333
  else if (charging) { const k = f(Math.fround(Math.pow(0.93, f(S + -5))) + 0.1)   // powf(0x3f6e147b), +0x3dcccccd
                       delta = k <= 1 ? f(f(base * k) * 360) : f(base * 360) }
  else               { const k = S > 100 ? f(Math.fround(Math.pow(1.0115059614181519, S)) + 0.40839999914) // 0x3f817907, 0x3ed119ce
                                         : f(Math.fround(Math.pow(1.0150359869003296, S)) + -0.89999997615) // 0x3f81ecb3, 0xbf666666
                       delta = f(f(base * k) * 360) }
  const expo = charging ? -f(E + -60) : f(E + -40)
  const cap  = Math.min(1, Math.fround(Math.pow(1.0499999523162842, expo)))       // 0x3f866666
  const step = f((charging ? 1 : -1) * f(delta * cap))
  emit({ timestamp: pt.ts, energyValue: E /* value BEFORE this slot */, stressValue: pt.displayStress, rawStressValue: S })
  const n = f(E + step); E = n <= 1 ? 1 : (n > 100 ? 100 : n)   // NaN -> NaN path keeps n
}
```

Notes on the update:
- A workout, exercise or awake slot **charges** when raw stress < 20.
- Raw stress is ≤ 100 by construction, so the S > 100 branch is unreachable in practice.
- With seed 0, the first slot clamps to ≥ 1.

### M05.02 — RESOLVED

**Grid.** 6-minute slots on a UTC-midnight-aligned grid (`0x100bff304`), from the first grid point at or after the seed timestamp, through `min(now, windowEnd)`. There is **no reset at day boundaries**; the state carries across midnight.

**Gaps.**
- Missing HR is bridged only when a value exists within 2 slots on both sides.
- Otherwise the slot keeps its context (awake when no segment matches), with stress nil.
- During sleep a nil-stress slot charges at 70% of its rate; awake it drains at `60/awake·0.7`.

**Awake-seconds table** (`0x10154f680`, then `0x101541cf4`):
- Over `[windowStart − 8 days (FUN_1030cbe4c, subtract), windowEnd']`, each slice sleep session that touches the range is split at local midnight. Its seconds accrue to `startOfDay` of each part.
- `awakeDay = 86400 − sleepSeconds` (`0x47a8c000`, `0x10154ff64`).
- Then a rolling mean over the sorted days: for each day d, average every entry with date `<= d` (`Comparable.<=`) and `>= d − 6 d` (removal `Date.<`). When **count > 1**, store it at `d + 1 day`.
- Lookup key is `Calendar.current.startOfDay(point)`. When the key is missing the default is 57600.

**DST.** Slots are in UTC. The day keys use `Calendar.current`.

### M05.03 — RESOLVED

**Raw vs display stress.**
- Raw = full M04 kernel over energy-specific slot inputs (mean HR; averageHRV window extended back 36 minutes); it drives the update.
- Display = raw with active-stage slots set to nil and clamped ≤ 100; it is stored as `stressValue`.

**Missing stress.** Raw nil happens when HR is nil after interpolation or the HR histogram baseline is missing. It uses the 0.7 factor.

**Interpolation.** Interpolation applies to HR only; stress and HRV are not interpolated.

### M05.04 — RESOLVED

Mindfulness enters only as context 3, through `slice.mindfulness` overlap in `0x1015e0ca8`:
- Priority is workout > exercise > non-awake sleep stage > mindfulness > awake.
- A mindfulness slot always charges at `50/awakeSeconds`, whatever the stress.
- With no mindfulness segments the slot is awake (charge 15/awake if stress < 20, else drain 60/awake).
- In Stress, a mindfulness slot is stage `inactive`, so it is kept in the display.
- In Recovery, mindfulness only produces `meditationMinutes` and the forced-mindfulness baseline option.

### M05.05 — RESOLVED

**Persistence.**
- Points are `EnergyDataPointEntity` rows in Core Data, written by `EnergyBankStorage`: `upsertEnergyDataPoints`, `deleteEnergyDataPointsInRange(from:to:)`, `fetchEnergyDataPoints(earliestDate:)` (strings `0x10591a3f0`–`0x10591a630`).
- The incremental path resumes from the last cached point, which re-emits that timestamp and value as the first output.
- `clearCacheAndFullRecalculate()` re-seeds at `(window.start, 0)`.
- The slice carries a `freezePoint`: either a supplied date or `FunctionalDayWithSleep(startOfDay(today)).start` via `0x1016ed088` (`0x10154ec98`–`0x10154eca0`).

**Calibration.** No calibration state exists for Energy Bank. The `CalibrationState` service covers only recovery and stress metrics (M01.03).

**Derived presentation** (`0x101539418`, `EnergyBankDerivedMetrics`):
- `energyCharged` = Σ positive consecutive deltas.
- `energyDrained` = Σ |negative deltas|.
- Charging segments and the last charge come from runs of increases. A run has a special case when the value equals 1.0 (`10153.c:9706`, lines around the `== 1.0` tests).

---

## New discoveries
- **Calibration rule** (`0x101cc5614`): a metric is "calibrated" on a day when it has ≥ 5 days with a value in the last 60 days (recovery) or 30 days (stress family).
- **Ghidra operator naming:** `<__infix` is `<=` and `>__infix` is `>=`. Any earlier finding built on Ghidra's `<`/`>` should be rechecked.
- **Energy Bank seeds from 0** when it has no cached history.
- **Energy and stress use different HR estimators:** mean (energy) vs median / 15% trimmed mean (stress dashboard).
- **Sleep-goal recoveries:** the automatic sleep goal ranks recoveries computed with sleep = 100 over 120 days (`0x101d75518`, `w6=1`).

## Hand-offs
- **Agent B:**
  - `FunctionalDayWithSleep` start and end (`0x1016ed088`, `0x1016edb4c`), the window selector `0x1015b9fbc`/`0x1015b9928`, and the `perDay` builder `0x101589ec8`;
  - confirm that `baselineDays` is unused and that the pooled n−1 merge in `0x10158d9b8` applies to every combined metric.
- **Agent A:**
  - `IntegrationHealthSampleType` → `HealthQuantityType` mapping and stage tagging for Google HRV, HR minute aggregates and SpO2 (percent vs fraction; Recovery needs fractions);
  - `IntegrationRHRCalculation.bevel(hrHistory)` wiring (RHR = HR samples);
  - `hrvMethod`/`rhrMethod` sample selection;
  - the source of the slice's mindfulness, workouts and exercise.
- **Sleep owner:** the sleep-score record in `sleepHistory`; the sleep-goal hours/minutes setting used by Energy Bank.
- **UI:** label rounding of the recovery, stress and energy values.
- **Other:** `0x1015d2f78`/`0x1015d36f4` (7-day windows, daytime-HR family) belong to another family.
