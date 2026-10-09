# Agent E findings: Daily Strain (M02), Cardio Load (M07), Target Strain (M17), Heart Rate Recovery (M18)

Scope: M02.01-03, M07.01-03, M17.01-05, M18.01-05. Binary: Superset (arm64), image base 0x100000000.

## 0. Method notes and a warning that applies to every earlier claim

* **Ghidra mislabels Swift comparisons.** `Comparable::>__infix` is printed for both `>` and `>=`, and `Comparable::<__infix` for both `<` and `<=`. Every boundary below was re-derived from the call stub name in the disassembly: `_$sSL2geoi...` is `>=`, `_$sSL2leoi...` is `<=`, `_$sSL1loi...` is `<`, `_$sSL1goi...` is `>`; `Date.<`/`Date.>` stubs are `_$s10Foundation4DateV1loi...`/`1goi...`. Float gates were checked against `fcmp` + condition code (`b.mi/b.pl/b.hi/b.ls/b.ge`). Where Ghidra said `>`, the assembly was `>=` for: day HR slices, steps slices, DateInterval overlap tests, workout-in-day filter.
* **Calendar helper stubs** (all `Calendar.current.date(byAdding:...)`): `0x1030cbe40` = +N days, `0x1030cbe4c` = **-N days**, `0x1030cbe58` +N hours, `0x1030cbe64` -N hours, `0x1030cbe70` +N minutes, `0x1030cbe7c` -N min, `0x1030cbe88` +N s, `0x1030cbe94` **-N seconds** (these are `b 0x1030cba00` (add) / `b 0x1030cbc20` (subtract, `negs x1,x20`)).
* `0x1030c7b04(interval, dateComponents)` = `Calendar.enumerateDates(startingAfter: interval.start, matching: comps, matchingPolicy: .nextTime, repeatedTimePolicy: .first, direction: .forward)` with closure `0x1030c7d60` that appends match `m` while `m < interval.end` and stops otherwise. With DateComponents(hour 0, minute 0, second 0) (built by `0x1030c7fa0`/inline) this yields **local midnights strictly after interval.start and strictly before interval.end**.
* `0x1030d5a84(Float) -> Int?` = `Int(x.rounded(.toNearestOrAwayFromZero))`, nil when non-finite (asm `frinta`). `0x1030d6870(x)` = `round_half_away(x*10)/10`.
* Swift type/field names were recovered from `__swift5_types`/`fieldmd` with my script (`work/E/tq.py`); function-to-type accessor map in `work/E/acc.py`. Scratch: `/Users/adityajindal/bevel-re/work/E/`.
* HealthQuantityType enum (index): 4 `heartRateMinuteAggregates`, 5 `heartRateSamples`, 8 `restingEnergyBurnedDisplay`, 9 `activeEnergyBurnedDisplay`, 21 `steps`, 22 `stepsDisplay`.
* `SampleContextType` ("stage" of every `HealthQuantitySampleWithStage`): 0 otherSleep, 1 remAndDeepSleep, **2 workout, 3 mindfulness, 4 awake, 5 exercise**.
* `StrainZone`: 0 resting, 1..5 zone1..zone5. `HeartRateZoneSettings` layout: `zone1..zone5` are 24-byte `HeartRateZoneSetting {zone:u8 @0, bpmLowest:f32 @4, id:String @8}` at offsets 0,0x18,0x30,0x48,0x60; `maxHR:f32` at +0x78. So `bpmLowest` of zone k is at +4,+0x1c,+0x34,+0x4c,+0x64.

---

## M02: Daily Strain

### Call graph
```
HealthDataLoader.calculateHealthMetrics 0x1017d6700 -> calculateStrainHistory (0x1017d43dc tracing wrapper)   [day framework: agent B]
  -> 0x1017d91f8 (witness thunk; loads workoutInputs.recordedWorkouts=[x3], exerciseSegments=[x3+0x20])
  -> StrainCalculator.getWorkoutMetrics(metricHistories:selectedDay:workoutInputs:isToday:)  0x1015d2f78 -> 0x1015d36f4
       steps  : 0x1015bcbdc   (key 0x15)
       HR     : slices of histories[heartRateMinuteAggregates] ; 0x1015afa30 clip ; 0x1015d97fc map ; 0x1015da0e0 / 0x1015dbbcc segments
       zones  : HeartRateZonesService.settings(for: dayEnd) 0x10191f810 -> 0x10192344c
       score  : StrainCalculator.calculateDayStrainScore(workouts:exerciseHeartRateSessions:passiveHeartRateSegments:totalSteps:zoneSettings:isToday:) 0x1015dc638
                  exercise units 0x1015db128 ; passive units 0x1015dc480 ; weights 0x1015daf94 ; zone finder 0x1015d96f8
```
Source file strings: `Superset/StrainCalculator.swift`, function names at `0x10591c880` and `0x10591c9d0`.

### M02.01: HR source selection and cadence: RESOLVED

HR source for strain is **only** `metricHistories[.heartRateMinuteAggregates]` (key 4; `FUN_101e3d520(4, histories)` at `0x1015d45c4`). `heartRateSamples` (key 5) is not read by the strain path. Elements are `HealthQuantitySampleWithStage {sample: HealthQuantitySample, stage: SampleContextType, source}`; `sample.doubleValue` is bpm (unit `countPerMinute`), `startDate/endDate` per aggregate. The array is assumed sorted ascending by `sample.startDate` (binary search). How aggregates are produced/tagged is ingestion (hand-off A).

Day slice (twice, once for exercise, once for passive; `0x1015d4e5c`, `0x1015d4f10` are `>=`):
```
lo = first index with sample.startDate >= day.dayStart
hi = first index with sample.startDate >= day.dayEnd
slice = samples[lo..<hi]                     // dayStart <= start < dayEnd (half open)
exerciseSamples = slice.filter { stage == 2(workout) || stage == 5(exercise) }   // (map to HealthQuantitySample)
passiveSamples  = slice.filter { stage == 4(awake) }
```
`day` = selectedDay: `FunctionalDayWithSleep.functionalDay{dayStart, dayEnd}` (agent B defines the boundaries).

Cadence/segments (no resampling; start-to-start differences):
```ts
// 0x1015d97fc with empty gap list: sample -> HeartRateMeasurement{bpm: Float(sample.doubleValue), timestamp: sample.startDate}
// 0x1015d97fc with gap segments (not used by strain): a sample overlapping a segment (end>=seg.start && start<=seg.end) is replaced by two nil-bpm markers (seg.start, seg.end); used by workout HR (pauses).
function segmentsPassive(maxGap=1800.0 /*Double 0x409c200000000000*/, m: Measurement[], zs) { // 0x1015dbbcc
  for i in 0..<n-1 { cur=m[i], nxt=m[i+1]
    if cur.bpm==nil: continue            // nil next is allowed (only cur is tested)
    dur = max(0, nxt.ts - cur.ts)        // seconds, Double
    dur = min(maxGap, dur)               // fcmp d8,d0; fcsel mi
    emit HeartRateSegment{bpm: cur.bpm, durationSeconds: Float(dur), start: cur.ts, end: cur.ts+dur}
    zoneSeconds[zone(cur.bpm)] += Float(dur) } }
function segmentsExercise(m, zs) {        // 0x1015da0e0: same but NO cap; end = nxt.ts
    dur = max(0, nxt.ts-cur.ts) ; segment.end = nxt.ts }
```
The last measurement of a list has no successor and contributes nothing.

Exercise windows (non-workout exercise, e.g. Apple exercise minutes): `ExerciseSegment{startTime,endTime,activityScore?}` list (`exerciseSegments`, hand-off A) is kept when `seg.startTime >= dayStart && seg.startTime <= dayEnd` (asm `0x1015d4b78 <=`, `0x1015d4b90 >=`, inclusive both ends, segments are NOT clipped to the day), then merged by `0x1015db488`:
```
sort segs by start; run = first
for seg in segs: if run.end < seg.start (strict gap):  // Date.<
      if !overlapsWorkout(run) emit(run) ; run = seg
   else run.end = max(run.end, seg.end)                  // seg.end >= run.end -> take seg.end
if !overlapsWorkout(run) emit(run)       // trailing run
overlapsWorkout(r) = exists W in allWorkoutIntervals(sorted by start; BINARY SEARCH) with r.end >= W.start && r.start <= W.end   // 0x1015db24c, geoi/leoi inclusive
   binary search step: if r.end < W.start go left else go right (so it assumes sorted, non-overlapping workouts)
```
`allWorkoutIntervals` = `RecordedWorkoutSummary.dateInterval` of EVERY element of `workoutInputs` (not only the day's), copied in input order.
Each emitted run `[s,e]` -> `exerciseSession` = `segmentsExercise(map(samples in exerciseSamples clipped to [s,e]))` (clip `0x1015afa30`: returns the sample unchanged if `start>=S && end<=E`; nil if `end<=S || start>=E`; else copy with `start=max(S,start)`, `end=min(E,end)`, bpm unchanged). Order of exerciseSessions = merged runs ascending by start.

Passive sessions: `segmentsPassive(1800, passiveSamples)` over the whole day slice (one list for the day); zone seconds go to the day's zone breakdown.

Zone settings used: `HeartRateZonesService.shared.settings(for: selectedDay.dayEnd)` (`0x10191f810`, date argument = `dayEnd` at `0x1015d579c`). `0x10192344c(history, date)`: first entry of `history` (array order, presumably newest first) with `date >= entry.effectiveDate` (asm `0x101923580 >=`), else `history[0]` (first element, oldest-or-newest per stored order), else default `0x10191a390(maxHR=195.0 (0x43430000), nil, nil, method 0)`. Zone lower bounds (see "Zone settings derivation" in New discoveries).

### M02.02: workout vs passive allocation: RESOLVED

Three disjoint pools feed the day total U:
1. **Workouts** (`ScoredWorkoutSummary` of workoutInputs with `dateInterval.start >= dayStart && <= dayEnd`, asm `0x1015d6e2c >=`/`0x1015d6e30 <=` in `0x1015d6d38`): contribute their STORED `muscularStrainUnits` and `cardioStrainUnits` (nil -> 0). Their HR samples are tagged stage 2, so they are excluded from the passive pool. Workout units are NOT recomputed from HR here.
2. **Exercise windows** (above): units = sum over all segments of `weight(bpm) * durationSeconds`, all zones including zone 0 (resting) with weight interpolated 0..1.
3. **Passive** (stage awake): same sum but segments with `0 <= bpm < zone1.bpmLowest` are dropped (zero weight). Passive gap cap 1800 s.
Steps are a separate additive term.

Per-workout stored units come from `WorkoutScoreCalculationService`: see M02.03.

### M02.03: muscular units and final display mapping: RESOLVED (formula); UI clamps not found

Final formula (`0x1015dc638`; constants verified: 7000.0 = 0x45dac000, 20000.0 = 0x469c4000, 66.0 = 0x42840000, 16.0; all Float32; `_atanf`):
```ts
function dayStrain(steps: Float, workouts, exerciseSessions /*[[Seg]]*/, passiveSegs, zs): Float {
  const stepsScore = 16 * atanf(steps / 7000)                         // s11
  const exercise = sum(flatten(exerciseSessions).map(s => weight(s.bpm, zs) * s.durationSeconds)) // 0x1015db128, sequential Float adds
  const passive  = sum(passiveSegs.filter(s => !(0 <= s.bpm && s.bpm < zs.zone1.bpmLowest)).map(s => weight(s.bpm,zs)*s.durationSeconds)) // 0x1015dc480
  const muscular = sum(workouts.map(w => scores(w).muscularStrainUnits ?? 0))   // field +0x10 of WorkoutSummaryScores
  const cardio   = sum(workouts.map(w => scores(w).cardioStrainUnits  ?? 0))   // field +0x18
  const U = passive + ((exercise + muscular) + cardio)                           // fadd order at 0x1015dcc00-0x1015dcc08
  return stepsScore + 66 * atanf(U / 20000)                                      // s13 = s11 + s15
}
```
`isToday` only gates a debug log. No clamp, no rounding, no 0-21 mapping inside the calculator. Upper bound (nonnegative inputs) = 82*pi/2 = 128.805; steps alone cap at 25.13, load alone at 103.67.
Log strings confirm names: "totalSteps", "passiveCardioScore" (the step score), "exerciseCardio", "passiveHR", "muscular", "workoutCardio", "totalWork", "workoutStrainScore".

`totalSteps` (`fVar53`): sum of `Float` values of `0x1015bcbdc(key 0x15=steps, histories[steps], [selectedDay], allowedStages=[4 awake] (static array 0x1060b8de8 = {04}), includePrevious=0)`:
```
samples = sourceArbitrate(histories[steps], dataTypeCategory(8), DataSourceModel)   // 0x1015b48ac, 0x1016b0224 table DAT_104f98278[0x15]=8 ; user source priority (agent A)
lo = first idx startDate >= windowStart (= first day.dayStart); hi = first idx startDate >= windowEnd (= last day.dayEnd)   // asm >=, >=
slice = samples[(includePrev ? max(lo-1,0) : lo) ..< hi]
for (i,s) in slice: if s.stage not in allowedStages: continue
   if i is neither 0 nor last, or startOfDay(s.start)==startOfDay(s.end):
        if s.start < windowStart || s.start > windowEnd: continue ; value = s.doubleValue        // Date.< / Date.> => inclusive window
   else if i==0 : value = s.doubleValue * (s.end - (startOfDay(s.start+1d) - 1s)) / (s.end - s.start)
   else         : value = s.doubleValue * (startOfDay(s.end) - s.start) / (s.end - s.start)
   out.append(Float(value))
totalSteps = out.reduce(0,+)
```
So steps taken during workouts/exercise/sleep stages are excluded; midnight-straddling first/last samples are prorated to the calendar day.
(`stepsDisplay` key 0x16 is separate: it is the daily statistic bucket whose `startDate == startOfDay(dayEnd)`; used only for the displayed step count and the `steps` HealthMetric 0x19; same for active/resting energy keys 9/8.)

Muscular units and cardio units per workout (needed by F): see "Workout-level units" below.

Display: `StrainMetrics.strainScore: Float?` is put in `metricMeasurements[strainScore(23)]` unchanged. Rounded presentation uses `0x1030d5a84` (Int, half away from zero) e.g. `roundedWorkoutStrain`, `roundedTargetStrainLow/High`. UI text says "% Strain" and target "Strain level"; there is no 0-21 conversion anywhere on the Strain path. I did not trace the SwiftUI ring/gauge clamp (BLOCKED only for UI clamping: what would unblock it is the DashboardStrainView body).

#### Zone weights (verified, constants read from `0x104f94690..0x104f946b0` and inline `0x4000000040000000`)
```
zone: (lowerWeight, upperWeight)   0:(0,1) 1:(2,2) 2:(3,4) 3:(4,7) 4:(7,12) 5:(12,20)
weight(hr): z = zone(hr) with [lowerHR, upperHR)
   if lowerHR == upperHR  ->  (wl+wu)/2     // fcmp s10,s11 ne
   else wl + (hr-lowerHR)/(upperHR-lowerHR)*(wu-wl)          // Float32; no clamp (>maxHR extrapolates beyond 20)
zone(hr) 0x1015d96f8 (z1..z5 = bpmLowest of zone1..5, mx = maxHR):
   if 0 <= hr < z1 : zone 0, [0, z1)
   elif z1 <= hr < z2 : zone 1 [z1,z2) ; z2<=hr<z3 : 2 ; z3<=hr<z4 : 3 ; z4<=hr<z5 : 4
   else : zone 5 [z5, mx]   // includes hr>=z5, hr<0 and NaN
   preconditions (traps): z1>=0, z1<=z2<=z3<=z4<=z5   (brk #1 otherwise; maxHR not checked)
```
Dictionary lookup `0x1017ff614` (zone enum hash) always finds the 6 keys.

#### Workout-level units (what `WorkoutSummaryScores.cardioStrainUnits`/`muscularStrainUnits` are)
Two writers exist; both build the same units:
* legacy overlay: `0x1017c3870` (`WorkoutOverlayScoresBuildDependencies`) calls `0x1017cbd18` (HR) then `0x1014f3074`.
* new per-sport path: `0x10175f370` (`[WORKOUT SPORT]`) -> continuation `0x100f4f5d8` etc. The persisted `SportSummaryScores.cardioLoad`/`muscularLoad` map to units via `0x103ee9200` (strainScore@0x204, trimp@0x20c, muscularLoad@0x214, cardioLoad@0x258 -> WorkoutSummaryScores strainScore, trimp, muscularStrainUnits, cardioStrainUnits). `.legacy(WorkoutSummaryScores)` is used as is; `.recordedOnly` converts an empty scores struct (all nil -> units 0 in the day sum). `0x103ee47e4` is the switch (tag 0 calculated, 1 legacy, else recordedOnly).

`cardioStrainUnits` (unit: weighted seconds, same units as exercise units) = `0x1015db128(workoutSegments, zoneSettings)` where `workoutSegments` come from `0x1017cbd18`:
```
samples = workoutHRSamples = HR samples with startDate in [workout.start, workout.end)   (0x1017bd610, second slice; asm >=,>=)
gaps    = workout pauses (BaseTimeSegment[]) ; measurements = 0x1015d97fc(samples, gaps)  // overlapping a pause (end>=p.start && start<=p.end) -> replaced by nil markers at p.start,p.end
segments= 0x1015da0e0(measurements, zs)   // uncapped start-to-start durations
cardioUnits = sum(weight(bpm)*durationSeconds over ALL segments)   // all zones
if segments.isEmpty : cardioUnits = 0 (flag present) 
```
Effort blend ONLY in the legacy overlay for workouts WITHOUT strength sessions (`0x1014f3074`):
```
strain0 = 66*atan(cardio/20000)
if workoutEffort != nil && strain0 != 0: cardio = cardio * ((Float(workoutEffort*10)*0.3 + strain0*0.7) / strain0) ; strain = 66*atan(cardio/20000)
returns (strain, cardioUnits(after blend), muscular=nil, ...)
```
(0.3 = 0x3e99999a, 0.7 = 0x3f333333 as Float32, workoutEffort is Double.) The new per-sport path does not blend: `strain = 66*atan((cardio + muscular)/20000)`; effort goes to `rpe` separately.

`muscularStrainUnits` (only if the workout has strength sessions; else nil) = `0x1015ad2d4`:
```
for each session s with effortS = s.estimatedEffort ?? workoutEffort (Double?):
   acc = {}                                    // per StrengthMuscleGroup (22)
   for set in s.sets:
      e = setEffort(set, effortS)              // 0x103e45650
      for (m, w) in muscleWeights(set.exercise) : acc[m] += e * w     // 0x1015ac7f4: primary muscles 1/nPrimary each; secondary (1/nSecondary)*0.5 each (secondary overwrites if same muscle)
   out_s[m] = 100 * atan(acc[m] * K[m] / 150)  // K table 0x104f93f20: abductors 1.8, abs 3.0, adductors 1.8, biceps 2.0, calves 1.6, chest 3.6, core 3.0, forearm 1.4, glutes 4.0, hamstrings 2.8, hipFlexors 2.2, lats 3.2, lowerBack 2.4, middleBack 3.0, neck 1.0, obliques 2.6, quads 3.6, rotatorCuff 1.2, shoulder 2.4, traps 4.4, triceps 1.8, upperBack 3.4
total[m] = sum over sessions out_s[m]
muscularStrainUnits = Float( 50.0 * sum_m total[m] )     // 0x4049000000000000 at 0x1015ad6d8
setEffort(set, base): base = effort ?? 5.0
   a = set.analysis?.doubleValues ; if a empty/nil -> base
   e = a["steLoss_v1"].map{ $0*10 + 3 } ?? 3.0 ; (missing "steLoss_v1" -> base)
   if a["detectedReps_v1"] exists and |that - Double(reps)| > 5.0 -> base   // reps = set.setType==.reps(n) ? n : 0
   else clamp(e, 3, 10)
```
(string keys decoded from the small-string immediates at `0x103e456a8` and `0x103e45714`; "steLoss_v1" is the literal as stored.)
Strength day totals for Muscular Load (`muscularLoad` pair in CumulativeMetrics) use `0x10008b9d0`/`0x100085b1c`, F's area.

### Corrections to earlier research (M02)
* "Which segments enter passive versus workout accumulation depends on filtering": now exact (stage 4 vs 2/5; workouts come from stored units; passive drops `0<=bpm<zone1`).
* "muscular-workout conversion is not recovered": now exact (above).
* Earlier: seconds accumulation at `0x1015db208`: confirmed (`fmul s0,s9,s10`).
* Earlier claim that zone-2 lower weight 3 vs zone-1 upper 2 etc: confirmed from raw table bytes.

### Evidence
`1015d.c:6341` (day calc), `1015d.c:4393` (weights), `1015d.c:3943` (zone), `1015d.c:4458/5738` (units), `1015d.c:9926` (getWorkoutMetrics), `1015d.c:5511/4176/4869` (segments), `1015a.c:8634` (clip), `1015b.c:7980` (steps), `1015d.c:5238/4504` (merge/overlap), `1015d.c:1448` (workout-in-day), `103ee.c:5456/8271`, `1014f.c:2599`, `1015a.c:9025/8726/7792`, `103e4.c:3208`; asm in `/Users/adityajindal/bevel-re/work/E/*.s` (d36f4c.s etc.).

---

## M07: Cardio / Training Load

### Call graph
```
CumulativeHealthMetricsService (Superset/CumulativeHealthMetricsService.swift)
  calculateAndUpsertCumulativeMetrics(strainMetrics:recoveryMetrics:workoutsByDay:calculationWindow:cumulativeMetricsLookbackDays:)  0x1015e9840 (cont. of entry 0x1015e969c)
  calculateCumulativeMetricsFromCheckpoint(currentDay:metricsLookbackDays:cumulativeMetricsLookbackDays:strainMetrics:recoveryMetrics:workoutsByDay:) 0x1015ec378 -> 0x1015ec8e4
  per-day step : 0x1015efbc4          (ATL/CTL/target strain/workoutImpacts/dailyTrimp/muscular)
  daily load   : 0x1015ef6c4          (workoutsByDay -> [Date: Float])
  seed history : 0x1015eecc0 constructInitialStrainWindow(for:strainMetrics:)
  UI builder   : 0x10000ae0c  (cumulative cache -> [CardioLoadDataPoint]) used by PhoneCardioLoadDataService
```

### M07.01: TRIMP producer: RESOLVED
Per-workout TRIMP (Banister) in `0x1017cbd18` (`WorkoutOverlayScores.trimp`/`SportSummaryScores.trimp`). Inputs: workout HR segments exactly as for `cardioStrainUnits` (above, includes pause gaps), `zoneSettings.maxHR` (+0x78), `baselineRestingHR: Float?` (WorkoutOverlayScoresBuildDependencies field 12; supplied by `calculateScoresForWorkout(hkm:inputs:baselineRestingHeartRate:...)` `0x100f5a644`, baseline source = agent B), biological sex table `DAT_104fa1750` = {male 1.92, female 1.67, other 1.795, nil 1.795} (Float32 1.92=0x3ff5c28f...).
```ts
function trimp(segs, rest: Float?, maxHR: Float, sex): Float? {
  if rest == nil || segs.isEmpty -> nil           // flag: rest nil => nil ; empty segments => units 0 but trimp nil
  minutesByHR: [Float:Float] = {}
  for s in segs { k = roundHalfAway(s.bpm)  /*frinta*/ ; minutesByHR[k] += s.durationSeconds/60 }   // 60.0 = 0x42700000
  b = [1.92,1.67,1.795,1.795][sex]; d = maxHR - rest
  total = 0  // Float32, dictionary iteration order (hash order)
  for (k, mins) in minutesByHR {
     x = (k - rest)/d
     if !x.isFinite: continue                       // |bits|>0x7f7fffff => adds 0
     x = (x <= 0) ? 0 : x                           // fcmp s0,#0 ; fcsel ls
     total += (expf(b*x) * 0.64) * (x*mins)         // 0.64 = 0x3f23d70a
  }
  return total.isFinite ? total : 0
}
```
Daily TRIMP (`0x1015ef6c4`): `dailyLoad[startOfDay-key] = sum over workouts of that day of witness+8 (trimp: Float?, nil->0)`, sequential Float32 adds in array order; days absent from `workoutsByDay` have no entry (treated 0 later).

### M07.02: initialization and missing dates: RESOLVED (one observed quirk flagged)
Recurrence (0x1015efbc4, Float32, verified from fmul/fadd with constants 0.25, 0.75, 0.046511628 = 0x3d3e82fa (2/43), 0.95348835 = 0x3f7417d0):
```
load   = dailyLoad[day] ?? 0
ATL'   = prev.ATL*0.75 + load*0.25        (note: stores load*0.25 + prevATL*0.75)
CTL'   = load*0.046511628 + prev.CTL*0.95348835
out.dailyTrimp = load (present even when 0)
```
Missing day = load 0 (both decay). A day with zero load is the same as no workouts. No other gap handling.

Day list and initial state (`0x1015e9840`, `0x1015ec8e4`, `0x1015f0884`, `0x1015f166c`):
* Window normalisation (`0x1015e969c`): `S = startOfDay(calculationWindow.start)`, `E = startOfDay(calculationWindow.end)`; cache fetched for `[E - cumulativeMetricsLookbackDays d, ...]`.
* **Checkpoint path** (cache contains `startOfDay(S-1d)`): `prev = cache[S-1d]` (64-byte CumulativeMetrics), `dates = midnights m with S < m < E+1d`, i.e. `S+1 ... E` (enumerateDates is strictly after S). Day values from `workoutsByDay`, `strainMetrics`, `recoveryMetrics`. Results written into the cache dict and upserted (`batchSaveCumulativeMetrics`).
  The checkpoint path inside `calculateCumulativeMetricsFromCheckpoint` is the same with `A1 = startOfDay(currentDay - N days)` (N = `[x22+0x280]`), checkpoint `A0 = startOfDay(A1 - 1d)`, dates in `(A1, currentDay)`.
* **No checkpoint**: `0x1015f166c`: warm-up list `(startOfDay(S - 60d), S)` (dates strictly between, `0x3c` = 60 days) followed by window list `(S, window.end)`, starting from the zero state (ATL = CTL = 0, no target strain, empty impacts), then the dictionary is filtered by `date >= lo && date <= hi` (`0x1015ebd64`, closure `0x1015f1b54`).
* Flag (observed, not runtime-verified): both paths enumerate with `startingAfter: S`, so the calendar day `S` itself is never recomputed while the checkpoint is `S-1` and the seed window ends at `S-1` (see M17). The caller that supplies `calculationWindow.start` (Data loading manager) is not traced (hand-off B); if it passes `firstDay - 1` there is no gap.
* First usable day: after zero init `ATL_1 = 0.25*L1`, `CTL_1 = 0.0465*L1`. Calibration status below decides whether it is shown as calibrating.

### M07.03: optimal range and calibration: RESOLVED
Rolling support arrays (`0x1015ec8e4`/`0x1015e9840`, updated BEFORE the day's recurrence call so they include today):
* `active42`: Bool[] of `load > 5.0` for the last 42 days (`0x100009ea4`: `(5.0 < load)` ; when length before append >= 42 drop first), `N = count(true)`. Initial content from `0x10000a384`: dates in `(date-42d, date)` (`0x2a` = 42), loads from the dict.
* `loads28`: last 28 daily loads Float32 including today (`0x100009f8c`; drop first when length before append >= 28).
```
trainingDensity = min(1.0, N/28.0)                          (double)
recency (0x10000ad88(loads28)): n=count; if n<2: 0 else
     acc=0; for i in 0..<(n-1): ago=(n-2)-i; if loads28[i] > 5.0 && ago <= 15 { acc += 1 - 0.0625*ago }   // excludes the LAST element (today)
     recency = min(1.0, acc*0.25)
calibrationConfidence = min(trainingDensity, recency)           // fcsel mi
ctlMaturity = min(1.0, CTL/30.0)  (UI only, 0 when no cumulative entry)
```
LoadStatus enum: 0 calibrating, 1 detraining, 2 maintaining, 3 peaking, 4 productive, 5 fatigued, 6 overtraining. Day status (`0x1015efbc4` per workout pre/post; same code in the UI builder `0x10000ae0c`):
```
fallback = (recovery == nil || recovery >= 20.0) ? productive(4) : fatigued(5)      // recovery of the same day; fcmp s8,#20 mi => 5
if calibrationConfidence < 0.35 : calibrating (0)                  // 0x3fd6666666666666 ; fcmp d,d15 b.pl continues (NaN continues)
ratio = ATL/CTL ; if !finite -> 0
ctlTrend% = (mean(A) - mean(B)) / mean(B) * 100  (Float32; A = last 5 CTL values incl. today, B = the 5 before A; nil/missing skipped; either mean nil => no trend)
if trend present:
    trend >  5 : ratio > 1.0 ? gate : peaking(3)
    trend < -5 : ratio > 1.0 ? gate : detraining(1)
    else       : ratio <= 1.0 ? maintaining(2) : gate
else           : ratio <= 1.0 ? maintaining(2) : gate
gate = ratio > 1.4 (double compare of the Float ratio; 0x3ff6666666666666) ? overtraining(6) : fallback
```
CTL windows: in the writer (`0x1015efbc4`) A and B are date windows from `0x10000bb44(day, ctlByDate)`: A = values with `day-5d < d <= day`, B = values with `day-10d < d <= day-5d` (`LeftOpenDateInterval`, `0x1030cbe4c` with 5); the CTL dict entry for `day` is first set to this day's CTL (and for per-workout status to pre/post workout CTL). In the UI builder (`0x10000ae0c`) the same windows are count queues of 5 (`0x10000aa78`): push CTL (nil if no entry) into A; when A has 5 elements pop the oldest non-nil into B; B capped at 5.
Per workout impact (`workoutImpacts[workoutId] = CardioLoadImpact{prevAtl, postAtl, preStatus, postStatus}`), workouts sorted by startDate ascending (`0x1015e8ac0` insertion/merge sort on Date witness +0x10), cum = 0:
```
for w in sorted: x = w.trimp ?? 0
   ATLpre = prevATL*0.75 + cum*0.25 ; CTLpre = prevCTL*0.9535 + cum*0.0465
   ATLpost= prevATL*0.75 + (cum+x)*0.25 ; CTLpost = prevCTL*0.9535 + (cum+x)*0.0465
   preStatus  = status(ATLpre/CTLpre ,  CTL window with CTLpre)
   postStatus = status(ATLpost/CTLpost, CTL window with CTLpost)
   impacts[w.id] = {prevAtl: ATLpre, postAtl: ATLpost, preStatus, postStatus} ; cum += x
```
(The calibration test is the same for pre and post. `local_140` fallback is computed once per day from recovery.)
Optimal range for the UI (`0x10000ae0c`, constants `0x104ebd360..0x104ebd378` = 0.7, 0.8, 1.3, 1.4): `CardioLoadData{atl, bufferRangeStart = 0.7*CTL, optimalATLRangeStart = 0.8*CTL, optimalATLRangeEnd = 1.3*CTL, bufferRangeEnd = 1.4*CTL, calibrationConfidence, ctlMaturity, trainingDensity, recency, dailyTrimp, status}` (doubles; atl/ctl Float widened). Data point is nil when no cumulative entry or when ATL/CTL non-finite. The UI iterates the sorted keys of the recovery dictionary. Agrees with F: ratio 1.0/1.4, CTL +-5%, 0.35, recovery < 20, alpha 0.25, 2/43.

### Corrections (M07)
* Earlier note: "exact input-load preprocessing not resolved": it is simply sum of per-workout Banister TRIMP per calendar day.
* Earlier note "ATL 7-day / CTL 42-day": alphas are 0.25 and 2/43 (Float32 0.046511628); EWMA seeds from zero/checkpoint.

---

## M17: Target Strain

### M17.01 + M17.02: date ordering, seed window, checkpoint replay: RESOLVED
Recurrence per computed day d (0x1015efbc4) with `history: [Float?]` (inout) carried across days:
```
if history.count >= 15 { history.removeFirst() }          // cmp x8,#0xf ; b.hs ; slices from index 1 (0x101848644)
B = fold(history)                                         // 0x1016e233c (below)
R = recoveryByDay[d] (Float?)                              // the SAME day's recovery
(low, high) = range(B, R)                                  // 0x1016e2394
out.targetStrain = (low, high)  // always present for computed days
history.append(strainByDay[d])  // Float? , nil when no strain entry (decays as 0)
```
Seed (`0x1015eecc0 constructInitialStrainWindow(for: S, strainMetrics)`, log tag `[TargetStrainWindow] seedWindow`): `D1 = startOfDay(S - 1d)`, window `(D1 - 14d, startOfDay(S) - 1s)`, midnights strictly inside => days `S-14 ... S-1` (14 values, oldest first), each = `strainMetrics[startOfDay(day)]` (nil if missing). First computed day uses exactly these 14 values; `S` = first day recomputed, checkpoint `cache[startOfDay(S-1)]`. After each day the day's own strain Float? is appended; the removal at 15 keeps 14 prior days. "Current-day exclusion": history never contains the day being computed. Reordered history: history is a plain array in chronological order; no sorting.
Date ordering of `dates`: ascending midnights (`enumerateDates` forward); the loop stores each result back into the cache dictionary keyed by date and uses it as `prev` for the next day. Replay = recompute from checkpoint forward; no reset except the no-checkpoint zero-state path (ATL=CTL=0, warm-up 60 days, empty history seeded for S).
Missing calendar days: a date with no strain entry contributes nil (counts as 0 in fold, still occupies a slot); a date missing from the cache is not "skipped": every midnight in the window is computed (load 0).

Kernels (re-verified from asm):
```ts
function fold(h: (Float|nil)[]): Float {            // 0x1016e233c, Float32
  if h.length == 0 return 0
  let B = h[0] ?? 0
  for v of h (including h[0] again): B = B*0.75 + (v ?? 0)*0.25      // fmul s0,s3; fmul s4,s2; fadd
  return B }
function range(B: Float, R: Float|nil) {            // 0x1016e2394
  const c = R == nil ? B : B * ( ((R - 50)/100)*0.6f + 1 )           // Float32: (R-50)/100, *0x3f19999a, +1, B*
  const r = Float(R ?? 50)/100                                       // Float32 divide then widened to Double
  let low  = c + Float(-5 - 5.0*Double(r))      ; let high = c + Float(10 + 20.0*Double(r))   // coefficient math in Double, narrowed
  low  = max(20, min(120, low)) ; high = max(40, min(120, high))     // v0=min(.,120) then floor (20,40) via fcmgt; NaN passes unchanged
  return (low, high) }
```
Example B=60: R=50 -> [52.5,80]; R=100 -> [68,108]; R=0 -> [37,52]; empty history & R nil -> [20,40].

### M17.03: upstream recovery and daily strain selection: RESOLVED to the data-source boundary
* strain for the history and for notification = `StrainMetrics.strainScore` (Float?) per day = output of `calculateDayStrainScore` (M02), stored in `metricMeasurements[.strainScore]`.
* recovery R = `RecoveryMetrics.recoveryScore` (Float?) of the SAME day (recoveryMetrics dictionary `[Date: Float?]` built by the recovery pipeline; keys are startOfDay dates). Not clipped. Previous-day revision: any change to strain/recovery for day d is picked up only when the window containing d is recalculated; days after the revision are replayed from checkpoint.
* Which days are present in the dictionaries and how existing vs recalculated strain are combined ("Combined existing and recalculated strain" `0x1017d7558`) is the data-loader/day framework (agent B, `HealthDataLoader.calculateHealthMetrics 0x1017d6700`).

### M17.04: presentation rounding and notifications: RESOLVED
* `roundedTargetStrainLow/High: Int?` (CoachingStrainDashboardPayload / CoachingTargetStrainReachedNotificationPayload) = `0x1030d5a84(low/high)` (half away from zero; nil for non-finite) from `cumulativeMetrics[startOfDay(now)].targetStrain` (`0x10196c7b4`).
* Target reached (TargetStrainNotificationScheduler.swift, `sendCoachingTargetStrainReachedNotification`, `maybeSendStrainReachedNotificationFromMetrics(recalculatedHistory:cumulativeMetrics:targetStrainBounds:)`):
  ```
  todayStrain = 0x1015dcfb0(history sorted, startOfDay(now))   // entry whose startOfDay(dayEnd) == startOfDay(now)
  send iff bounds present && todayStrain != nil && roundHalfAway(todayStrain) >= bounds.lowThreshold   // frinta ; fcmp ; b.ge at 0x10196c0dc-0x10196c0e4
  ```
  then gated by the setting (`notifications.target_strain_reached`) and once-per-day record (`hasNotificationBeenSentToday`, `recordStrainReachedNotificationSent`, key `localNotifications.targetStrainReachedKey`); chooses coaching-service message (payload with rounded low/high + `StrainPerformance` status) or a hardcoded message. Upper bound is not part of the trigger.
* Range status in Strain Performance (`0x10083fb88`): "Above range" if `value > high` (`fcmp s1,s0; b.pl`), "Below range" if `value < low`, else in range (inclusive).

### M17.05: nonfinite and overflow outside the kernel: RESOLVED
The kernel and fold do no sanitization (NaN/inf propagate; clamps via `fcmgt` pass NaN). Around it: day load non-finite is not sanitized; `ratio = ATL/CTL` non-finite -> 0; TRIMP source already sets non-finite to 0; CardioLoad UI data point is nil if ATL or CTL non-finite (`0x10000b48c`); `0x1030d5a84` returns nil for non-finite and traps only beyond Int64 (unreachable for strain values); target reached check with NaN fails (`b.ge`).

### Corrections (M17)
* Earlier: seed "exact endpoints unknown": seed = 14 daily values `S-14..S-1`, midnights strictly inside `(startOfDay(S-1)-14d, startOfDay(S)-1s)`.
* Earlier: "recovery role anchored only by parameter order": the dictionary lookup is `recoveryByDay[d]` (Float?) at `0x1015efe94-0x1015eff1c`, same day as the target.
* Count>=15 removal confirmed as `removeFirst` before computing.

---

## M18: Heart Rate Recovery

### Call graph
```
WorkoutScoreService.calculateScoresForWorkout 0x100f5a644 -> WorkoutOverlayScores build 0x1017c3870
   HR fetch: WorkoutHeartRatesFetcher (HealthKit/Garmin/Oura/demo) window = TimeWindow[start, activeEnd+2min]  (0x1017a2324)
   slicing 0x1017bd610 -> WorkoutHeartRates{recoveryHRSamples, workoutHRSamples}
   activeWorkoutEnd 0x1017cced0 ; zone-4 gate 0x1017ce0e0 ; service 0x1017cd18c ; selector 0x1017cdb20
   result -> HeartRateRecoveryPayload{heartRateRecovery, recoveryStartHeartRate, recoveryEndHeartRate: Double}
UI: HeartRateRecoveryDetailViewModel 0x100e1df30 -> daily points 0x100e25788 -> buckets 0x100e26af8 ; status ranges 0x1017ce234/0x1017ce2b0
```

### M18.01: upstream sample window and ordering: RESOLVED
`TimeWindow` = `[workout.start, activeWorkoutEnd + 2 minutes]` (`0x1017a2324`: `1030cbe70(...,2)` = +2 min). After the fetch the samples are a merged, source-arbitrated list (4-way merge by startDate ascending `0x101664460`; `0x1015b3954` arbitration, dataType 2), mapped to `HealthQuantitySample`. `0x1017bd610(samples, start, end, pauses)`:
```
activeEnd = 0x1017cced0(end, pauses)
recoveryHRSamples = samples[ first start >= workout.start ..< first start >= activeEnd+2min ]   // asm >=,>= (0x1017bd7e0, 0x1017bd874)
workoutHRSamples  = samples[ first start >= workout.start ..< first start >= workout.end ]       // used for strain units/TRIMP
```
Binary searches assume ascending order; the selector itself never sorts. Multiple workouts: each workout is computed independently from its own slice.
Selector `0x1017cdb20(window: 120.0 (0x405e000000000000), points: [(hr: Double, date)], activeWorkoutEnd)`; points are `(sample.doubleValue, sample.startDate)` in slice order (`0x1017cd18c`). Verified conditions (condition codes):
```ts
if points.count < 2 || !(120.0 > 0) return nil      // cmp x21,#2 b.lo ; fcmp d8,#0 b.le
t[i] = timeIntervalSinceReferenceDate(points[i].date)
best = +Double.greatestFiniteMagnitude (0x7fefffffffffffff); bestJ = bestK = -1; deque = []   // indices; hr strictly decreasing from front
for j in 0..<n:
   // evict from front while the front fails:  (120.0 >= t[j]-t[front]  [pl: also true for NaN diff]) && (activeEnd >= t[front])
   while !deque.isEmpty && !(120.0 >= t[j]-t[deque.front] && activeEnd >= t[deque.front]) { deque.popFront() }   // fcmp d8,d1 ; fccmp d9,d0,#8,pl ; b.pl
   if !deque.isEmpty { k = deque.front ; delta = hr[j] - hr[k] ; if delta < best { best = delta; bestJ=j; bestK=k } }   // strict <, NaN skipped
   if !(t[j] > activeEnd) {                        // fcmp d12,d9 ; b.hi skips insertion (NaN also skips)
        while !deque.isEmpty && hr[deque.back] <= hr[j] { deque.popBack() }                // fcmp ; b.ls pops ties
        deque.pushBack(j) } }
return bestK < 0 ? nil : (best, points[bestK], points[bestJ])
```
So: the earlier point k must satisfy `t_k <= activeEnd` (inclusive); the later point j may be anywhere within 120 s (`t_j - t_k <= 120`, inclusive) even after the workout end, or inside the workout. It is a max-drop within any 120 s window anchored at or before the active end, not a fixed +2 min measurement. Ties: equal HR earlier points are popped by the later equal (latest equal-max point is k); equal best deltas keep the first j (strict `<`). Increasing HR gives negative drops.

### M18.02: zone-four eligibility and activeWorkoutEnd: RESOLVED
* `activeWorkoutEnd` (`0x1017cced0(out, workoutEnd, pauses)`, 1017c.c:4365): if `pauses` is non-empty and `pauses.last.endTime >= workoutEnd` (asm `0x1017ccf8c bl 0x104e57d84` = `Comparable.>=`; Ghidra prints it as `>`) then `pauses.last.startTime` else `workoutEnd`. Only the LAST element of the pause array is considered (so a trailing pause that reaches the workout end is excluded from the active period).
* Gate (`0x1017ce0e0`): `maxHR = max over recoveryHRSamples.doubleValue` (empty -> false); `zoneIndex = 0x1015d96f8(Float(maxHR), zoneSettings)`; eligible iff `(zoneIndex & 0xfc) != 0` i.e. zone 4 or 5 (i.e. `Float(maxHR) >= zone4.bpmLowest`, or NaN/negative/over-range which map to zone 5). Max is over ALL recovery slice samples (workout + 2 min tail), not only the workout.
* Result (`0x1017c3870` at `0x1017c39a0-0x1017c39f8`): samples empty -> `noData`; not eligible -> `zoneFourNotReached`; service result nil or `hrr < 0` (asm `b.ge`; NaN fails) -> `noData`; else `data`.
Zone settings are the ones in `WorkoutOverlayScoresBuildDependencies.zoneSettings` (settings in effect for that workout; builder = WorkoutDependencyContext).

### M18.03: HR point source, units and cadence: RESOLVED (ingestion in hand-off A)
Points are raw HealthKit/Garmin/Oura/demo HR samples (`HealthQuantityType.heartRate`-like, unit `countPerMinute`, bpm used as is, no unit conversion), NOT `heartRateMinuteAggregates`. Cadence = native sample cadence (whatever the sensor/watch writes). Timestamps = `sample.startDate`. Duplicates across sources are resolved by `0x1015b3954` (source preference) before slicing. Unordered input would break the binary search; the merge keeps ascending.

### M18.04: ties and NaN across the full pipeline: RESOLVED
* Selector ties as above. NaN hr[j]: delta NaN skipped; NaN is pushed to the deque (`fcmp` unordered => not `ls`, so nothing pops it) and, if at the front, makes every later delta NaN until it is evicted by the 120 s / activeEnd tests. NaN time: never inserted, evicts nothing incorrectly (the tests are NaN-permissive: `pl`).
* Service: after the selector, `DateInterval(start: k.date, end: j.date)` via failable init `0x100c00624`; if `j.date < k.date` (unordered input) it logs "Error calculating HRR Recovery Window ..." and returns nil -> `noData`.
* `hrr = -Float(delta)` (`fcvt s0,d10 ; fneg`), `recoveryStartHeartRate = Float(hr_k)`, `recoveryEndHeartRate = Float(hr_j)`; `details.points` = `MetricDataPoint(timestamp: sample.startDate, value: Float(doubleValue))` for the slice samples with `k.date <= date <= j.date` (DateInterval.contains inclusive), in input order. `0x1017c3f4c` is a no-op release. Payload fields are widened to Double.
* Gate: `hrr >= 0` else `noData`; no clipping of large drops.

### M18.05: aggregation and presentation: RESOLVED
* Benchmark ranges depend on age (`0x1017ce234(age)`, static arrays of `HrRecoveryRange{rangeStart, rangeEnd?, status, rangeType}` at 0x1060c4818...), age = whole years between profile DOB and now (`0x101f354e4`; default 40 if profile/DOB missing). Classification `0x1017ce2b0`: first range with `start <= v && (end == nil || v < end)` (array order); no match (negative/NaN) -> nil.
  ```
  <30 (and negative/unknown): Poor[0,15) Fair[15,32) Good[32,40) Excellent[40,49) Superior[49,inf)
  30-39: [0,15) [15,31) [31,40) [40,48) [48,inf)
  40-49: [0,14) [14,31) [30.5,39) [39,47) [47,inf)       // Good starts at 30.5 and is shadowed by Fair on [30.5,31)
  50-59: [0,13) [13,29) [29,37) [37,45) [45,inf)
  60-69: [0,11) [11,26) [26,33) [33,41) [41,inf)
  >=70 : [0,8)  [8,22)  [22,30) [30,37) [37,inf)
  ```
* Workout detail card (`0x101f2c524`/`0x101f2c848`): value = `points.last.value - points.first.value` (<= 0 normally); `drop = value > 0 ? 0 : abs(value)`; status = range lookup on `drop`.
* Trend/detail charts (`0x100e25788` per day bucket `[d, d+1)`): `I = [bucket.start - 6d, bucket.end)` (`0x1030cbe4c` with 6 = -6 days); candidate workouts = those whose `dateInterval.start` is in `I` (`I.start <= start < I.end`, asm `<=`, `Date.<`) and that have an HRR payload; **value = HRR (Float(payload.hrr)) of the latest workout (max start) in the trailing 7 days**; `containsWorkouts` = any workout in the bucket day itself (`start` in `[bucket.start, bucket.end)`); status = range lookup of the value. No bucket workouts or no HRR -> value nil, status nil.
* Aggregation types `day, threeDay, sixDay, twelveDay, week, month` (`0x100e26af8`): value = mean (Float32 sum / count) of the non-nil day values in the bucket, status = range lookup of the mean, nil if none. `currentPeriodAverage`/`previousPeriodAverage` (`0x100e272b0`): mean of `payload.hrr` over ALL workouts (activity filter applied by `0x100d88bb8`: individual / aggregated(set) / all) whose start is in the period `[start, end)`; nil if none. Lookback periods: 7d, 14d, 30d, 3m, 6m, 1y, YTD.
* Presentation labels: Poor, Fair, Good, Excellent, Superior (`0x1017cca08`).

### Corrections (M18)
* Earlier "later point not required after workout end; not +2 min": confirmed.
* Earlier "zone-four eligibility, activeWorkoutEnd unresolved": resolved above.
* Earlier "points wholly before vs spanning vs after": pair needs only `t_k <= activeEnd`; `t_j` unrestricted except `t_j - t_k <= 120` and the fetch slice `[start, activeEnd+2min)`.

---

## New discoveries (outside the listed tasks)
* **Zone settings derivation** (`0x10191a390(settings, packed(maxHR, rest), custom dict, method)`; each lower bound = `ceil(round1(maxHR*p))` where `round1 = 0x1030d6870` and `ceil` = `frintp`; Float32 constants 0.5, 0.6 (0x3f19999a), 0.7 (0x3f333333), 0.8 (0x3f4ccccd), 0.9 (0x3f666666)):
  method maxHR: z1..z5 = ceil(round1(maxHR*{.5,.6,.7,.8,.9})); hrReserve (Karvonen): ceil(round1((maxHR-rest)*p + rest)); lactateThreshold: ceil(round1(LTHR*{0.5,0.85,0.9,0.95})) and zone5 = ceil(round1(LTHR)) (maxHR = packed second value); manual: values from the custom dictionary keyed 1..5 with defaults 100,120,140,160,180. Default settings maxHR 195.
* Workout muscular unit function and its set-effort rule (above).
* Day strain `metricMeasurements` written by getWorkoutMetrics: exerciseMinutes(19)=sum(RecordedWorkoutSummary.metrics.exerciseDuration)/60, cardioMinutes(20) = same sum over workouts excluding a fixed set of activity types, activeCaloriesBurned(21)/totalCalories(22) from energy keys, steps(25)=stepsDisplay, zone2Minutes(26)=zoneSeconds[2]/60, zone2and3(27), zone4and5(28), strengthTrainingMinutes(29), daytimeHeartRate(5). Zone seconds = stored workout `strainZones` (durationMinutes*60) + exercise-window zones; strainZoneMetric percentage = zoneSeconds/total*100 (`0x1015da5e0`).
* Strain/Target "StrainPerformance" statuses (above/in/below, inclusive).

## Hand-offs
* **A (ingestion)**: how `heartRateMinuteAggregates` and stage tagging (`SampleContextType` 2/4/5 etc.) are produced; `exerciseSegments` source (`ExerciseFetcher/HKExerciseFetcher`); steps source arbitration (`0x1015b48ac`, category table `DAT_104f98278`: steps -> 8; HR slices for HRR -> dataType 2 via `0x1015b3954`); WorkoutHeartRatesFetcher HealthKit/Garmin/Oura query predicates (`0x1017bdf3c`, async lets `0x101228458/0x1012284bc/0x101228520`, HK fetch `0x101676ea0`).
* **B (day framework)**: FunctionalDay boundaries, `HealthDataLoader.calculateHealthMetrics 0x1017d6700` and `calculateStrainHistory`; construction of `strainMetrics`/`recoveryMetrics` dictionaries; who passes `calculationWindow` to the cumulative service (off-by-one question about day `S`); `baselineRestingHeartRate` for TRIMP; HeartRateZonesService history entries.
* **F (Muscular/Bio age)**: workout `muscularStrainUnits`/`cardioStrainUnits` exact production above; day muscular load in CumulativeMetrics uses `0x10008b9d0` (sum) and `0x100085b1c` (muscle breakdown); their ATL/CTL-like pair uses the same 0.25 and 0.046511628 coefficients (`0x1015f0700-0x1015f0740`); per-sport effort byte table `DAT_104f5d9e0` = Double(index) in `0x100f4f5d8`.
