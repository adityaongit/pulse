# Agent B findings: shared machinery (G04–G09)

The corpus is `/Users/adityajindal/bevel-re/out/decomp-main/<shard>.c`, and line numbers point at each function's `// ====` header. Addresses are unslid VAs. Names come from `work/B/ev/analysis/recovered-symbols.tsv` (BevelCore helpers are named there) and from Swift reflection metadata (`work/B/ty.py`). The scratch tools are in `/Users/adityajindal/bevel-re/work/B/`: `fn.py`/`fnc.sh` (annotated decomp), `ss.py` (strings plus Swift-literal xrefs), `ty.py` (type fields) and `D/dis.sh` (objdump).

Key type layouts, recovered from reflection:

- `FunctionalDay {dayStart: Date, dayEnd: Date}` (desc 0x10523300c).
- `FunctionalDayWithSleep {functionalDay, primarySleep: SleepSession?, nextPrimarySleep: SleepSession?, naps: [SleepSession]}` (0x105233034).
- `SleepSession {segments, inBedSegments, startTime, endTime, activityScore: Float?, isPrimary: Bool, secondsInSleepStage, source}` (0x105233a80).
- `SleepStage`: 0 asleepUnspecified, 1 awake, 2 core, 3 deep, 4 rem, 5 inBed.
- `HealthQuantitySample {id, metadata, type: HealthQuantityType, unit, doubleValue: Double, startDate, endDate}` (0x105277e38).
- `HealthQuantitySampleWithStage {sample, stage: SampleContextType, source}` (0x105232480).
- `ActivityTimeline {timelineDays: [FunctionalDayWithSleep], activityContext}`.
- `ActivityContext {workouts, sleep, sleepStages, mindfulness, exercise (SortedLists), startTime, endTime}`.
- `CalculationConfiguration {aggregationMethod, windowType: [WindowType], useEndTime, contexts: [[SampleContextType]]?, forceIncludeMindfulness}`.
- `BaselineConfiguration {calculationConfiguration, baselineDays: Int, computeHistogram: Bool}`.
- `AggregateStatistics {average: Float, stdDev: Float, count: Float, histogram: [HistogramValue{value: Int, count: Int}]?}`.
- `HealthDataBaselines` class: +0x10 `baselines: [Date: [CalculatedMetric: AggregateStatistics?]]`, +0x18 `aggregates` (same shape), +0x20 `missingBaselines: Bool`, +0x28 `baselineConfiguration: [CalculatedMetric: BaselineConfiguration]`, plus calculationOptionsModel, aggregateCacheWriter, userDefaultsService, memoryCacheService and aggregateFetcher.

---

### G04 — RESOLVED

**1. Calendar primitives. All arithmetic uses `Calendar.current`, so it is DST-safe and uses the device time zone.**
- `Date.addDays(n)` 0x1030cbe40 calls 0x1030cba00 (1030c.c:7430). It computes `Calendar.current.date(byAdding: .day, value: n, to: self, wrappingComponents: false) ?? self`.
- `subtractDays`/`subtractSeconds` (0x1030cbe4c/0x1030cbe94) call 0x1030cbc20 (1030c.c:7891). They compute `date(byAdding: comp, value: -n) ?? self`.
- No code adds a fixed 86 400 s. A day is a calendar day, so DST days are 23 h or 25 h.

**2. Day intervals.** `DateHelper.generatePreviousDayIntervals(dayCount:currentTime:calendar:)` is at 0x1030defb0 (1030d.c:11989).
```ts
function generatePreviousDayIntervals(n: number, now: Date, cal: Calendar) {
  const s0 = cal.startOfDay(now); const out = [];
  for (let i = n - 1; i >= 1; i--) {                 // oldest first
    const start = cal.date(byAdding: .day, -i, s0)!;  // force unwrap
    const next  = Calendar.current.date(byAdding: .day, 1, start) ?? start;
    const end   = Calendar.current.date(byAdding: .second, -1, Calendar.current.startOfDay(next)) ?? …;
    out.push({ startTime: start, endTime: end, index: i });   // end = 23:59:59 local
  }
  out.push({ startTime: s0, endTime: now, index: 0 });         // today ends at "now"
  return out;
}
```
`0x1018416ec` (10184.c:420) maps these intervals to `[FunctionalDay(dayStart: startTime, dayEnd: endTime)]`.

**3. Functional day = calendar day; sleep is attached, not used as an anchor.** `FunctionalDayWithSleep` builder 0x1015556e0 (10155.c:6164) takes `(D: Date, sleepsByWakeDay)`:
- `functionalDay` comes from 0x1016eea24 (1016e.c:8412): `dayStart = startOfDay(D)`, `dayEnd = startOfDay(D + 1 day) − 1 s`. The two values are min/max ordered.
- `primarySleep` is the first session with `isPrimary == true` in `sleepsByWakeDay[startOfDay(D)]`.
- `nextPrimarySleep` is the first `isPrimary` session in `sleepsByWakeDay[startOfDay(D + 1 day)]`.
- `naps` is every session with `isPrimary == false` in `sleepsByWakeDay[startOfDay(D)]`, in supplied order.

`sleepsByWakeDay` is built by 0x10155cd64 (10155.c:9683) as `Dictionary(grouping: sessions, by: Calendar.current.startOfDay(session.endTime))`. A night therefore belongs to the calendar day on which it ENDS. Callers pass `D = functionalDay.dayEnd` from step 2 (HealthDataLoader 0x1017db4a4 at 1017d.c:10965; also 0x101d77174, 0x10157d408). For today, `startOfDay(now)` is today, and the rebuilt `dayEnd` is 23:59:59, not now. How `isPrimary` is assigned upstream is a Sleep-family internal (see Hand-offs).

**4. WindowType → [start, end), selector 0x1015b9fbc (1015b.c:6500). Verified in assembly (win_builder.s).**
| WindowType | start | end |
|---|---|---|
| 0 midnightToMidnight | dayStart | dayEnd (23:59:59) |
| 1 sleepSession | `primarySleep?.startTime ?? dayStart` | `primarySleep?.endTime ?? dayStart`. With no primary sleep the window is empty. |
| 2 sleepStartToSleepStart | `min(asleepStart(primarySleep), dayStart)`; `dayStart` if there is no primary sleep | `sleepStartEnd(day)` 0x1016edb4c (1016e.c:8074): if `dayStart == startOfDay(now)` → `startOfDay(now + 1 d) − 1 s`; else if nextPrimarySleep → `min(nextPrimarySleep.startTime, dayEnd)`; else `dayEnd` |

- `asleepStart` is 0x10171d7f8 (10171.c:11123). It returns `(start of the first segment whose stage != awake, end of the last such segment)`, falling back to `(session.startTime, session.endTime)`. inBed segments are not excluded.
- The same start is also exposed as 0x1016ed088 (1016e.c:7454), which the histogram builder uses.
- `windowType` is an ordered fallback list. For each type: compute the window, then select samples with 0x1015b9928 (time [start, end) by binary lower-bound search on `startDate`, or `endDate` when `useEndTime`; then context groups; then forced mindfulness, as described earlier). Map `doubleValue` to Float32 and return as soon as the result is non-empty.
- Empty `windowType` throws `ScoreCalculationError` (payload 0,0). If every window was computed but empty, it returns `[]` rather than throwing.

**5. Timestamp ordering and endpoints.**
- The selector assumes the input is sorted by the chosen date and never checks it. Sample arrays reach it in the order the fetch produced.
- The endpoint is exclusive. Because `dayEnd` is :59:59, a sample stamped in the last second of the day (≥ 23:59:59.000) is excluded from midnight windows.
- Today's midnight window ends at 23:59:59 in the window builder. The raw generator alone would end it at "now"; the FDWS rebuild changes that.

**6. Baseline windows: generator 0x1015b9360 (1015b.c:5255).** Arguments are `(days: [FDWS] ascending, count C, span B)`.
```ts
for k in 1...clamp(C,1,n):  i = n - k                        // newest first, inserted at front ⇒ ascending output
  window = { currentDay: days[i], previous: days[max(i,1)-1],
             baselineDays: days[max(i-B,0) ..< max(i,1)],     // the B days BEFORE i (i==0 ⇒ [day0] itself)
             nextBaseline: days[max(i-B+1,0) ..< i+1] }       // includes current day
```
Call sites and spans (`rg 'FUN_1015b9360('`):

| Span B | Call sites | Used for |
|---|---|---|
| 60 (0x3c) | 10005.c:5395, 10005.c:11227, 10161.c:11903, 1017d.c:6986, 1017d.c:11346 | Data loading, HealthDataBaselines |
| 30 (0x1e) | 1015b.c:8594 (calculateSleepHistory), 1017d.c:7826 | Sleep |
| 120 (0x78) | 101d7.c:8346 | Sleep-goal estimator; 120 windows |
| 120 windows × 60 | 101d7.c:9886 | Sleep goal |
| 7 | 1015d.c:2126 | Strain-family helper |

In `HealthDataLoader.calculateMetrics` (continuation 0x1017da934, 1017d.c:7101), lookback L is the second async argument (ctx+0x270) and maxBaselineCalcDays M is the third (ctx+0x278):
- Day intervals: `L + 61` (`L + 1 + 60`) via `generatePreviousDayIntervals` (1017d.c:7221).
- Windows: `L + 1`, called `lookbackDaysWithBufferDay` (ctx+0x480, forwarded to calculateHealthMetrics at 1017d.c:8608).
- Data limit: `startOfDay(now) − max(M, 8)` days, via `subtractDays`, `M < 9 ⇒ 8`. This is the `earliestDataLimit` for missing-aggregate computation; see G05.
- The service recalculation passes `M = 3` (0x101689224 tail call `mov w2,#3`).

**7. Daily vs combined date selection.** The aggregate consumer is 0x1015bab50 (1015b.c:5071):
- Daily: for each supplied day, run the selector. Skip days that throw or return empty. Take the Float32 sequential mean per day, then population stats over the day means (0x10183bdc0).
- Combined: run the selector on `days[0]` only and compute population stats over those samples. An empty `days` throws.

The baseline engine always calls this with a single-day array (`[day]`, 0x10158b7a4). The 60-day span is built afterwards by pooling per-day aggregates (G05), not by one wide window.

**8. Comparison operators were re-verified in assembly** (stub addresses 0x104e57d6c `>`, 0x104e57d78 `<`, 0x104e57d84 `>=`, 0x104e57d90 `<=`, 0x104e511fc `Foundation.Date.<`). Ghidra prints `<=` as `<__infix` and `>=` as `>__infix`.
- Selector lower bounds use `>=` (0x1015b9afc, 0x1015b9bc0), so slices are [start, end).
- The histogram slice uses `>=` (0x1015bb7b8, 0x1015bb86c).
- sleepStartToSleepStart start and end use `<` (min) (0x1016edb4c, 0x1015ba780).
- `dataSpanAtLeast` uses `<=`.
- Glucose meal and sample day filter: `>= dayStart && Date.< dayEnd` (0x100097e4c / 0x100097e70).

**9. Week and 28-day helpers (Bio Age hand-off from agent F, names confirmed in recovered symbols).**
- `Date.startOfWeek(startingOn: Weekday)` is at 0x1030ca614; Bio Age uses Monday starts in `Calendar.current`.
- `DateHelper.generateExclusiveDateRange(from:to:)` is at 0x1030e44c0; F traced it as D−28…D−1, a noon-based descending loop.

**10. Time zone.** There are no explicit TimeZone calls in this path. Every key is `Calendar.current.startOfDay(...)` evaluated at run time. The dictionary keys of `baselines`, `aggregates` and the sleep grouping are absolute `Date`s, so after a time-zone change, cached day keys (aggregate cache) fall at a different instant than the new local midnight. They miss and are recomputed as "missing". This is inferred from the keying; there is no explicit TZ-change handler in this path.

**Corrections to earlier research**
- Earlier: "Combined mode … not established that this argument spans all baselineDays." Finding: it never spans them. Combined baselines are a Chan-style pooled merge of daily aggregates (G05).
- `Functional day` is calendar midnight → 23:59:59 local, not sleep-anchored. Sleep anchoring happens only in the per-window types 1 and 2.

---

### G05 — RESOLVED

**Pipeline**, run by the `HealthDataBaselines` instance; caches under algorithmVersion "33":
1. **`loadCachedAggregates(windows)`**, async entry 0x1015880cc (10158.c:4689) → 0x101588254 → 0x10158876c.
   - Flatten all `window.baselineDays`, dedupe by `dayEnd` (Set), sort, and take `earliest = startOfDay(first.dayEnd)`.
   - Call `readCachedAggregates(algorithmVersion: "33", earliestDate:)` (0x10159c08c; args `0x3333, 0xe2…` = small string "33", 10158.c:4294).
   - For each unique day: if `cache[startOfDay(dayEnd)]` exists, copy it into `self.aggregates` and list the day as cached. Otherwise list it as missing.
   - Returns `(cachedDays, missingDays)`.
2. **`calcMissingAggregatesAndComputeBaselines(missing:windows:earliestDataLimit:baselineInputs:writeToCache:)`**, entry 0x101589ccc (10158.c:5056) → 0x101589ec8 (10158.c:9910).
   - For each missing day, compute aggregates only if `earliestDataLimit == nil || day.dayEnd >= earliestDataLimit`; older missing days stay missing.
   - Store `self.aggregates[startOfDay(day.dayEnd)] = perDayAggregates(day, baselineInputs)` (0x10158b508).
   - Run `computeBaselines(windows)` (0x1015869a4). If `writeToCache`, call `aggregateCacheWriter.write(self.aggregates, algorithmVersion "33")` (10158.c:10158).
   - Return the windows whose `currentDay.dayEnd >= earliestMissing.dayEnd` (`changedBaselineDays`). The operator was verified in assembly: `bl 0x104e57d84` = `Comparable.>=` at 0x10158a664. These feed `updateHRReserveZonesIfNeeded(changedBaselineDays:baselines:)`.
3. **Per-day aggregates** 0x10158b508 (10158.c:6340).
   - Metric list is `CalculatedMetric.allCases` minus {sleepingHR 5, glucose 9/10/11} (0x101e23518, mask 0xe20, 101e2.c:2274).
   - Sample source per metric comes from byte table 0x104f935be, which maps to `HealthQuantityType`: avgHRV→heartRateVariability(1), restingHRV→heartRateVariability(1), RR→respiratoryRate(3), RHR→**restingHeartRate(0)**, inactiveHR→heartRateMinuteAggregates(4), sleepingHR→heartRateMinuteAggregates(4), wristTemp→temperature(19), bodyTemp→bodyTemperature(20), spO2→spO2(18), glucose→bloodGlucose(15).
   - `stats = singleDay(metric, day, samples)` 0x10158b7a4 (10158.c:6905): `0x1015bab50(samples, [day], config.calculationConfiguration)`. It returns nil if samples are nil, the selector throws, or mean/sd/count is nil.
   - For daily metrics this yields `(dayMean, 0, 1)`. For combined metrics it yields `(mean, popSD, nSamples)`.
   - If `computeHistogram`, the histogram is `hist(window types in order; first non-nil)` (0x1015baf78).
   - Glucose metrics are added by 0x100097bdc (Food-glucose family).
4. **Baselines** 0x1015869a4 (10158.c:6583).
   - For every window: `list = window.baselineDays.map(d => self.aggregates[startOfDay(d.dayEnd)] ?? {} /* sets missing=true */)`.
   - `self.baselines[startOfDay(currentDay.dayEnd)] = combine(list)` (0x10158bad4) and `self.missingBaselines = anyMissing`.
   - For `windows[0]` only, 0x101587270 (10158.c:8630) also writes cold-start baselines for every day k inside its baselineDays from the prefix `baselineDays[0..<k]`; k = 0 is skipped because the prefix is empty.
5. **`combine(perDayDicts)`** 0x10158bad4 (10158.c:7595), assembly-verified. For each metric in `allCases − {sleepingHR}` (0x101e23614):
   ```ts
   entries = perDay.map(d => d[m]).filter(nonNil)                 // oldest → newest
   prior = populationPrior(m) /*0x101e23c3c*/; if (prior) entries.push(prior)   // appended LAST
   baseline[m] = config[m].aggregation == combined ? chanMerge(entries) : dailyPool(entries)
   ```
   - `dailyPool` (0x10158db9c) is population mean/SD (divisor n, 0x10183bdc0) of `entries.average`, with `count = #entries`.
   - `chanMerge` (0x10158d9b8, 10158.c:8535) is exact Float32, in instruction order:
     ```ts
     M = e0.avg; V = e0.sd*e0.sd; N = e0.count
     for e of rest: n=e.count; NN = n + N; d = e.avg - M
        M = (d*n)/NN + M
        V = ((N-1)*V + (e.sd*e.sd)*(n-1) + (d*d)*((n*N)/NN)) / (NN-1)
        N = NN
     return {average: M, stdDev: sqrtf(V), count: N, histogram: mergeHist(nonNil hists) /*0x10158d680*/}
     ```
     Mixed definitions: per-day SD is population (/n) while the merge uses (n−1) weights. One day with one sample (sd 0, n 1) as the first entry gives `(0*0 + …)/(NN−1)`.
   - Empty `entries` → nil.
6. **Population priors** 0x101e23c3c (101e2.c:2573), bytes checked. These are the only built-in priors, and they apply to glucose only:

   | Metric | Source | Values (Float64) | Prior |
   |---|---|---|---|
   | foodGlucoseAUC (9) | array 0x106115750 | [180, 200, 220] | avg 200, popSD 16.3299, count 3, histogram {180:1, 200:1, 220:1} (Int-truncated, 0x10183ba60) |
   | foodGlucosePeak (10) | array 0x106115718 | [140, 160, 180] | avg 160, SD 16.3299, count 3 |
   | foodGlucoseDelta (11) | immediates | — | avg 50.0 (0x42480000), SD 0, count 1.0 (0x3f800000), histogram [ {50, 1} ] (static 0x1061156e8) |

   Every other metric gets nil. The prior is merged as one more pseudo-day.
7. **Default configuration map** 0x10158c980 (10158.c:9092) together with factory 0x101e23994 (101e2.c:2699), assembly and data bytes re-checked. Options are packed one byte each: b0 hrvMethod, b1 rhrMethod, b2 hrvContext, b3 rhrContext, b4 calories, b5 tempSource, b6 sp02Window, b7 rrWindow.

   | Metric | Agg | windowType | useEnd | contexts | force | baselineDays | hist |
   |---|---|---|---|---|---|---|---|
   | 0 averageHRV | combined | [midnight] (static 0x1060b7bb8, count 1, el 0) | F | nil | F | 60 | F |
   | 1 restingHRV | daily | [`0x0202000101 >> (8*hrvCtx)` & 0xff] → ctx 0,1 sleepSession; 2 midnight; 3,4 sleepStart→sleepStart | F | table 0x106115818[hrvCtx] | hrvCtx==3 | 60 | F |
   | 2 respiratoryRate | combined | rrWindow==entireDay(1) ? midnight : sleepSession | F | nil | F | 60 | F |
   | 3 restingHR | combined | as restingHRV but rhrCtx | F | table[rhrCtx] | rhrCtx==3 | 60 | F |
   | 4 inactiveHR | combined | [midnight] | F | [[awake]] | F | 60 | **T** |
   | 5 sleepingHR | combined | **[sleepSession]** (0x1061152d0) | F | [[rem/deep, otherSleep]] | F | n/a, not in the map | F |
   | 6 wristTemp | daily | [midnight] | **T** | nil | F | 30 | F |
   | 7 bodyTemp | daily | **[midnight]** (0x106115528) | **T** | nil | F | 30 | F |
   | 8 spO2 | daily | sp02Window==entireDay ? midnight : sleepSession | F | nil | F | 60 | F |
   | 9–11 glucose | combined | [midnight] (default branch) | F | nil | F | 60 | F |

   The context table entries are: 0 `[[rem/deep, other]]`, 1 `[[rem/deep]]`, 2 `[[mindfulness]]`, 3 `[[rem/deep, other]]`, 4 `[[0..5]]` (0x1060bad10).
8. **`baselineDays` (60/30) is never read by the engine.** No load of field +0x28 from the 0x38-stride configuration entries exists anywhere. A search of the full disassembly for `mov w*,#0x38` followed by `ldr x,[x,#0x28]` found one unrelated hit at 0x104a4ede4. The effective span is the window generator's constant (60 for HealthDataBaselines), including for temperatures.
9. **Histogram ("HR CDF").** 0x1015baf78 (1015b.c:7092) → 0x10183c038 (10183.c:9099).
   - It uses the same window as the selector but only the **first** context group, with no group fallback and no forced mindfulness. `useEndTime` is forced false, so the slice is by `startDate`.
   - Values are binned as `Int(Float32(value))`, truncating toward zero, counted in a dictionary, mapped to `[HistogramValue]` (0x101585740) and sorted (0x10183b258). A NaN or infinite value or an Int overflow **traps** (crash), so callers must supply finite values.
   - Only inactiveHR has `computeHistogram`: minute-aggregate HR, midnight window, awake context. Its daily histograms are merged across days by `mergeHist` in the combine step.
10. **Sample contexts (which samples count as "sleep", "awake" and so on).** 0x1016a3d68 (1016a.c:2887) tags each sample, keyed on its time, via classifier 0x1016a30fc (1016a.c:6880). Sleep stage at that time comes from 0x1016a2ec0, checking non-unspecified segments before asleepUnspecified ones.
    - REM(4) or deep(3) → remAndDeepSleep(1).
    - core, unspecified or inBed → otherSleep(0).
    - Awake, or no sleep segment → workout(2) if the sample falls inside a workout, else mindfulness(3), else exercise(5) (HR sample types 4/5 only), else awake(4).
    - Return constants are at 0x1016a3708, 0x1016a3784, 0x1016a39b8, 0x1016a3b64, 0x1016a3d28 and 0x1016a39f0.
11. **Rejection.**
    - No outlier, Winsorization or zero filtering happens anywhere in this engine.
    - Non-finite values are not filtered. NaN propagates through the means, except in the histogram path, where it traps.
    - SD == 0 is kept as a valid value; for example the Recovery z-score treats SD 0 as z = 0 (1015b0ba4, rec.c around 1015b.c:9723+330).

**Glucose baselines (hand-off from Nutrition agent G).**
- Per-day glucose aggregates come from 0x100097bdc, not from the window selector. For each meal or food log whose timestamp is in `[dayStart, dayEnd)`, it computes AUC (0x1000975e0), Peak (0x100097790) and Delta (0x100097b4c).
- Per day it stores Double population stats (0x10183b824): `count` = number of meals that day. It also stores the histogram (0x10183ba60).
- The baseline span is the HealthDataBaselines window: 60 **calendar days** before the day (generator constant 0x3c).
- The config chooses `combine`: glucose tags 9–11 fall to the default branch of 0x10158c980 (`cmp w22,#8; b.ne default`, assembly-verified), giving `aggregation = combined`. 0x10158bad4 tests `cmp w19,#1; cset eq`, so combined → `chanMerge`.
- The baseline count is therefore Σ meals over the preceding ≤60 days **plus** the prior's pseudo-count (3 for AUC/Peak, 1 for Delta). The ≥20 gate (G07) is applied to that pooled count, so 17 real meals suffice for AUC/Peak and 19 for Delta.

**Confirmations requested by agent C.** `baselineDays` (30/60) is never read; the Recovery and Stress baselines use the fixed 60-day generator span. The n−1 Chan merge (0x10158d9b8) applies to every metric whose config is combined: averageHRV, respiratoryRate, restingHR, inactiveHR and glucose AUC/Peak/Delta. sleepingHR is excluded from the baseline list. Daily pooling (population stats of day means) applies to restingHRV, wristTemp, bodyTemp and spO2.

**Calibration and validity.** The engine has no minimum-days gate: a baseline exists as soon as one prior day has an aggregate. `missingBaselines` is a flag set when any baseline day lacks a cached or computed aggregate. Family thresholds are G07 hand-offs.

**Corrections to earlier research**
- bodyTemperature window is **midnightToMidnight**, not sleepStart→sleepStart (array 0x106115528, element 0).
- sleepingHR window is **sleepSession**, not sleepStart→sleepStart (0x1061152d0, element 1).
- RHR baselines use `HealthQuantityType.restingHeartRate` samples, not raw HR.
- Combined baselines are Chan-merged per-day statistics with (n−1) weights; daily baselines are population statistics of day means.
- Glucose baselines carry a built-in prior pseudo-day.
- `baselineDays` 30 is dead configuration.

---

### G06 — RESOLVED

**Persistence.**
- UserDefaults keys come from enum `SettingsUserDefaultsKeys` (desc 0x1052452ac). Its conformance descriptor 0x104feeea4 is reached via accessor 0x1005d8484, and the raw-value strings are pointers in the table around 0x1061122a8.
- `CalculationsOptions` is stored as JSON under case 15 `calculationsOptionsKey`, key `"health_settings.calculations_options_key"` (string 0x1059471d0, 40 bytes).
  - Read: 0x101915fbc (10191.c:4805). If the key is absent, the packed default is `0x0000000000000101`.
  - Write: 0x1019160d4 (JSONEncoder, then witness +0x50 set data, key 0xf), which also publishes `_calculationsOptions`.
- Per-field `decodeIfPresent` defaults, from 0x101915a2c (assembly 0x101915b14–0x101915d70):

  | Field | Default if missing | Cases |
  |---|---|---|
  | hrvMethod | bevelRMSSD | appleHealth / bevelRMSSD |
  | rhrMethod | bevel | appleHealth / bevel |
  | hrvContext | entireSleep | MetricContext |
  | rhrContext | entireSleep | MetricContext |
  | caloriesDisplay | total | total / active |
  | temperatureSource | wrist | wrist / body |
  | sp02Window | entireSleep | entireSleep / entireDay |
  | rrWindow | entireSleep | entireSleep / entireDay |

  Packed byte order: b0 hrvMethod, b1 rhrMethod, b2 hrvContext, b3 rhrContext, b4 calories, b5 tempSource, b6 sp02Window, b7 rrWindow (encoder 0x101915318).
- How options feed metrics: through factory 0x101e23994 (G05 table). hrvMethod and rhrMethod pick the sample source: help text 0x1059621f0; the RMSSD computation is at 0x10166ab98 (Recovery/HRV family).

**Sleep goal (hand-off from agent D).**
- Keys: case 12 `"health_settings.sleep_goal_key"` (Float hours) and case 13 `"health_settings.sleep_goal_method_key"` (String).
- Getter 0x1019383e0 (caller 0x101936a94), assembly-verified:
  ```ts
  goal = defaults.float("health_settings.sleep_goal_key") ?? 7.5   // fcsel s8, #7.5, …, eq on nil (0x1019384f4–0x1019384f8)
  isAutomatic = defaults.string("health_settings.sleep_goal_method_key") == "automatic"   // case table 0x1060d04f8: ["manual","automatic"]; missing ⇒ manual
  ```
  The UserDefaults float getter 0x101b98028 returns nil (not 0) when the object is absent, so a missing goal reads as **7.5 h, not 0**. D's "0" finding does not hold for this getter.
- Writers:
  - The automatic estimator writes `hours + minutes/60` (0x101d79b30).
  - Onboarding writes the onboarding model's published goal (0x101af8270).
  - The only age-dependent onboarding computation found is `automatedMaxHeartRate = 220 − age` (0x101af6a10). No age-based sleep-goal table was found among the onboarding callers of `ageYearsOn` (0x101af6a10, 0x101af957c), so the onboarding value is whatever the onboarding model holds when saved.

**Temperature baseline.**
- Key: `data_integrations.temperature_baseline_fahrenheit` (0x1059482d0), stored in °F.
- Input bounds: lower 95.0 °F, or 35.0 °C when the unit is Celsius (0x102a58264; `dVar8 = 35.0 / 95.0` by unit); upper 99.9 °F (double at 0x104ecfca0, 0x102a5a910).
- Display conversion: `(F − 32) * 5 / 9` (0x102a57fc4). The "36.1–37.7" in the localization comment is only an example.

**Data Loading Window.**
- Key: `data_loading.full_metrics_recalculate_window`, values `DataLoadingLookbackWindowOption` raw strings `oneYear` … `fiveYears`.
- It is a **local user setting**, not remote config: it is written by 0x100050ab0, called from 0x1020724a4 ("Recalculating data..."), which is driven by the settings row "Data Loading Window" (string 0x105962f00, referenced by 0x1029f7c28). It is read by 0x101dce914.
- Lookback = `(option + 1) * 365` days; fetch start = `now − (option*365 + 427)` days.
- This is the same setting agent F saw driving the Bio Age weekly span. Its value is in the IPA's UserDefaults path, so the "remote / NOT IN IPA" label does not apply.

**Remote values.**
- `BevelCoaching.CoachingFeatureFlags`: the `nutritionScoreV2` boolean and the `nutritionScore` version flag (decode 0x1043e27ac). Their values are server-side; the decode site is the boundary.
- The Mixpanel flag manager has no metric keys. Firebase RemoteConfig is used only for Crashlytics rollouts.
- No remote numeric metric constant exists; every threshold and window in this file is compiled-in.

**Profile.** Age comes from `Date.ageYears`/`ageYearsOn` (0x1030ce468 / 0x1030ce4ec); sex from `EffectiveSex`. Max HR is 220 − age (0x101af6a10).

---

### G07 — RESOLVED

**Shared states**, with layouts from reflection:
- `ScoreCalculationError {noDataError(message), dateError, queryError}`.
- `GlucoseScoreState {waitingForData, baselinesCalibrating, complete}`.
- `CalibrationState {uncalibrated, calibrated}`.
- `LoadStatus {calibrating, detraining, maintaining, peaking, productive, fatigued, overtraining}`.
- `MuscularFreshnessStatus` and `MuscleFreshnessStatus {calibrating, recovered, fatigued, depleted}`.
- `HealthMissingData {recoveryHRV, recoveryHRVBaseline, recoveryRHR, recoveryRHRBaseline, recoverySleepScore, stressRHRBaseline, stressHR, sleepMissingInputs}`, carried in `RecoveryMetrics/StressMetrics/SleepMetrics.missingData`.
- `DynamicSleepGoalCalculationResult {sufficientData, insufficientData, failed}`.
- `StressScoreLevel {high, mediumHigh, medium, lowMedium, low, undefined}`.
- `BioAgeState/BioAgeDisplayState {loading, calibrating(CalibratingData), blocked, ready}`.
- All score fields are `Float?`. nil means unavailable; 0 is a valid value.

**1. Calibration service (Recovery 60-day / Stress 30-day badge).** `HealthMetricCalibrationService`; per-metric builder 0x101cc5a24, assembly 0x101cc5ae4–0x101cc5b0c.
```ts
spanDays = metric == recoveryScore(0) ? 60
         : metric in {stressScore(30), inactiveStress(32), sleepStress(33)} ? 30
         : null                                   // every other metric: no calibration state (nil); activeStress(31) is excluded
// per day (0x101cc5614, cset lt at 0x101cc5808): dates = data dates up to that day (from trend entries 0x10194a1ec)
calibrated = DateHelper.dataSpanAtLeast(numDays: spanDays, dates)   // 0x1030dd1bc: min(dates).addDays(N) <= max(dates)  (stub 0x104e57d90 = <=)
             && dates.count > 4                                      // i.e. ≥ 5 data days
```
- Lookup 0x101cc666c → 0x101cc5308 returns nil (2) when no entry exists.
- Consumers store the state as an `isCalibrating` flag in the Stress and Energy data: 0x1016e3e3c (LiveStressService), 0x101522958, 0x1015262b8, 0x101524ec4, 0x1016e43f4, all querying metric 0x1e. The UI shows the calibrating copy ("allow up to 60 days" Recovery 0x105951030; "30 days" Stress 0x105950ee0).
- Agent C's "≥ 5 days in the last 60 / 30" matches, with one refinement: the dates must also **span** at least N days (`first + N ≤ last`).

**2. Missing data (Recovery).** Recovery builder 0x1015b0ba4.
- Baselines are read as `baselines[startOfDay(day)][restingHRV]` and `[restingHR]`.
- `missingData` is appended in this order (1015b.c around 1015b0ba4, rec.c lines 1187–1287):
  - today's HRV nil → recoveryHRV
  - today's RHR nil → recoveryRHR
  - HRV baseline nil → recoveryHRVBaseline
  - RHR baseline nil → recoveryRHRBaseline
  - sleep score nil → recoverySleepScore
- The baseline is nil only when no prior day in the 60-day window has an aggregate (G05).
- UI text comes from 0x1016f51f0 / 0x1016f5a28. For the baseline cases it says "Please wear your watch for at least 2 nights in the last 30 days for Bevel to calculate a baseline."; this is copy only, and the code gate is "baseline nil". It also says "Not enough RMSSD samples during REM and deep sleep" / "Missing baseline data", plus per-case Apple Health troubleshooting text.

**3. Glucose.** `calculateGlucoseScore` 0x100101c00:
```ts
if (cgm == nil /*method tag 4*/) { if (glucoseDisabled) return {score:nil, state:complete}; /* else compute */ }
else {
  readyAt = mealTime.addHours(2).addMinutes(cgm.method == appleHealth ? 180 : 0)   // 0x1030cbe58, 0x1030cbe70
  if (glucoseDisabled) → complete/nil
  if (currentTime < readyAt) return {score:nil, state:waitingForData}
}
if (glucoseBaseline == nil) state = baselinesCalibrating
else for m in [AUC, Peak, Delta]: if (baseline[m] == nil || baseline[m].count < 20.0) state = baselinesCalibrating
otherwise state = complete
```
The count includes the prior pseudo-count (G05).

**4. Cardio Load status.** 0x1015efbc4 (1015e.c around line 9440); same rules in history path 0x1014e5ee8.
```ts
ctlMaturity = min(historyDays / 28, 1)
trainingDensity = min(0.25 * Σ_{d=0..15, load[d] > 5} (1 − 0.0625*d), 1)     // 0x10000ad88, d = days ago
confidence = min(ctlMaturity, trainingDensity)
if (confidence < 0.35) status = calibrating
ratio = ATL/CTL (nonfinite → 0)
trend% = (CTL − CTLprev)/CTLprev*100   (when both exist)
ratio > 1.4 → overtraining;  1 < ratio ≤ 1.4 → (recovery ≥ 20 or missing) ? productive : fatigued
ratio ≤ 1: trend > 5 → peaking; trend < −5 → detraining; else maintaining (also when no trend)
```
The "6 weeks" in 0x105904170 is copy only; the code gate is `confidence ≥ 0.35`.

**5. Muscular Load status.** 0x10008bd08 (10008.c around line 11600); table doubles at 0x104ec2f80–0x104ec2f98 and 0x104ebe868.
- Training-day threshold is daily load > 250, with the same density weights.
- `confidence ≥ 0.35` and CTL > 0 are required, otherwise calibrating.
- Bands: ratio ≥ 1.5 overtraining; ≥ 1.3 fatigued; ≥ 1.05 productive; ≥ 0.95 maintaining; ≥ 0.8 → peaking, detraining or maintaining by CTL trend (±5 %); below that, detraining.
- Optimal range = CTL × [0.8, 1.5]; display value = ATL / 50.

**6. Muscle Freshness status.** 0x100081efc (10008.c:8229) and 0x100086904.
- With no calibration record → calibrating.
- Otherwise `days = dateComponents(.day, from: record.date, to: now)`:
  - `days ≥ 43` (more than 6 weeks) → calibrating.
  - Else ≥ 75 → recovered; ≥ 35 → fatigued; < 35 → depleted.
- freshness is clamped to ≤ 100.

**7. Target Strain.** It has no calibrating state in code. The "2 weeks" copy (0x105950f80) corresponds to the 14-day seed (0x1015eecc0). The range helper always returns finite bounds; `DailyScores.targetStrainBounds` is Optional.

**8. Sleep-goal estimator.** `insufficientData` / `failed` as in earlier research (estimator 0x101d78fbc).

**9. Stress level.** Point level in 0x1015e344c (assembly 0x1015e4220–0x1015e423c): score ≥ 60 → high; ≥ 30 → medium; else low; no data → undefined. A negative score is clamped to 0 first.

**10. Shared primitives.** The selector throws vs returns `[]`; baselines are nil-only with no minimum count; `safeRoundedInt` returns nil on non-finite input (G09).

Per-family summary:

| Family | Gate (exact) | Output on fail |
|---|---|---|
| Recovery | calibration: 60-day span + ≥ 5 data days; missing HRV/RHR/sleep/baseline list | `isCalibrating` badge; `missingData` items; score nil when inputs are nil (C's scope) |
| Stress (score/inactive/sleep) | 30-day span + ≥ 5 data days; RHR baseline / HR missing items | badge; `undefined` level |
| Glucose | meal + 2 h (+180 min Apple Health CGM); baselines count ≥ 20 for AUC, Peak, Delta | waitingForData / baselinesCalibrating |
| Cardio Load | min(days/28, density) < 0.35 | calibrating |
| Muscular Load | same, with the 250 load threshold | calibrating |
| Muscle Freshness | no calibration record or ≥ 43 days old | calibrating |
| Target Strain | none (14-day seed) | — |
| Sleep goal | 90 / 15 rule | insufficientData / failed |

---

### G08 — RESOLVED

**Settings-change trigger.**
- The calculation-settings save chain is 0x10206b840 → 0x1019160d4 (persist options) → 0x10206b8fc, which also writes bool key 16 `forceIncludeManualSleepKey` → 0x10206b9e8.
- 0x10206b9e8 stores `DataUpdateType.full` (enum desc 0x1051fda08 `{fromDate(Date), initial, full}`, tag 2) and calls the shared refresh entry 0x100f4d8c8 (relative pointer at 0x104f5d748). That entry has 26 callers and enqueues through `DataLoadingTaskQueue.enqueueTask(key:operation:)` 0x100064c24, which cancels any in-progress full recalculation for the same scope.
- A settings change therefore replays the full Data Loading Window (1–5 years).
- The full-recalculation input path (0x10161608c) builds a fresh `HealthDataBaselines` (0x10158bf80, then 0x10158c980) and does not reference `loadBaselinesFromCache`; that string is only xref'd by the initial refresh at 0x100055538 and 0x100056164. All aggregates are therefore recomputed with the new options.

**Other mechanisms (unchanged from the first pass).**
- Cache algorithmVersion is "33".
- Each refresh recomputes L + 1 days, and baselines are rebuilt from cached aggregates.
- Late HealthKit data re-consolidates the affected days of the daily history (0x1005b6b04).
- Service recalculation scopes are (7, 2) and (31, 31), with maxBaselineCalcDays 3, so missing aggregates are filled only for the last 8 days.
- Bounded initial lookback = `min(max(required, daysSinceIntegrationChange ?? 0), lookbackWindow)`.

---

### G09 — RESOLVED (shared presentation layer)

- **Central formatter** `HealthMetric.formatValue(value:settings:)` 0x1038c2da8 (assembly-verified nil branch):
  - nil → "—" (U+2014, small string 0xe28094).
  - Minutes metrics (sleepBank 8, timeInBed/Asleep/REM/Deep 11–14, timeToFallAsleep 18, exerciseMinutes 19) → `DateHelper.formatDuration(seconds: v*60)`.
  - wakeTime and sleepTime (15, 16) → `formatTimeOfDay(v*60)`.
  - Other metrics use `formatDecimal(DecimalFormatOptions{fractionDigits: .fixed(n), withGrouping: true, displayPlusForPositive})` (0x1030d3ca4 → 0x1030d389c, NSNumberFormatter decimal style with min = max fraction digits and **no rounding mode set**, so iOS's default `.halfEven` applies). n by metric:
    - n = 1 for RHR, HRV, RR (1–3) and spO2, temperature, bodyTemperature (36–38).
    - n = 1 with a "+" sign for temperature, HRV and RHR deviations (51–53).
    - n = 0 with a "+" sign for recoveryDeviation (54).
    - n from the user's glucose-unit setting (UnitSettings byte 6) for glucose metrics 48–50.
    - n = 0 for everything else, which covers every score. The Recovery dashboard label (hand-off from agent C) is therefore a 0-decimal NSNumberFormatter with half-even rounding.
- **Float.safeRoundedInt(clamp:)** 0x1030d5a84: NaN or ∞ → nil; otherwise `frinta`, which rounds half away from zero in Float32; out of Int range → clamp ? Int.min/max : nil. Used by the sleep goal, target-strain notification bounds, morning/summary notifications and others (34 callers).
- **Units.**
  - HK samples keep `quantity.doubleValue(for: rawUnit)` (0x10310076c) with no scaling.
  - `HealthQuantityUnitType` includes `percentDecimal` (SpO2 as a fraction) and `fahrenheit` (temperatures in °F).
  - Display °C/°F uses Foundation `NSUnitTemperature.celsius/fahrenheit` Measurement conversion (0x10212xxxx, 0x10039xxxx). The temperature-baseline UI uses `(F − 32)*5/9`.
- **Bands.**
  - Recovery category (0x102843978 and copies 0x102830xxx, 0x10245xxxx): ≥ 67 high; 34–<67 medium; < 34 or NaN low.
  - Stress level: ≥ 60 high, ≥ 30 medium, else low.
  - Muscle freshness: ≥ 75 / ≥ 35.
  - Cardio and muscular status tables are in G07.
- **Morning status notification** (hardcoded path 0x101967ac4 → 0x1019729b0 → matrix 0x10197284c). Inputs are sleepScore S and recovery R, both required non-nil. Recovery tiers use the same 67/34 thresholds; sleep tiers are S ≥ 85, 70 ≤ S < 85 and S < 70. The function returns message case 0–8, each with a fixed localized body:
  - 0: S ≥ 85 and R ≥ 67.
  - 1: 70 ≤ S < 85 and R ≥ 67.
  - 2: S < 70 and R ≥ 67.
  - 3: S ≥ 85 and 34 ≤ R < 67.
  - 4: S ≥ 85 and R < 34.
  - 5: 70 ≤ S < 85 and 34 ≤ R < 67.
  - 6: S < 70 and 34 ≤ R < 67.
  - 7 or 8: R < 34 with S < 85.
- **Target-strain notification.** Bounds are rounded with `safeRoundedInt(clamp: false)` and sent to the coaching server (0x10196c7b4) when coaching is enabled. Otherwise the local path 0x10196bca4 records the send time.
- **Chart y-domain** (BaselineDeviationChart processing 0x103b70718).
  - `E = max absoluteExtrema(points)`, where `absoluteExtrema = max(|value|, |bounds|)` (0x103b6b130).
  - Domain = `[−E − 0.05E, E + 0.05E]` (pad = 2E·0.025). A zero span is expanded by ±20 %. The result is then constrained against the configured range (ClosedRange safe init 0x1030c89c0) and written by the `yDomain` setter 0x103b72e40.
  - The x domain is padded by half an interval on each side.

---

## New discoveries
- Glucose baselines have hard-coded prior pseudo-days; the cache algorithmVersion is "33".
- The calibration badge rule is a 60-/30-day span plus ≥ 5 data days.
- Cardio and muscular calibration is a confidence measure (maturity and density), not a fixed number of weeks.
- A missing sleep goal reads as 7.5 h.
- A settings change triggers a full replay.
- Histogram binning traps (crashes) on non-finite values.

## Hand-offs
- **Sleep:** how `SleepSession.isPrimary` is assigned upstream.
- **Sleep, answering agent D:**
  - Inactive-HR baseline and HR sleep tags are fully described in G05 §9–10.
  - The stored sleep goal defaults to 7.5 h (G06), not 0.
  - Sleep pipeline values: sleep history windows span 30 days (generator call 1015b.c:8594); `sleepGoalHours` comes from getter 0x1019383e0; age and sex come from the profile.
  - The functional day is local midnight with no exceptions found (the "today" `dayEnd` = 23:59:59 after the FDWS rebuild).
- **Recovery/HRV:** RMSSD computation 0x10166ab98.
- **Nutrition:** the `nutritionScoreV2` remote flag.
- **SpO2 display scaling:** samples are stored as a fraction (`percentDecimal`) and formatted with 1 decimal. The ×100 step was not located in the formatter, so it sits in the measurement builder; this is a Recovery/Vitals family item.
