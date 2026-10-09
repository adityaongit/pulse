# Agent D findings: Sleep Score (M03), Sleep Bank (M14), Sleep Consistency (M15), Sleep Needed / Goal (M16)

Bevel 3.1.7, main binary `Superset`. All addresses are VM addresses. "decomp" = `/Users/adityajindal/bevel-re/out/decomp-main/<shard>.c:<line of function header>`. Scratch disassembly with stub names resolved is in `/Users/adityajindal/bevel-re/work/D/*.s` (made with `objdump` and `otool -Iv`). Type names, field names and enum case orders were decoded from Swift reflection metadata with `/Users/adityajindal/bevel-re/work/D/desc.py`.

Ghidra operator naming warning (checked against stub symbols): `Comparable::>__infix` is `>=`, `Comparable::<__infix` is `<=`, `Comparable::<_infix` / `Date::<_infix` is strict `<`. Several earlier readings depend on this.

**Boundary audit (second pass, stubs from `otool -Iv`).** Stub map: 0x104e57d78 = `Comparable.<`, 0x104e57d84 = `Comparable.>=`, 0x104e57d90 = `Comparable.<=`, 0x104e511fc = `Date.<`, 0x104e51250 = `Date.==`. Every boundary in this file was re-checked against the assembly:

| Boundary | Instruction(s) | Result |
|---|---|---|
| Day filter in calculateSleepHistory | be838 `1015be9d4` `<=`(dayEnd, startOfDay(endDate+1d)−1s) | `dayEnd <= cutoff`, confirmed |
| isToday flag | `1015bf0a0` `Date.==` | confirmed |
| HR-dip sample window | b9928 `1015b9afc` `>=`(startDate, start), `1015b9bc0` `>=`(startDate, end), each true → high=mid | `start <= startDate < end`, confirmed |
| Consistency clip | `1015cf7e0` `>=`(dayStart, segStart) picks dayStart → max; `1015cf820` `<`(dayEnd, segEnd) picks dayEnd → min; `1015cf854` `Date.<`(a,b) required | confirmed |
| Consistency end bin | `1015cfcbc` `Date.==`(b, dayEnd) → 1440; `cmp x26,#0x5a0 b.ge` skip | confirmed |
| Session >24 h | `fcmp d0,#86400; b.le` → normal pair painting | confirmed (`<=` 86400 is normal) |
| Tonight history | cbedc `1015cc104` `>=`(day, date−30d), `1015cc128` `<=`(day, date−1d) | confirmed, both inclusive |
| Tonight strain window | 0x1030cb480: lo=`<`-min, hi=`>=`-max, `<=`(lo,hi) precondition, `>=`(self,lo) at `1030cb6fc`, `<=`(self,hi) at `1030cb714`; args (date−30d, date−0d) at da8d4 `1015dac28`/`1015dac34`/`1015dad1c` | **corrected** to a closed range |
| Continuity table | `subs x8,x0,#6; b.lo` → 1.0; `cmp x8,#7; b.hs` → formula | n<6 → 1; 6..12 table; ≥13 formula, confirmed |
| Status thresholds | 0x1015d1444 `fcmp/csel gt` 0.9, `le` 0.67, `gt` 0.34, `eq` 0 | confirmed (NaN → poor) |
| Age table | `cmp x0,#0x1e b.ge` (signed), then unsigned `b.hi` #0x27/#0x31/#0x3b/#0x45 | confirmed |
| Default goal by age | 0x101d79e9c: `ccmp x10,#0xa` (20..29), `cmp x0,#0x45; cinc le` (≤69 → 8), 60..69, 40..59, 30..39 (`lo`) | confirmed |
| Kernel | `fcsel d0,d10,d0,gt` (min 1); `fcmp d9,#0; b.ls` → nil; clamp `gt` 100 / `ls` 0 | confirmed |
| Bank skip | `fcmp s11,#0; b.eq` | exactly 0 skipped, confirmed |
| Strain multiplier / debt / strain extra | `fcmp s12,1; cset hi`; `fcmp s10,#0; fcsel ge`; `fcsel ls` | m>1 only; bank<0 only; extra≥0, confirmed |
| Tonight caps | cc358 `fcmp s0,s1; b.hi` (mult >1), `1015cc8cc fcsel gt` (min 3600), `1015ccc18 fcsel gt` (min 60), `fcmp s0,#0; b.eq` (avgEff==0) | confirmed |
| Dynamic goal | `cmp x24,#0x5a; ccmp x21,#0xf,#8,hs; cset lt`; high count `fcmp s9,s8; b.lt` skip (≥67 kept); sort `fcmp s1,s0; b.pl` stop | confirmed |

## 0. Shared model (decoded from reflection metadata)

| Type (descriptor) | Fields / cases, in order |
|---|---|
| `SleepStage` enum (0x105233a48) | 0 asleepUnspecified, 1 awake, 2 core, 3 deep, 4 rem, 5 inBed |
| `SleepStageSegment` (0x1052332c8) | sleepStage, startTime, endTime, source: HealthDataSource, activityScore: Float? |
| `SleepSession` (0x105233a80) | segments: [SleepStageSegment], inBedSegments: [DateInterval], startTime, endTime, activityScore: Float?, isPrimary: Bool, secondsInSleepStage: [SleepStage: Float], source |
| `FunctionalDay` (0x10523300c) | dayStart: Date, dayEnd: Date |
| `FunctionalDayWithSleep` (0x105233034) | functionalDay, primarySleep: SleepSession?, nextPrimarySleep: SleepSession?, naps: [SleepSession] |
| window tuple (mangled at 0x1052ed648) | (currentDay, previousDay, baselineDays: [FunctionalDayWithSleep], nextBaselineDays: [FunctionalDayWithSleep]) |
| `SleepNeeded` (0x105233afc) | sleepGoalSeconds, recentStrainNeedSeconds, sleepDebtSeconds, sleepNeededSeconds, sleepBankMinutes (all Float), sleepEfficiencyAdjustmentSeconds: Float?, timeToFallAsleepSeconds: Float? |
| `SleepMetrics` (0x105233a2c) | sleepScore: Float?, sleepHistory, metricMeasurements: [HealthMetric: MeasurementValue], sleepStageMetrics, startingSleepNeeded: SleepNeeded, scoreComponents: [SleepScoreComponent: SleepScoreComponentResult?], missingData, sessionMetadata |
| `SleepScoreComponent` enum (0x105233ae0) | 0 asleepRatio, 1 heartRateDipPercentage, 2 remSleepRatio, 3 deepSleepRatio, 4 sleepEfficiency, 5 sleepContinuity |
| `SleepScoreComponentResult` (0x105233ac4) | score: Float?, percentOfTarget: Float?, status: SleepContributorStatus |
| `SleepContributorStatus` (0x105233d78) | 0 excellent, 1 good, 2 fair, 3 poor, 4 noData |
| `SleepLatency` enum (0x10523162c) | value(latency: Double), lackOfValue(hasStages: Bool, hasInBedSegments: Bool) |
| `HealthMetric` enum (0x10529f840) | ... 4 heartRateDip, 8 sleepBank, 9 sleepScore, 10 sleepConsistency, 11 timeInBedMinutes, 12 timeAsleepMinutes, 13 timeRemSleepMinutes, 14 timeDeepSleepMinutes, 15 wakeTime, 16 sleepTime, 17 sleepEfficiency, 18 timeToFallAsleep ... (55 cases) |
| `CalculatedMetric` enum (0x105246bd4) | 0 averageHRV, 1 restingHRV, 2 respiratoryRate, 3 restingHeartRate, 4 inactiveHeartRate, 5 sleepingHeartRate, ... |
| `SampleContextType` enum (0x1052332ac) | 0 otherSleep, 1 remAndDeepSleep, 2 workout, 3 mindfulness, 4 awake, 5 exercise |
| `BevelBiologicalSex` (0x1052779c0) | 0 male, 1 female, 2 other (nil = byte 3) |
| `SettingsModel` (class, 0x105237550) | ..., `_sleepHours: Published<(hours: Int, minutes: Int)>`, `_sleepGoalCalculationMethod: Published<SleepGoalCalculationMethod>` (0 manual, 1 automatic), ... |
| `DynamicSleepGoalCalculationResult` (0x105244a64) | sufficientData(hours, minutes), insufficientData(hours, minutes), failed |

Source file: `Superset/SleepCalculator.swift` (0x10591c240). Log function names give the Swift signatures:
- `calculateSleepHistory(endDate:dayHistory:historicalLookbackDays:strainHistory:sleepHistory:metricHistories:baselines:age:biologicalSex:)`: async entry 0x1015be56c, body 0x1015be838 (first iteration), loop continuation 0x1015c09d0 (later iterations). `calculateSleepMetricsForDay(...)` is inlined into these two.
- `getSleepMetrics(selectedDay:session:sleepNeeded:baselines:metricHistories:currentSleepBank:sleepConsistency:age:biologicalSex:isToday:)`: entry 0x1015c3310, then 0x1015c3524 (four `async let`), 0x1015c3874, 0x1015c38bc, 0x1015c38e0, 0x1015c3924, 0x1015c3938 (score and metrics), 0x1015c5a40 (return).

Caller chain: 0x1017d6700 (scores pipeline, wrapped in a trace span named "calculateSleepHistory") → async-let child 0x1017df748 → 0x1017d92a8 → 0x1015be56c.

## 1. Pipeline overview

```mermaid
flowchart TD
  A[dayHistory: FunctionalDayWithSleep per calendar day] --> B[filter dayEnd <= startOfDay(endDate+1d)-1s]
  B --> C[windows = makeWindows(days, historicalLookbackDays, 30)]
  C --> D{for each window, chronological}
  D --> E[strain z: prevDay strain vs <=30 prior daily strains]
  D --> F[prevBank = bank(baselineDays.suffix 7)]
  D --> G[currentBank = bank(nextBaselineDays.suffix 7)]
  D --> H[consistency = SRI(nextBaselineDays.suffix 8)]
  E --> I[SleepNeeded = goal + strainExtra + debt(prevBank)]
  F --> I
  I --> J[getSleepMetrics(currentDay, primarySleep, need, ...)]
  G --> J
  H --> J
  J --> K[stage sums, HR dip, naps, latency]
  K --> L[score kernel 0x1015d11dc]
  L --> M[SleepMetrics: score, components, metric measurements]
```

---

## M03 — Sleep Score

### M03.01 — RESOLVED

Scope: session ingestion as consumed by the score, main sleep vs nap, stage merging/overlap, short awakenings, inBed handling.

**Main sleep vs nap.** The score uses only `currentDay.primarySleep` (getSleepMetrics `session` argument: `x2 = selectedDay + fieldOffset(primarySleep)`, be838 asm 0x1015bfe20). Naps never enter score components. Naps are only added to two displayed metrics (see M03.02, "metric measurements"). How a session becomes primary versus nap is decided upstream (Agent A, `FunctionalDayWithSleep` builder).

**Overlap resolution (upstream, HealthKit session builder 0x101d7ba70, decomp 101d7.c:10690).** Traced because it decides what the score sees:
1. Segments are sorted by insertion/merge sort 0x1015be1f8 with comparator 0x1015c93f8 (decomp 1015c.c:1891). Every non-inBed segment sorts before every inBed segment. Within the same class the order is decided by a source predicate on `HealthDataSource.metadata` (fields at +0x18 > 3 and flag +0x40). That predicate belongs to Agent A.
2. Resolver 0x1015cb390 (decomp 1015c.c:5547) walks the sorted list. A segment that does not overlap an already-accepted segment is inserted whole. An overlapping segment is cut by 0x1015ca840 (decomp 1015c.c:5068) so that **only the gaps not already covered** are kept. Earlier-sorted segments always win.
3. A kept piece with stage `inBed` (5) is rewritten: it becomes **awake (1)** if the session has any non-inBed segment, or **asleepUnspecified (0)** if the session is inBed-only (`local_1cc = firstNonInBedIndex != count`, decomp 1015c.c:5547 near `if (*pcVar13 != '\x05')`). `activityScore` is set to nil.
4. `session.segments` is this resolved list. `secondsInSleepStage[stage]` is the per-stage sum of `end - start` over it (0x101d7ba70 loop, decomp 101d7.c:10690 body). Raw inBed segments go separately to `inBedSegments` via 0x101d7dc58 (filter `stage == 5`, decomp 101d7.c:7666), and only when the session has non-inBed segments.

So for HealthKit-built sessions, `segments` and `secondsInSleepStage` contain no `.inBed`. In-bed time not covered by staged data counts as awake (staged session) or as asleepUnspecified (in-bed-only session).

**Score-side preprocessing, `trimAwakeEdges` 0x1015d0b4c (decomp 1015d.c:1).** It returns `segments[first..last]`, where first and last are the first and last segments whose stage is not awake. Leading and trailing awake segments are dropped. A nil session or an all-awake session gives an empty list.

**Stage sums, 0x1015d0f14 (decomp 1015d.c:174).** It works on the trimmed list, with Float32 accumulation and `dur = Float(end.timeIntervalSince(start))`:
```ts
type Sums = { total, asleep, awake, core, deep, rem, unspecified: number; interruptions: number };
function stageSums(session?: SleepSession): Sums {
  const s = zeros();
  for (const seg of trimAwakeEdges(session)) {           // no merging; overlaps (if any) are double-counted
    const d = seconds(seg.end - seg.start);
    s.total += d;
    if (seg.stage === AWAKE) { s.awake += d; s.interruptions += 1; continue; }
    s.asleep += d;                                         // includes inBed(5) if one ever survived upstream
    if (seg.stage === CORE) s.core += d; else if (seg.stage === DEEP) s.deep += d;
    else if (seg.stage === REM) s.rem += d; else if (seg.stage === UNSPECIFIED) s.unspecified += d;
  }
  return s;
}
```
**Short awakenings:** nothing merges or ignores them. Every interior awake segment counts as one interruption, whatever its length. There is no minimum duration. Edge awake segments are removed by the trim.

`hasStages` = `session.segments` contains any core, deep or REM segment (0x10171df70, decomp 10171.c:10410, `stage - 2 < 3`).

Evidence: be838 asm `1015bfe1c..1015bfe5c` (call into getSleepMetrics); c3524 asm `1015c3548..1015c35c4`; decomp 1015d.c:1, :174; 1015c.c:5547, :5068, :1891; 101d7.c:10690, :7666.

### M03.02 — RESOLVED

Every component producer, the kernel, the weights, the dropping and the presentation.

**Inputs assembled in 0x1015c3524 and 0x1015c3938 (asm c3938.s 1015c396c..1015c3a54).**
```ts
const s = stageSums(session);                         // session = currentDay.primarySleep
const need = sleepNeeded.sleepNeededSeconds;          // SleepNeeded+0xc (from calculateSleepHistory; see M16)
const awakeFrac = s.total === 0 ? 0 : s.awake / s.total;
const asleepRatio = need === 0 ? 0 : s.asleep / need;                                   // never nil
const deepRatio = (!session || !hasStages(session)) ? null : (need === 0 ? 0 : s.deep / need); // ÷ NEED, not ÷ asleep
const remRatio  = (!session || !hasStages(session)) ? null : (need === 0 ? 0 : s.rem  / need);
const hrDip     = hrDipPercentage(day, metricHistories, baselines);                      // M03.03, may be null
const efficiency = 1 - awakeFrac;                                                        // never nil
const continuity = continuityFactor(s.interruptions);                                    // never nil
```
Continuity factor, 0x1015d1174 (decomp 1015d.c:147). The table at 0x104f94670 holds Float32 values:
```ts
function continuityFactor(n: number): number {
  if (n < 6) return 1.0;
  if (n <= 12) return [0.98, 0.95, 0.91, 0.86, 0.80, 0.73, 0.65][n - 6];
  return Math.max(0.4, (n - 12) * -0.05 + 0.65);     // f32: 0xbd4ccccd, 0x3f266666, 0x3ecccccd (fmaxnm)
}
```

**Kernel 0x1015d11dc (decomp 1015d.c:657, asm verified).** Order of the input array: `[asleepRatio, deepRatio, remRatio, hrDip, efficiency, continuity]` (Float32?).

| idx | component | target (f64) | exponent | weight |
|---|---|---|---|---|
| 0 | asleepRatio | 1.0 | 3 | 0.35 |
| 1 | deepRatio | 0.125 default, or table (M03.04) | 2 | 0.20 |
| 2 | remRatio | 0.2 | 2 | 0.20 |
| 3 | hrDip | 0.255 default, or table | 3 | 0.10 |
| 4 | efficiency | 0.97 | 15 | 0.075 |
| 5 | continuity | 1.0 | 10 | 0.075 |

Constants: targets at 0x104f94420 (0.97, 1.0), 0.2 at 0x104ebe498, 0.255 at 0x104f943b0, 0.125 = `fmov d0,#0.125`. Weights at 0x104f94430 (0.35, 0.2, 0.2, 0.1) plus `0x3fb3333333333333` = 0.075 ×2. Exponents at 0x104f801f0 and 0x104f94450 (3, 2, 2, 3, 15, 10).
```ts
function sleepScore(c: (number|null)[], age: number|null, sex: 0|1|2|null): number|null {
  if (c.length > 0 && c[0] !== null && c[0] === 0) return null;      // asleepRatio exactly ±0 → no score
  const t = targets(age, sex);                                         // [1, deep, 0.2, hrDip, 0.97, 1]
  let num = 0, den = 0;
  c.forEach((x, i) => { if (x === null) return;                        // missing component dropped
    const v = Math.min(1, Math.pow(x / t[i], EXP[i]));                 // f64 pow; NaN passes through
    num += W[i] * v; den += W[i]; });
  if (!(den > 0)) return null;
  return clamp(Math.fround(num * 100 / den), 0, 100);                  // f32 result
}
```
Consequences: no session, zero asleep time, or `sleepNeededSeconds == 0` all give asleepRatio 0, so the score is nil. Reaching 80% of need gives 0.8³ = 0.512 for the duration component. A nil score makes 0x1015c09d0 set `missingData = [.sleepMissingInputs]` (HealthMissingData case 7; c09d0.c lines 10–20).

**Presentation, `scoreComponents` (0x1015c3938 and 0x1015d1444, decomp 1015d.c:332).** For each component: `score` = the raw input value (not the curve). `percentOfTarget = powf(value / target, exp)` in Float32 and **not** clamped. `status` is set from percentOfTarget: `> 0.9` excellent, `> 0.67` good, `> 0.34` fair, otherwise poor, and noData when exactly 0. A nil input stores a nil result (status byte 5 is the Optional nil). The asleepRatio entry is built inline with the same thresholds (`powf(ratio, 3)`).

**Metric measurements written per day (0x1015c3938, HealthMetric → singleValue):**
- sleepScore = kernel output.
- sleepBank = `currentSleepBank` (window including today, M14).
- sleepConsistency = SRI (M15).
- sleepEfficiency = `(1 - awakeFrac) * 100`.
- timeInBedMinutes = `(session ? end - start : total)/60 + napTotalSeconds/60`.
- timeAsleepMinutes = `asleep/60 + napAsleepSeconds/60` (nil when 0).
- timeRem/DeepSleepMinutes = `rem/60`, `deep/60` (nil when there are no stages).
- heartRateDip = `max(0, pct) * 100`.
- sleepTime / wakeTime = minutes from `currentDay.dayStart` to the first / last non-awake segment start / end (0x1015d1564, fallback session start/end via 0x10171d7f8).
- timeToFallAsleep = latency minutes (0x1015d1780: when `hasStages && !inBedSegments.isEmpty`, `(firstNonAwakeSegment.start - session.startTime)/60`, else nil).

Nap sums come from a task group over `currentDay.naps` (0x1015c5fa0, per-nap 0x1015c3250 → 0x1015d0f14, accumulator 0x1015c3050). `sleepStageMetrics` = [awake, core, deep, rem, unspecified] (percentage of total, seconds).

### M03.03 — RESOLVED

HR dip producer: async-let child 0x1015d19f8 → 0x1015c5bf8 → 0x1015d23a0 → 0x1015d249c (decomp 1015d.c:1502).
```ts
function hrDipPercentage(day, metricHistories, baselines) {
  const samples = metricHistories[4] ?? [];            // key 4 = CalculatedMetric.inactiveHeartRate (HealthQuantitySampleWithStage[])
  // window strategy list [1] (0x1060b8cb0): [primarySleep.startTime, primarySleep.endTime]; nil sleep → [dayStart, dayStart] (empty)
  // 0x1015b9928: binary search on sample.startDate: keep start <= startDate < end  (both bounds via `>=`)
  // then keep samples whose context ∈ {remAndDeepSleep(1), otherSleep(0)} (group list 0x1060b8d00 → [[1,0]])
  const hr = filtered.map(s => Math.fround(s.doubleValue));
  const sleeping = hr.length ? mean(hr) : null;        // 0x10183bdc0 (Float32 mean)
  const base = baselines.baselines[startOfDay(day.functionalDay.dayStart)]?.[4]?.average ?? null; // CalculatedMetric.inactiveHeartRate
  const pct = (sleeping !== null && base !== null) ? Math.max(0, 1 - sleeping / base) : null;
  return { restingBpm: base, sleepingBpm: sleeping, percentage: pct };
}
```
No base == 0 guard exists: the result is Float `inf` or `NaN` (NaN passes through `max`, see the kernel). The baseline is `HealthDataBaselines.baselines: [Date: [CalculatedMetric: AggregateStatistics]]`, using the field `average`. How the baseline is built (window, days) belongs to Agent B. A Published value read at the start of 0x1015d249c (singleton 0x106a10528, keypath 0x104f94600) is never used afterwards (asm d249c.s: offset 0xa8 is written only).

Evidence: decomp 1015d.c:1502; 1015b.c:6500 (0x1015b9fbc), :5733 (0x1015b9928); static arrays at 0x1060b8cb0 and 0x1060b8cd8; descriptors HealthQuantitySampleWithStage (0x105232480) and CalculatedMetric (0x105246bd4).

### M03.04 — RESOLVED

Target helper 0x1015be43c (decomp 1015b.c:6295, asm verified). Inputs: `x0 = age` (signed Int), `w1 = (sex == male)`, `d0 = 0.2` passed through as REM. It returns deep in d0, REM in d1 and HR dip in d2.

| age | deep male | deep female | HRdip male | HRdip female |
|---|---|---|---|---|
| < 30 (signed; includes negative) | 0.15 | 0.15 | 0.30 | 0.30 |
| 30–39 | 0.13 | 0.14 | 0.28 | 0.29 |
| 40–49 | 0.12 | 0.13 | 0.27 | 0.28 |
| 50–59 | 0.11 | 0.12 | 0.26 | 0.27 |
| 60–69 | 0.10 | 0.11 | 0.25 | 0.26 |
| ≥ 70 | 0.09 | 0.10 | 0.24 | 0.25 |

REM is always 0.2. The helper is called only when `ageIsNil == false && sex < 2`. In every other case the kernel uses (deep 0.125, REM 0.2, HRdip 0.255): age nil, sex `other` (2), or sex nil (byte 3).

The caller 0x1017d6700 (decomp 1017d.c:11662) gives:
- `age = Calendar.current.dateComponents([.year], from: profile.birthday, to: Date())`, from 0x10310e084 (decomp 10310.c:12515). This is age **now**, not at the scored day. It is nil without a birthday or without a profile.
- `sex = SharedUserProfile.biologicalSex` (BevelBiologicalSex?). nil is byte 3. `fallbackSex` (HealthKit) is NOT used. Without a profile, sex = 3.

Corrections: none to the table. The earlier table is right. The new findings are the nil/other fallbacks and age-at-now.

---

## M14 — Sleep Bank

### M14.01 — RESOLVED

**Day list and windows.**
- `dayHistory` = one `FunctionalDayWithSleep` per consecutive functional day. The generator 0x1030defb0 builds N consecutive calendar-day functional days (it is also used by the goal loader). A night with no sleep is a day with `primarySleep == nil`.
- 0x1015be838 first keeps days with `functionalDay.dayEnd <= startOfDay(endDate + 1 day) - 1 second` (asm be838.s 1015be944..1015be9d4, `Comparable.<=`).
- `makeWindows(days, count = historicalLookbackDays, lookback = 30)` (0x1015b9360, decomp 1015b.c:5255) produces, for each of the last `clamp(count, 1, n)` indices `i` (chronological):
  - `currentDay = days[i]`
  - `previousDay = days[max(i,1)-1]`
  - `baselineDays = days[max(i-30,0) ..< max(i,1)]` (for i = 0 this is `[days[0]]` itself)
  - `nextBaselineDays = days[max(i-29,0) ... i]`

**Two banks per day (be838 asm 1015bf300..1015bf408, c09d0 asm 1015c1588..1015c1680):**
```ts
const goalHours = Math.fround(settings.sleepHours.minutes / 60 + settings.sleepHours.hours);
const previousBank = bank(w.baselineDays.slice(-7), goalHours);     // days i-7..i-1 → feeds SleepNeeded.sleepBankMinutes / debt
const currentBank  = bank(w.nextBaselineDays.slice(-7), goalHours); // days i-6..i   → HealthMetric.sleepBank shown for day i
```
**Kernel 0x1015cd324 (decomp 1015c.c:5992, asm 1015cd9ec..1015cdab0).** Slot weights are aligned from the **oldest** element:
```ts
const STAGES_NO_AWAKE = [0, 2, 3, 4, 5];                    // static array 0x1060b8b58/0x1060bfa60 = allCases minus awake(1)
const sessSecs = (s?: SleepSession) => s ? sum(STAGES_NO_AWAKE.filter(k => k in s.secondsInSleepStage).map(k => s.secondsInSleepStage[k])) : 0;
function bank(days: FunctionalDayWithSleep[], goalHours: number): number {
  const totals = days.map(d => sum(d.naps.map(sessSecs)) + sessSecs(d.primarySleep));   // f32
  let out = 0;
  totals.forEach((t, j) => { if (t === 0) return;           // zero/missing night: no contribution, slot still consumed
    out += ((t - goalHours * 3600) / 60) * Math.exp(0.3 * (j - 6)); });  // expf, f32; j counts from the OLDEST element
  return out;                                               // minutes, unclamped
}
```
Weights for j = 0..6: 0.165299, 0.223130, 0.301194, 0.406570, 0.548812, 0.740818, 1.0. With fewer than 7 days (the first days of history) the newest day does **not** get weight 1. With 3 days the weights are e^-1.8, e^-1.5, e^-1.2.

### M14.02 — RESOLVED

- **Goal:** the current `SettingsModel.sleepHours` (hours, minutes) (Published keypath 0x104f94480 on singleton 0x106a10688, confirmed as SettingsModel by the flow-VM init at decomp 10207.c:10459). It is read once per `calculateSleepHistory` run and applied to every past day. **There is no goal history.** A goal change re-scores all history with the new goal.
- **Naps:** included. Each day's total = Σ over naps + primarySleep of Σ `secondsInSleepStage` excluding awake. `nextPrimarySleep` is ignored.
- `inBed` would be counted if the dictionary held it. For HealthKit sessions it never does (M03.01).

### M14.03 — RESOLVED

- A missing night (`primarySleep == nil` and no naps, or total exactly 0) is skipped. It adds neither credit nor debt and keeps its positional weight slot.
- A day with only naps counts its nap seconds against the full goal.
- A missing day in the middle of the list cannot happen when the list is contiguous (generator above). If the upstream list were sparse, slot alignment would shift.
- Debt usage: `SleepNeeded.sleepDebtSeconds = previousBank < 0 ? previousBank * -60 * 0.25 : 0` (M16.01). Only a negative bank creates extra need. A positive bank never lowers need.

Corrections to earlier research:
1. Old: "contribution weights exp(0.3*(i-6)) for a seven-slot array". New: correct for 7 slots, but alignment is from the oldest element, so shorter windows shift every weight down.
2. Old: "Caller ordering, slot construction unresolved". New: two banks per day. **previous** (7 days before the day) feeds debt and `SleepNeeded.sleepBankMinutes`. **current** (7 days ending with the day) is the displayed `HealthMetric.sleepBank`.
3. New: naps are included, and the stage set excludes only awake.

---

## M15 — Sleep Consistency

### M15.01 — RESOLVED

Call: `sri = consistency(days = nextBaselineDays.suffix(8).dropFirst(), anchorSleep = nextBaselineDays.suffix(8).first?.primarySleep)` (be838 asm 1015bf43c..1015bf5fc). Function 0x1015cdbb4 (decomp 1015c.c:9100, asm cdbb4.s):
```ts
function consistency(days: FunctionalDayWithSleep[], anchor: SleepSession|null): number|null {
  const D = days.filter(d => d.primarySleep != null);                 // Equatable compare against nil
  if (D.length < 2) return null;
  const cal = Calendar.current;                                        // device time zone at compute time
  const long: SleepSession[] = [];                                     // sessions with (end - start) > 86400 s
  if (anchor && dur(anchor) > 86400) long.push(anchor);
  for (const d of D) if (dur(d.primarySleep) > 86400) long.push(d.primarySleep);
  const prev = [anchor, ...D.slice(0, -1).map(d => d.primarySleep)];  // previous FILTERED day's sleep, not previous calendar day
  const k = new Array(1440).fill(0); let N = 0;
  D.forEach((d, idx) => {
    const start = d.functionalDay.dayStart;
    const end = cal.date(byAdding: .day, value: 1, to: start); if (!end) return;   // 23/25 h on DST days
    N++;
    const mark = new Array(1440).fill(false);
    const paint = (s: SleepSession) => { for (const seg of s.segments) {
        if (!(seg.stage < 5 && seg.stage !== 1)) continue;             // asleepUnspecified/core/deep/rem only
        const a = max(start, seg.start), b = min(end, seg.end);        // `>=`, `<=` picks
        if (!(a < b)) continue;
        const m0 = hour(a)*60 + minute(a);                             // cal.dateComponents([.hour,.minute]), seconds truncated
        if (m0 >= 1440) continue;
        const m1 = (b == end) ? 1440 : hour(b)*60 + minute(b);
        if (m1 <= m0) continue;                                        // wrap/DST fold → nothing marked
        for (let m = m0; m < m1; m++) if (!mark[m]) { mark[m] = true; k[m]++; } } };
    for (const s of [prev[idx], d.primarySleep]) if (s && dur(s) <= 86400) paint(s);
    for (const s of long) paint(s);                                    // >24 h sessions painted on every day
  });
  if (N < 2) return null;
  let agr = 0; for (const km of k) agr += km*(km-1) + (N-km)*(N-km-1);   // Double
  return Math.fround(agr / ((N - 1) * N) / 1440 * 100);
}
```
Included days: the up to 7 most recent days of the window that have a primarySleep. N counts them. All 1440 minute bins are scored on every included day, so a day with sleep but no qualifying segment in its window still counts as fully awake.

### M15.02 — RESOLVED

- Bins use wall-clock `hour*60+minute` from `Calendar.current` (the time zone at compute time, not the time zone of the session).
- Day windows are `[dayStart, dayStart + 1 calendar day)`.
- Spring-forward (23 h): the missing hour gets no clock minutes, but a segment spanning it marks the whole index range, including the missing hour.
- Fall-back (25 h): repeated clock minutes map to the same bins. The per-day `mark` array counts each bin once. A segment whose clipped end clock-minute is ≤ its start clock-minute (crossing the fold) marks nothing.
- An end clipped exactly at the day end maps to bin 1440 (exclusive).
- This only works if `dayStart` is local midnight. Otherwise a sleep crossing midnight gives `m1 < m0` and is skipped (Hand-off to Agent B: FunctionalDay.dayStart).

### M15.03 — RESOLVED

- Only `primarySleep` sessions are used: the current day's plus the previous included day's (the anchor for the first). Naps are **never** used. `nextPrimarySleep` is not used.
- Stage filter: asleepUnspecified, core, deep and REM count as sleep. awake and inBed do not.
- Sessions longer than 24 h are painted on every included day.

Corrections: the old "minute indexing ... session classification, day eligibility, DST unresolved" is now answered above. The formula itself (agreement %, no `2a−1` transform) is confirmed.

---

## M16 — Sleep Needed / Goal

### M16.01 — RESOLVED

**(a) Per-day `SleepNeeded` used by the Sleep Score (calculateSleepHistory, be838 asm 1015bfd30..1015bfdd4; c09d0 repeats it):**
```ts
const goal = Math.fround((sleepHours.minutes/60 + sleepHours.hours) * 3600);
// strain z-score of the PREVIOUS day:
const prevStrain = strainHistory[w.previousDay.functionalDay]?.score;          // dict lookup 0x1017ff48c
const stats = meanStd(recentStrains);       // 0x10183bdc0: non-nil values, f32 mean, POPULATION std = sqrt(Σ(x-μ)²/n)
let mult = 1, valid = false;
if (stats && prevStrain != null) { const z = stats.std === 0 ? 0 : (prevStrain - stats.mean)/stats.std; mult = 1 + 0.02*z; valid = true; }
const m = (valid && mult > 1) ? mult : 1;
const strainExtra = Math.max(0, m*goal - goal);
const debt = previousBank < 0 ? previousBank * -60 * 0.25 : 0;
need = { sleepGoalSeconds: goal, recentStrainNeedSeconds: strainExtra, sleepDebtSeconds: debt,
         sleepNeededSeconds: debt + (goal + strainExtra), sleepBankMinutes: previousBank,
         sleepEfficiencyAdjustmentSeconds: null, timeToFallAsleepSeconds: null };
```
`recentStrains`:
- first window: the strains of `baselineDays` (≤30 days ending with previousDay; 0x1015ccc84).
- each next iteration: append the current day's strain; when the list already holds 30, drop the oldest first (c09d0 asm 1015c0c38 `cmp #0x1e`).
- This gives a rolling ≤30-day list ending with the previous day.
- `0.02` = 0x3ca3d70a.

**(b) Automatic goal estimator (DynamicSleepGoalService), re-verified.**
- Entry 0x101d797ec, data load 0x101d79804 → 0x101d763ec/0x101d76720/0x101d75518, input shaping 0x100c0088c, estimator 0x101d78fbc → 0x101d79054 (decomp 101d7.c:6636).
- Ordering and span:
  - 0x1030defb0(180, date) builds 180 consecutive functional days.
  - 0x1015b9360(days, 120, 60) builds windows for the **last 120 days** (60-day baseline lookback).
  - Recovery is computed per window (M16.04).
  - The result dictionary `[FunctionalDay: (primarySleep, recovery)]` is converted to an array **sorted ascending by `dayStart`** (insertion comparator 0x100c01d90 uses `Date.<`).
```ts
function dynamicGoal(items /* chronological */): Result {
  const pairs = [];
  for (const it of items) {
    if (!it.recovery || it.recovery.recoveryScore == null) continue;
    if (!it.primarySleep) continue;
    const vals = STAGES_NO_AWAKE.filter(k => k in it.primarySleep.secondsInSleepStage).map(k => it.primarySleep.secondsInSleepStage[k]);
    if (vals.length === 0) continue;                     // empty dictionary → skip; a zero total is KEPT
    pairs.push({ r: it.recovery.recoveryScore, s: Math.fround(sum(vals)) });
  }
  const last = pairs.slice(-90);                         // 0x101d72cb8 = Sequence.suffix(90) (ring buffer) — NOT prefix
  const sorted = stableSort(last, (a, b) => a.r > b.r);  // 0x101d72880: Swift stable merge sort, descending; ties keep chronological order
  const k = Math.trunc(last.length * 0.15);              // f64 multiply, fcvtzs
  if (k === 0) return 'failed';
  const mean = Math.fround(sum(sorted.slice(0, k).map(p => p.s)) / k);
  const secs = roundHalfAwayFromZero(mean);              // 0x1030d5a84 frinta; non-finite → failed
  const total = secs + 30;
  const high = items.filter(it => it.recovery && it.recovery.recoveryScore != null && it.recovery.recoveryScore >= 67).length; // ALL input, no sleep needed
  if (high === 0) return 'failed';
  const hours = Math.trunc(total / 3600), minutes = Math.trunc(total / 60) % 60;
  return (last.length >= 90 && high >= 15) ? { sufficientData: { hours, minutes } } : { insufficientData: { hours, minutes } };
}
```
With 90 eligible days, k = 13. Because of the 120-day window, 90 eligible days requires ≥ 90 of the last 120 days to have both sleep and a recovery score.

### M16.02 — RESOLVED

- `secondsInSleepStage` is built only from the resolved `segments` (0x101d7ba70). The resolver converts inBed pieces to awake (staged session) or asleepUnspecified (inBed-only session), so for HealthKit sessions the key `.inBed` is never present. Consequences:
  - No inBed double-counting in the goal estimator or the bank.
  - An inBed-only session counts as asleep (asleepUnspecified).
- Sources that may build `SleepSession` elsewhere (Oura, Garmin, Google integrations) are Agent A's. If such a builder put `.inBed` into the dictionary, both the estimator and the bank would add it, because the stage list includes 5.
- Missing stage vs zero: an absent key is skipped. A dictionary with no non-awake keys excludes the day from the estimator. A dictionary with keys summing to 0 keeps the day with 0 seconds. In the bank, a 0 total is treated like a missing night.

### M16.03 — RESOLVED

- `SettingsModel` init (0x101936a94, asm `101936b9c`/`101936ba4`) loads `sleepHours` from user-defaults key enum 0xc through 0x1019383e0 (decomp 10193.c:5217). The getter is `userDefaultsService` witness +0x10, which returns `Float?`. **A missing value becomes 7.5 h**: asm `1019384e4 and x8,x19,#0xff00000000; cmp x8,#0x100000000; fmov s1,#7.5; fcsel s8,s1,s0,eq`. The init then converts with 0x101939510 (decomp 10193.c:6061): `hours = floor(h)` (frintm), `minutes = round_half_away((h - floor(h))*60)` (frinta). For 7.5 this gives **(7, 30)**. The method comes from key 0xd (string): `"automatic"` → automatic, anything else or missing → manual.
- **The calculators never read the method.** SleepCalculator, the tonight planner and the bank all read only `sleepHours`. Only three places reference the method keypath patterns: SettingsModel init/persistence (0x101936a94), DynamicSleepGoalService (0x101d79cb8), and the settings and customization view models (patterns 0x105008068, 0x105007e50, 0x105081858).
- Onboarding (`OnboardingViewModel`, 0x101af957c → 0x101d79a90 → 0x101d79ab0/0x101d79b30/0x101d79cb8):
  - `sleepHours = defaultGoalByAge(age)` (age from HealthKit birthday, now).
  - Defaults key 0xc ← Float hours.
  - Method is set to **automatic** (key 0xd = "automatic").
```ts
function defaultGoalByAge(age: number|null) {          // 0x101d79e9c, decomp 101d7.c:5324
  if (age == null || (age >= 20 && age <= 29)) return [8, 0];
  if (age >= 30 && age <= 39) return [7, 45];
  if (age >= 40 && age <= 59) return [7, 30];
  if (age >= 60 && age <= 69) return [7, 15];
  return age < 70 ? [8, 0] : [7, 0];                   // <20 (incl. negative) → 8:00; ≥70 → 7:00
}
```
- The dynamic estimator runs only when the user opens the settings sleep-goal flow. Its single caller is `SettingsSleepGoalFlowViewModel` 0x10207cdcc, which sets `dynamicSleepGoalCalculationState = .calculating` and then `.finished(result)`. No background re-estimation path exists in the binary.
- `failed` provides no value. `insufficientData` still carries hours and minutes, and the view (`SettingsSleepGoalResult.sleepGoalResult`) presents it. Applying it writes `sleepHours`.
- **Fallback when no goal is saved (corrected; matches Agent B's G06).** Only one read site turns the stored value into a goal: 0x1019383e0, with the 7.5 h default above. Every calculator reads the in-memory `SettingsModel._sleepHours` Published value (singleton 0x106a10688), never user defaults directly. So with no saved goal, all of them see **(7 h, 30 min) = 27000 s**:

| Consumer | Read site | Value seen with no saved goal |
|---|---|---|
| Sleep Score need (calculateSleepHistory) | Published get, keypath 0x104f94480, be838 asm `1015beb14..1015bebc8`; goal = (30/60 + 7)·3600 at `1015bfd34..1015bfd64` | 27000 s goal; need = 27000 + strainExtra + debt |
| Sleep Bank (both banks) | same `goalHours` value, be838 asm `1015bf3c0..1015bf3e8` → 0x1015cd324 | 7.5 h |
| Sleep Needed, per-day `startingSleepNeeded` | same as the score | 27000 s |
| Sleep Needed, tonight (0x101d7ece0 → 0x1015cc358) | `(hours, minutes)` tuple in the service input, taken from `SettingsModel.sleepHours`; converted `(min/60 + h)` at decomp 101d7.c:10439 | 7.5 h |
| Energy Bank (outside my scope; read site only) | 0x101542f80 (energy-bank region) reads the same `SettingsModel` Published property twice (keypath 0x104f91828: hours at +0x6b8, minutes at +0x6d0) | (7, 30) |

The earlier statement that a missing goal reads as 0 was wrong: it assumed the getter was a raw `UserDefaults.float(forKey:)`. A value of 0 can only come from a stored 0, not from a missing key. Onboarding normally overwrites the 7.5 h default with `defaultGoalByAge(age)` (0x101d79a90). The 7.5 h default only applies when that path never ran.

### M16.04 — RESOLVED (boundary to Recovery noted)

- For the goal calibration, recovery is **recomputed locally** for each of the last 120 windows by calling `calculateRecoveryMetricsForDay(selectedDay:sleepHistory:metricHistories:baselines:mindfulness:options:ignoreSleepScore:isToday:)` 0x1015b0ba4 with **`ignoreSleepScore = true`** (`mov w6,#1` at 0x101d75cac) and `isToday = (day == today)` (0x101d75c88 `Date.==`). The baselines come from a fresh `HealthDataBaselines` (0x10158bf80) built in the loader.
- So the goal's recovery score is the recovery formula without its sleep component. That removes the circular dependency (sleep score depends on the goal).
- The rest of the recovery formula belongs to the Recovery owner (hand-off).

### M16.05 — RESOLVED

The "tonight" planner (`TonightSleepNeededService`, compute 0x101d7ece0 (decomp 101d7.c:10147) → `calculateSleepNeeded` 0x1015cc358 (decomp 1015c.c:4484)). Every caller passes `includeAdjustments = true` (0x1008f2238, 0x101d71bc0, 0x101d7ece0).
```ts
function tonightSleepNeeded(date, items, sleepHours) {
  const today = items.sleepMetrics.find(e => e.day.dayStart == date);
  const bank = today?.metrics.metricMeasurements[8 /*sleepBank*/]?.value ?? 0;   // = currentBank (includes last night)
  const z = strainZ(items.strainMetrics, date);         // 0x1015da8d4: strains whose startOfDay(day) lies in the CLOSED range [date-30d, date]
                                                        // (0x1030cb480 = ClosedRange(min(a,b)...max(a,b)).contains: `>=` lo at 1030cb6fc, `<=` hi at 1030cb714), so today's strain is
                                                        // inside its own mean/std; today's strain = entry with day == date; z=(today-mean)/popStd, std==0 → 0; nil if missing
  const hist = items.sleepMetrics.filter(e => e.day.dayStart >= date - 30d && e.day.dayStart <= date - 1d); // 0x1015cbedc
  return calculateSleepNeeded(goalHours(sleepHours), bank, z, hist, true);
}
function calculateSleepNeeded(goalHours, bankMin, z, hist, adjust) {
  const goal = goalHours * 3600;
  const m = (z == null) ? 1 : Math.max(1, 1 + 0.02*z);
  const strain = Math.max(0, goal*m - goal);
  const debt = bankMin < 0 ? bankMin * -60 * 0.25 : 0;
  const base = debt + goal + strain;
  if (!adjust) return { goal, strain, debt, needed: base, bank: bankMin, eff: null, lat: null };
  const effs = hist.map(h => h.metricMeasurements[17 /*sleepEfficiency %*/]).filter(nonNil);
  const avgEff = effs.length ? mean(effs) : 100;
  let effAdj = avgEff === 0 ? 0 : base / (avgEff / 100) - base;
  effAdj = Math.min(effAdj, 3600);                      // capped at 1 h; no lower clamp
  const lats = hist.map(h => h.metricMeasurements[18 /*timeToFallAsleep min*/]).filter(nonNil);
  const latAdj = lats.length ? Math.min(mean(lats), 60) * 60 : 0;   // capped at 60 min
  return { goal, strain, debt, needed: base + effAdj + latAdj, bank: bankMin, eff: effAdj, lat: latAdj };
}
```
Naps are handled only through the bank (naps count as sleep in the 7-day bank). There is no separate nap subtraction.

Corrections to earlier research (dynamic goal and need):
1. Old: "Keep the first at most 90 eligible pairs in supplied order; helper takes a prefix". New: `suffix(90)` (ring buffer) over a **chronologically ascending** input, so the 90 most recent eligible days, taken from the last 120 days.
2. Old: "Upstream must prove inBed presence". New: inBed is converted away before the dictionary is built (HealthKit path).
3. Old: "for positive finite durations" eligibility. New: a zero sum is still eligible. Only an empty non-awake key set excludes a day.
4. Old: "strainExtra = goal*(max(1,mult)-1)". New: equivalent, but mult is used only when the z-score is valid. The z-score uses the previous day's strain against a ≤30-day rolling population mean and std (score path), or today's strain against strains of the closed range [date−30d, date], which includes today (tonight path).
5. Old: "debt from sleepBankMinutes". New: the score path uses the **previous** 7-day bank. The tonight path uses the **current** bank stored on today's metrics.
6. New: efficiency and latency adjustments and their caps (1 h, 60 min). Not present in the per-day need used by the score.

---

## New discoveries
- The overlap resolver turns inBed into awake or asleepUnspecified (0x1015cb390, 0x1015ca840). This drives efficiency and the bank for every HealthKit session.
- Previous SleepMetrics are kept as a rolling ≤30-entry list (0x1015ccf74 and 0x1015d18a0) but never read during calculation (dead state).
- Window tuple field names: `(currentDay, previousDay, baselineDays, nextBaselineDays)`.
- Default goal by age (above), and onboarding sets the method to automatic.
- HR-dip sample filter by SampleContextType and the half-open startDate window (0x1015b9928) are shared with recovery and stress (0x1015b0ba4, 0x1015d36f4, 0x1015bab50).

## Hand-offs
- **Agent A (ingestion):**
  - Segment sort predicate on `HealthDataSource.metadata` (0x1015c93f8).
  - `nextPrimarySleep` and primary/nap classification.
  - Session `startTime`/`endTime` construction (0x101d7cf98).
  - Non-HealthKit `SleepSession` builders (do they ever put `.inBed` into `secondsInSleepStage`?).
- **Agent B (framework):**
  - `FunctionalDay.dayStart`/`dayEnd` definition (SRI assumes local midnight).
  - `HealthDataBaselines.baselines[startOfDay][.inactiveHeartRate].average` construction.
  - `metricHistories[.inactiveHeartRate]` sample tagging with SampleContextType.
  - Key 0xc default is resolved: 7.5 h, applied in SettingsModel's own loader (0x1019383e0), not through defaults registration.
  - Pipeline 0x1017d6700 (endDate, historicalLookbackDays values).
- **Recovery owner:** `calculateRecoveryMetricsForDay(..., ignoreSleepScore: true)` used for goal calibration (0x101d75cb0).
- **Strain owner:** `strainHistory` dictionary values (`Float?` at stride 0x18).
