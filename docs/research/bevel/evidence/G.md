# Findings G: Food Glucose (M10), Food Quality (M11), Daily Nutrition Score (M12), TDEE (M13)

Conventions: addresses are unslid VAs. Helper scripts and the full disassembly I used are in `/Users/adityajindal/bevel-re/work/G/` (`fn.sh`, `asm.sh`, `nm2.py`, `rd.py`; `text.asm` is `otool -tV` of the binary).
Boundary comparisons were re-checked against the stub symbol or the condition code, not the Ghidra label (`geoi` is `>=`, `leoi` is `<=`, `Date.loi` is `<`, `b.pl` after `fcmp` is `>=`, `b.hi` is `>`).

## 0. Shared architecture recovered (needed by all four families)

Entry: `calculateMetrics(currentDay:lookbackDays:inputs:activityContext:macronutrientsGoalConfigurations:totalDailyEnergyExpenditure:syncedNutrientTotals:settings:dataSources:cgmRepository:)`, file `Superset/NutritionCalculator.swift`, implemented by `FUN_10008f1a4` (18 KB). Caller `FUN_1016bef30` logs "Nutrition Metrics - Calculate nutrition metrics by day" and "Merge metrics and cache results".

Types (Swift reflection, `work/G/nm2.py`):
- `FoodLog {id, imageUrl, title, analysisSessionId, loggedAt: Date, compoundFood, numServings: Double, relativePortion, nutritionScores?}` (descriptor 0x1051ff21c). `loggedAt` is the food time.
- `GlucoseDataPoint {timestamp: Date, valueInMgDl: Float32?}` (0x1051fec48). The internal glucose unit is mg/dL, Float32, optional.
- `FoodGlucoseScores {glucoseScore: Double?, glucoseContributors: [GlucoseContributor: Double?], glucoseMetrics: [GlucoseContributor: Double?], glucoseBaselines: [GlucoseContributor: baseline?], glucoseScoreState}`.
  - `GlucoseScoreState` cases: waitingForData=0, baselinesCalibrating=1, complete=2.
  - `GlucoseContributor` cases: peak=0, exposure=1, delta=2.
- `FoodQualityScores {qualityContributors: [Contributor: FoodQualityContributorValue], preFoodQualityScore, postFoodQualityScore}`.
  - `FoodQualityContributorValue {thresholdPercentage, previousPercentage?, percentage, prevScore?, score, isCappedImpact, cumulativeValue}`; in memory this is a 0x48-byte record.
- `FoodNutritionScores {qualityScores, glucoseScores?}`.
- `PendingOrAvailableNutritionScore = pending(caloriesRemaining: Measurement<kcal>) | score(Double)`.
- `NutritionMetrics {nutritionScore, foodQualityScore, glucoseScore: Double?, aggregateQualityContributors, nutrients, metricMeasurements, foodScores}` (descriptor 0x1051fea44).
- `DayScoreCalorieConfiguration {dayCalorieGoal, dayScoreCalorieThreshold}` (both kcal Measurements).
- `ConnectedCGMState {device: ContinuousGlucoseMonitor, method}`.
  - `ContinuousGlucoseMonitor`: dexcomG6, dexcomG7, dexcomStelo, lingo, freestyleLibre2, freestyleLibre3, other.
  - Method enum (table at 0x1060c9f60): appleHealth=0, dexcomFollow=1, libreLinkUp=2, liveTracking=3.
  - Stored as a ushort (device in the low byte, method in the high byte). "Not connected" is a method byte of 4 or 5. The raw value is read as JSON from UserDefaults key `nutrition.connected_cgm` by `FUN_1000ad3b4`, which defaults to 0x500 (not connected) when missing. `FUN_10008f1a4` normalizes `(v & 0xfe00) == 0x400` to 0x400.
- `HealthQuantitySample {id, metadata, type, unit, doubleValue, startDate, endDate}` (0x105277e38).
- `HealthQuantityType` tag order (verified from reflection): 0 restingHeartRate, 1 hrv, 2 vo2Max, 3 respiratoryRate, 4 hrMinuteAggregates, 5 hrSamples, 6 restingEnergyBurned, 7 activeEnergyBurned, 8 restingEnergyBurnedDisplay, 9 activeEnergyBurnedDisplay, 10 energyBurnedDisplay, 11 energyConsumedDisplay, 12 protein, 13 carbs, 14 fat, 15 bloodGlucose, ...

Day loop in `FUN_10008f1a4`, for each day D:
- Foods of the day: `startOfDay(D) <= food.loggedAt < startOfDay(D+1 day) - 1 s`. Lower bound `geoi` at 0x100090420 and 0x100090558; upper bound `Date.<` at 0x100090434 and 0x100090570 (strict, so a log at 23:59:59 is dropped).
- Glucose readings of the day: same day window. The meal window in 3.1 is applied on top of this, so a late-evening meal cannot see readings after midnight.
- Foods are processed in chronological order. Calendar is `Calendar.current` (device time zone).
- Per food, the code computes quality (3.x), then glucose (`FUN_100101c00`, section 1), then cumulative contributors. After all foods it runs `FUN_100103bcc` (builds the per-food map) and `FUN_100104390` (day roll-up, section 4).

## 1. Food Glucose

### M10.01 — RESOLVED (connector gap: exact input contract)
Bevel needs only three things per day:
1. Timestamped glucose points. `HealthQuantitySample` for bloodGlucose (`doubleValue` in mg/dL, `startDate` as the timestamp). The baseline builder `FUN_100097bdc` copies `doubleValue` into `GlucoseDataPoint.valueInMgDl` with no unit check, via `(float)dVar35` (asm 0x100098xxx: `*(float*)(p+iVar3) = (float)dVar35; flag = 0`). The sample provider therefore must deliver mg/dL.
   - Only `startDate` is used. `endDate` is ignored.
   - A cadence of about 5 min (Dexcom, Libre) is assumed by nothing in the code. Any spacing works, but the exposure integral needs at least 2 points in the window.
2. Meal logs. `loggedAt` (Date) and the food `id`, plus the nutrient content for the quality side (section 3).
3. CGM connection state. `ConnectedCGMState?` (device and method) from the user setting. It controls the waiting time (section 1.4) and `glucoseDisabled` (the settings toggle, text "Incorporate glucose tracking into your overall nutrition score").

Pulse comparison: per the research notes, `src/server/sources/google/map.ts` keeps only a daily mean glucose. That is insufficient. Pulse would need the raw per-reading series (timestamp, mg/dL), the food-log timestamps, and the CGM method (method 0, Apple Health, adds a 3 h sync delay).

### M10.02 — RESOLVED (CGM/provider conversion)
- The internal unit is mg/dL (`valueInMgDl`). `GlucoseReading {value: Int, datetime}` is the raw CGM reading.
- There is no mmol/L to mg/dL conversion in the scoring path. Scores are computed in mg/dL.
- Display only: `FUN_1020202b0` converts with `fVar2 / 18.018` (Float32) when `GlucoseUnit == mmolL`. `GlucoseUnit` cases are mgDl and mmolL, chosen by `CustomizationViewModel.newGlucoseUnit`.
- HealthKit unit accessor `FUN_10310584c`: `HKUnit.gram(milli) / HKUnit.liter(deci)`, which is mg/dL. It is used to read and write HK blood-glucose samples. Writers: `FUN_101ba0650`, `FUN_101baf774`.
- Delta units follow the glucose units. The quantile key is `Int(trunc(delta))` in mg/dL (section 1.3).

### M10.03 — RESOLVED (zero q95, quantiles, delayed completion, observation gate)
Per-meal entry `FUN_100101c00(out, food, now, readings, baselines, connectedCGM: ushort, glucoseDisabled: Bool)`. Log text: "calculateGlucoseScore(for:currentTime:glucoseData:glucoseBaseline:connectedCGM:glucoseDisabled:)".

```
window = readings.filter(food.loggedAt <= t && t <= food.loggedAt + 2h)   // FUN_100101194 + 1030cb480: geoi then leoi, closed interval
if glucoseDisabled:                      // LAB_100101d30
    return {score nil, contributors {}, metrics {}, state complete(2)}
method = connectedCGM.methodByte; hasCGM = (method not in {4,5})
if hasCGM:
    wait = 2h + (method == appleHealth(0) ? 180 min : 0)
    if now < food.loggedAt + wait:       // Date.< strict (0x100101d18)
        return {score nil, empty, state waitingForData(0)}
// not connected: computes immediately, no waiting

peak     = max(window.valueInMgDl non-nil)                       // Float32, nil if none          1000975e0
exposure = trapz over non-nil points sorted by timestamp:
           sum((t[i]-t[i-1])/3600 * (v[i-1]+v[i]) * 0.5)         // Double, nil if < 2 points     100097790
delta    = Float32(last.value - first.value) in array order, nil if empty or either end nil   // 100097b4c
```

Contributors, from `FUN_1001014d8` (keys: peak 0xa, exposure 9, delta 0xb):
```
normalize(v, base):                       // 10010136c, all Float32
  nil if v nil or base nil
  z = -(Float(v) - base.mean) / base.sd
  f = z < -1 ? 0 : (min(z,1)*0.5 + 0.5) * 100
  nil if f is NaN/inf                     // sd == 0 and v == mean gives nil; sd == 0 and v > mean gives 0; v < mean gives 100
peakScore     = normalize(peak, baseline[peak])
exposureScore = normalize(exposure, baseline[exposure])
deltaScore    = deltaQuantile(delta, baseline[delta].histogram)
```

Delta quantile `FUN_100101400` (histogram built by `FUN_10183ba60` and `FUN_1014ddf08`):
```
nil if delta nil or histogram entries < 2
hist = sorted [(Int(trunc(deltaValue_k)), count)]          // keys are Int(Double): truncation toward zero, traps if non-finite
cum_i = running sum of (count_i / total)                   // Double accumulation, not count-cum/total
q95 = key of first entry with cum >= 0.95                  // asm: fcmp d0,0.95 ; b.lt continues the scan; so >= 0.95 stops
nil if no entry reaches 0.95
r = 100 - abs(delta / Double(q95)) * 100
clamp r to [0,100]: r < 0 gives 0; r > 100 gives 100
nil if result is NaN/inf
```
Zero q95: if q95 == 0 and delta != 0, delta/0 = inf, so r = -inf, which clamps to 0; the result is a valid 0 (not nil). If delta == 0 and q95 == 0, the quotient is NaN and the result is nil.

Score:
```
glucoseScore = mean of the non-nil contributor scores (peak, exposure, delta)   // 100101870, nil if none
```
State:
```
baselines == empty                             -> baselinesCalibrating(1)
for c in [peak, exposure, delta]:
    b = baselines[c]
    if b missing -> calibrating
    if b.histogram non-nil && Float(b.count) < 20.0 -> calibrating     // asm fcmp s9,s8; b.pl: count >= 20 passes
else complete(2)
```
The score is computed whether or not the state is complete; the state is metadata. Observation count means non-nil feature values among the baseline meals (one per meal), not days. The "19/20" case: count 19 gives calibrating, 20 gives complete.

Baseline record = (mean: Float32, sd: Float32, count: Float32, histogram) built by `FUN_10183b824`: mean = Σx/n, sd = sqrt(Σ(x-mean)²/n) (population SD), n = number of non-nil values. Built by `FUN_100097bdc` over foods with `windowStart <= loggedAt < windowEnd` (`geoi` plus `Date.<`) and the matching readings. For each food: `window()` then the 3 features. Features are pooled per contributor key.

### M10.04 — RESOLVED for attribution, HAND-OFF for baseline window length
- A meal belongs to the calendar day of `loggedAt` (section 0). The glucose readings for that meal are limited to the same day.
- Day glucose score G (`FUN_100104390` with `FUN_10183c390`): the weighted mean over foods that have a non-nil `glucoseScore`, with weight = that food's energy in kcal.
  - `G = Σ(score_i * kcal_i) / Σ kcal_i`, and G is nil if Σ kcal = 0 or there are no entries.
  - The state (waiting or calibrating) is not checked here.
- The day glucose score feeds the overall score (M12.01).
- The baseline window (`FunctionalDay {dayStart, dayEnd}` ranges, lookback, caching per day in `FUN_101589ec8`, `FUN_10158b508`) belongs to Agent B. See Hand-offs.

Corrections to earlier research: baseline normalizer is Float32 and returns nil on NaN; delta is a quantile of a truncated-integer histogram with an accumulated-division cumulative; the 20-observation gate is per contributor and is inclusive; the post-meal wait is 2 h (5 h for Apple Health), not a fixed 2 h; the window is closed [t, t+2h].

## 2. (reserved: shared items listed in section 0)

## 3. Food Quality

### Contributor table (re-verified from bytes, `FUN_1000aa3a0` and `FUN_10010353c` constants at 0x104ec51b0-0x104ec5218)
Contributor order (`DAT_10602a6a8`): 0 vegetables, 1 fruit, 2 wholeGrains, 3 nutsSeedsLegumes, 4 fishSeafood, 5 healthyOilUse, 6 redMeat, 7 processedMeat, 8 excessSugar, 9 excessSodium, 10 alcohol.

| # | Basis | Lower | Upper | Weight | Categories (FoodCategory index: weight) |
|---|---|---|---|---|---|
| 0 vegetables | kcal fraction | 0 | 0.10 | +10 | wholeVegetables(2):1.0 |
| 1 fruit | kcal fraction | 0 | 0.06 | +10 | wholeFruit(0):1.0 |
| 2 wholeGrains | kcal fraction | 0 | 0.05 | +10 | wholeGrains(5):1.0 |
| 3 nutsSeedsLegumes | kcal fraction | 0 | 0.06 | +10 | nuts(9):1, seeds(11):1, legumes(10):1, healthyNutsSeeds(8):1, omega3NutsSeeds(7):0.5 |
| 4 fishSeafood | fraction or binary | 0 | 0.03 | +10 | fattyFish(18):1, egg(21):0.1, soy(12):0.5, omega3NutsSeeds(7):0.5, leanFish(19):0.05, shellfish(20):0.1; binary list: omega3Supplement(33) |
| 5 healthyOilUse | kcal fraction | 0 | 0.07 | +10 | healthyOils(22):1 |
| 6 redMeat | kcal fraction | 0 | 0.09 | -5 | redMeat(13):1, processedRedMeat(17):1 |
| 7 processedMeat | kcal fraction | 0 | 0.05 | -10 | processedMeat(15):1, processedPoultry(16):1 |
| 8 excessSugar | sugar kcal fraction | 0.05 | 0.10 | -10 | nutrient sugar; grams * 4 kcal |
| 9 excessSodium | mass, grams | 1.5 | 2.3 | -5 | nutrient 0x1c |
| 10 alcohol | mass, grams | 0 | 14 | -10 | nutrient 0x29 |

Overlap: the same category may appear in more than one contributor with a weight (omega3NutsSeeds counts 0.5 toward both nuts and fish; processedRedMeat counts toward red meat only; processedPoultry toward processed meat only). Category index to name table at 0x10602c010 (35 entries: wholeFruit, refinedFruit, wholeVegetables, refinedVegetables, starchyVegetables, wholeGrains, refinedGrains, omega3NutsSeeds, healthyNutsSeeds, nuts, legumes, seeds, soy, redMeat, poultry, processedMeat, processedPoultry, processedRedMeat, fattyFish, leanFish, shellfish, egg, healthyOils, unhealthyOils, butter, margarine, dairy, milk, cheese, plantBasedMilk, sugar, snack, artificialSweetener, omega3Supplement, other).

### M11.01 — RESOLVED (connector gap: required inputs)
Per food Bevel needs `compoundFood` nutrient data with `FoodCategory` assignment (the 35-way category per component), energy in kcal, `numServings`, `relativePortion`, plus sugar (g), sodium (any mass unit; converted with `Measurement.converted(to: grams)`) and alcohol (g). Sodium 1.5-2.3 g equals 1500-2300 mg. The sugar kcal factor is 4 per g. In the nutrient path the per-nutrient factors are 4 kcal/g for the mask 0x21000821, 9 for fats (mask 0x84440400), 7 for alcohol (0x29) at `FUN_1000a76a0`. Pulse's Google map keeps only calorie rollups, so it lacks category, sugar, sodium and alcohol detail.

### M11.02 — RESOLVED (disabled-contributor exclusion set)
`FUN_10010353c(contributorDict, excludedSet)`:
```
score = 50
for c in excludedSet: if config(c) is positive (tags 0,1): score += weight(c) (= +10); negatives add 0
dict.removeKeys(excludedSet)
score += sum(entry.score for remaining)         // entry.score at +0x30
return clamp(score, 1, 100)                     // asm: score < 1 gives 1, score > 100 gives 100
```
The set comes from the persisted setting `disabledFoodQualityContributors` (published property read through key paths on the settings object, `param_11`), passed as `local_7a0`. All 11 disabled gives 50 + 60 = 100 before the clamp.

### M11.03 — RESOLVED (category overlap, zero intake, all evaluator branches walked in assembly)
Per contributor type (`FoodQualityContributorType`): adderCaloricPercentageOrBinary (fish, tag 0), adderCaloricPercentage (tag 1), detractorCaloricPercentage (tag 2), detractorCaloricBasedMass (sugar, tag 3), detractorMass (sodium, alcohol, tag 4). Evaluators: `FUN_1000a6e44` (tags 0-2), `FUN_1000a76a0` (tag 3), `FUN_1000a7d5c` (tag 4). All three output a 0x48-byte `FoodQualityContributorValue`: +0x00 threshold-percentage, +0x08 previousPercentage, +0x18 percentage, +0x20 prevScore, +0x30 score, +0x38 isCappedImpact, +0x40 cumulativeValue. "prev" is the same contributor's record after the previous food of the day (nil dict gives 0).

Tags 0-2 (`FUN_1000a6e44`, asm 0x1000a7360-0x1000a7598):
```
catKcal   = sum_{(cat,w)} w * dayCumulativeKcal[cat]            // cumulative through this food
foodKcal  = this food's category kcal (d12)
p         = catKcal / dayCumulativeTotalKcal                     // fdiv d15 = d13/d11 at 0x1000a7450, no zero guard
percentage = p/upper if >= 0 else 0 (fcmp d0,#0; fcsel ..ge); then fminnm(.,1.0)   // NaN -> 0
t         = (p - lower) / (upper - lower)
t < 0 or NaN (b.ge not taken)  -> score = weight*0 = 0
t >= 1 (fcmp d0,d1 ; b.pl)     -> score = weight
else                           -> score = weight * t
isCappedImpact = (foodKcal > 0 [fcmp d12,#0; b.gt]) && (prevScore == weight)   // exact equality, fcmp d14,d8 ; cset eq
cumulativeValue = catKcal
fish binary (tag 0): if the cumulative category dictionary has ANY entry for omega3Supplement(33) (key presence, kcal value irrelevant), p is forced to `upper`: percentage 1.0, t = 1, score = +10.
```
Tag 3 sugar (`FUN_1000a76a0`, asm 0x1000a7a58-0x1000a7ac0): `nutrientKcal = grams*4` (generic factors: 4 default, 9 for fat masks 0x84440400, 7 for alcohol 0x29); `p = (nutrientKcal + prev.cumulativeValue(+0x40)) / dayTotalKcal`; if p is non-finite (abs bits >= 0x7ff0000000000000, `fcsel ... lt`) p = prev.percentage (+0x18); same t, percentage and clamp rules as above with lower 0.05, upper 0.10, weight -10 (so t >= 1 gives -10); isCapped = (this food's nutrient kcal > 0 [b.gt]) && prevScore == weight; cumulativeValue = nutrientKcal + prev cumulative.

Tags 4 sodium/alcohol (`FUN_1000a7d5c`, asm 0x1000a7e50-0x1000a80d8) — walked in full:
```
mass      = this food's nutrient amount converted to grams (Measurement.converted(to: NSUnitMass grams))   // 0x1000a7e7c
lower, upper = threshold Measurements converted to grams (sodium 1.5/2.3, alcohol 0/14)
cum       = mass + prev.cumulativeValue(+0x40) (0 if no prev)                  // fadd d12 = d10 + d12 at 0x1000a7fd0
t         = (cum - lower) / (upper - lower)                                  // fsub/fdiv 0x1000a7fd4-fdc
t'        = (t >= 0) ? fminnm(t, 1.0) : 0                                    // fcmp d0,#0 ; fcsel ge ; NaN -> 0
score     = weight * t'                                                      // weight -5 sodium, -10 alcohol
percentage = clamp(cum/upper, 0, 1)  (fcmp d0,#0 ; fcsel ge ; fminnm 1.0)
isCappedImpact = (mass > 0 [fcmp d10,#0 ; b.le -> false]) && (prevScore == weight)   // exact equality
cumulativeValue = cum
```
A special `nutrient == 0xa` case (calls `FUN_1000a7b80`, zeroes mass when it returns false) is never taken for the sodium (0x1c) and alcohol (0x29) contributors.
Zero intake: 0/0 gives NaN for tags 0-3, which falls to score 0 and percentage 0; mass contributors with 0 g give t' = 0 (or negative lower side clamps to 0).

Boundary audit (item 2, all checked against condition codes / stubs):
- `t < 0 -> 0` (b.ge falls through on NaN, values equal 0 are inclusive and score 0 anyway); `t >= 1 -> full weight` (`b.pl`, i.e. >= 1); scores are continuous, so these equalities change nothing numerically.
- Percentage clamp `>= 0` and `min(.,1)`; `fminnm` returns the non-NaN operand.
- isCapped uses strict `> 0` for the food's own kcal/mass and exact `==` for prevScore vs weight.
- Aggregate clamp in `FUN_10010353c`: `fcmp ... 100.0` then `1.0 <= score` test: `score < 1 -> 1`, `score > 100 -> 100`, equality passes through.

## 4. Daily Nutrition Score

### M12.01 — RESOLVED (overall equation) — assembly 0x100104a18-0x100104a38 in `FUN_100104390`
```
Q = FUN_10010353c(lastFoodOfDay.qualityScores.qualityContributors, disabledSet)   // clamp [1,100]; empty day gives clamp(50 + disabled positives)
G = kcalWeightedMean(foods with non-nil glucoseScore)                              // or nil
overall = (G == nil) ? Q : (Q + 0.0 + G) * 0.5          // fcsel d0, d8, d0, eq
```
`FUN_100104390` returns d0 = overall, d1 = Q, x0 = G (with nil flag). Dispatcher then builds `nutritionScore` from d0 and `foodQualityScore` from d1.

### M12.02 — RESOLVED (calorie and food-input gating; goal source precedence proven)
```
goal = FUN_100093994(configGoal, tdee)      // asm 0x100093a84-0x100093b8c
     = configGoal if present                 // first test (x0), b.ne -> copy config
       else tdee if present                  // second test (x1)
       else 2000 kcal (0x409f400000000000)
threshold = goal * 0.3                       // 0x3fd3333333333333, asm 0x100091814
consumed  = sum of the day's food kcal
if consumed >= threshold:                    // geoi (>=), asm 0x1000927c8 / 0x1000928ac
    nutritionScore = .score(overall) ; foodQualityScore = .score(Q)
else:
    both = .pending(caloriesRemaining = threshold - consumed)
```
Evidence for the precedence (config wins over TDEE): call site `0x100091800-0x100091804` is `bl 100093994` with x0 = local buffer `[x19+0x210]` and x1 = `[x19+0x80]`. `[x19+0x80]` is the 9th argument of `FUN_10008f1a4` (stack arg `[x29+0x10]`, stored at 0x100090230) and has type Optional<Measurement<UnitEnergy>>, which is the TDEE argument. `[x19+0x210]` is a local Optional<Measurement<kcal>> buffer (allocated at 0x10008f910) filled from the day's selected macronutrient goal configuration record. Inside `FUN_100093994`, the x0 operand is tested first (`getEnumTagSinglePayload == 1` means nil); only when it is nil is x1 tested; when both are nil the constant 2000 is stored. Glucose absent gives overall = Q (M12.01).
Remaining sub-point: which configuration record is "effective" for a day is chosen by date comparisons over the 0x170-byte records (0x100090458-0x100090890 loop); I did not re-derive its tie behaviour beyond this (handed to Agent B with the baseline/day framework).

### M12.03 — RESOLVED (connector gap)
Required per day: food logs with `loggedAt`, per-food energy (kcal), the nutrient and category details of M11.01, optional glucose points (M10.01), and a calorie goal or TDEE. Without calories logged the score stays pending. Pulse needs a food-log source (timestamps, per-item kcal, category/sugar/sodium/alcohol) rather than daily calorie rollups.

## 5. TDEE

### Final composition (verified, `FUN_1001129a0`, asm 0x1001129a0-0x100112a5c)
```
B = FUN_10198fd0c(profile)        // nil/missing -> TDEE = 2500 (not rounded)
E = FUN_10198f484(dict)           // mean daily active energy
X = FUN_1019901c4(dict)           // thermic term
if B missing: 2500
elif E missing: roundAway(B * 1.4)
elif X missing: roundAway((B+E) + 0.1*(B+E))      // 0.1 = 0x104ebf1b0
else: roundAway(B + E + X)                          // FRINTA, ties away from zero
```
Persisted as Float32 under UserDefaults key `nutrition.tdee_value` (store key 0xc). `FUN_10011215c` returns the stored value as Measurement kcal if present; compute only runs when the stored value is nil. A manually edited TDEE (EditTDEEView) lives in the same key; "Reset to auto-calculated TDEE" clears it.

### M13.01 — RESOLVED (outer history and per-day sum)
- History window (`FUN_1016afe1c/afebc`): `from = startOfDay(now - 30 days)` (`FUN_1030cbe4c` negates 30), `to = now`; the provider widens it to `[startOfDay(from), startOfDay(to + 1 day) - 1 s]` (`FUN_10166cff0`: `cbe40`, `cbe94`), interval = DateComponents(day: 1).
- Types fetched: [12, 13, 14] merged with [9] (static arrays 0x1060bc178 and 0x1060bc1a0), one child task per type with a 300 s timeout.
- Day buckets come from an `HKStatisticsCollectionQuery`-style fetch in `HealthKitManager` (`FUN_10182b9bc`, descriptor init at 0x10182bbb8). For types 11-14 (`energyConsumed`, protein, carbs, fat) the bucket value is the sum over sources of `sumQuantityForSource`; other types use `sumQuantity`. Each bucket becomes a synthetic `HKQuantitySample(start, end)`; buckets with a nil sum are skipped (`FUN_10182c878`).
- Energy E: samples of key 9, grouped by calendar day of `startDate` (`FUN_1030f801c` with `isDate(inSameDayAs:)`), summed per day in `HKUnit.largeCalorie` (kcal) (`FUN_10198f680`), then `mean`.
- Macros X: per-element `doubleValue(for: gram)` of keys 13, 12, 14 (carbs, protein, fat), then `mean`.
- `mean` (`FUN_101990000`, coverage constant 0.8 at 0x104ebe868): drops NaN/inf and exact zeros (both signs; subnormals kept), `coverage = accepted/supplied`; nil if `coverage < 0.8` (asm: `fcmp d8,d0; b.hi` rejects 0.8 > coverage; so exactly 0.8 passes) or accepted == 0; else sum/accepted. Negative values are kept.
- Coverage denominator is the number of supplied buckets (days with data), not 30 calendar days.
- X = 0.25*(4*protein) + 0.07*(4*carbs) + 0.03*(9*fat) with the Float32 4/4/9 multiply before the Double 0.25/0.07/0.03.
- Sub-boundary: HKStatisticsOptions for the collection query and the `Published` provider selected at runtime are set by upstream code I did not trace.

### M13.02 — RESOLVED (profile weight source and default)
Profile source is `CachedUserAttributesProvider` (class at 0x106430e90) caching a `SharedUserProfile {birthday?, heightInchesDecimal?, weightLbs?, biologicalSex?, fallbackSex?}` JSON in UserDefaults key 0xd, via the async method at 0x1001133e0 (cache hit, else default). Weight = `Measurement(weightLbs, pounds)`, height = `Measurement(heightInchesDecimal, inches)` (`FUN_10310dfb8`, `FUN_10310deec`). Default profile (`FUN_10310e370`): birthday, height, weight all nil, `biologicalSex` = notSet(3), `fallbackSex` = 2. Any missing weight/height/birthday gives a nil `BMRAttributes`, so B is missing and TDEE = 2500. There is no default weight. Weight is not read from a scale or HealthKit for TDEE; it comes from the user profile.
`BMRAttributes {weight, height, birthday, biologicalSex}`.

### M13.03 — RESOLVED (enum and source dispatch)
- `BiologicalSex` cases: male=0, female=1, other=2, notSet=3. B uses `-161` only for female (tag 1); male, other and notSet use `+5`. `fallbackSex` is not used.
- B = 10*kg + 6.25*cm - 5*age + sexConst; kg and cm via `Measurement.converted(to: kilograms/centimeters)` (`FUN_10198fd0c`). Age: Gregorian `dateComponents([.year], from: birthday, to: now).year` (`FUN_1030ce4ec`). No lower clip.
- Key 9 = activeEnergyBurnedDisplay; 12 protein, 13 carbs, 14 fat (reflection order).

### M13.04 — RESOLVED (Air calories versus weight and food logs)
E depends only on key 9 active-energy buckets, so a Fitbit/Google (Air) connector that supplies active kcal can feed it. X depends on dietary protein/carb/fat logs (grams), which Air does not provide; without them TDEE = (B+E)*1.1 (rounded). B needs the user-entered profile weight (lbs), height and birthday, not a device or scale measurement; with a missing profile the answer is 2500.

## New discoveries
- Glucose per-meal score is computed even with calibrating baselines; the state is only a label.
- Bevel delays Apple Health glucose by 3 h on top of the 2 h meal window.
- The day Quality score uses only the last food's cumulative contributors, not a per-food average.

## Hand-offs
- Agent B (day/baseline framework): `FUN_101589ec8`/`FUN_10158b508`/`FUN_100097bdc` build per-day glucose baselines over `FunctionalDay` windows `[dayStart, dayEnd)`; the lookback length and the config-selection compare in `FUN_10008f1a4` (0x170-byte goal configs, via `FUN_10009a198`) are for B to confirm.
- Agent A (ingestion): `HealthKitManager` statistics options (0x10182b9bc callers), the `Published` data-source object (singleton at 0x106a11620), mg/dL unit map `FUN_103107a54`, and `GlucoseFetcher`/`LiveGlucoseService`/`SyncedGlucoseRecord` producers.
