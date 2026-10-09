# Bevel metric research and tracking

> Superseded by docs/research/bevel/ (2026-10-08). Where this file conflicts, the new docs win.

Updated: 2026-10-06. Research is ongoing. The inventory currently contains 1208 ledger entries: 1188 verified fields/cases across 172 Swift registries and 20 manually named derived entries, including inputs, contributors, dimensions and model fields. These are not 1208 distinct scores. The deduplicated audit identifies 18 score, balance, estimate and recommendation families under the counting rules in section 17. [Machine-readable inventory](bevel-metric-inventory.json) tracks every entry currently identified, including gaps and next steps. No metric has runtime validation yet.

Static analysis of the supplied IPA recovered calculation code for Recovery, Strain, Sleep, Stress, Energy Bank, Biological Age, food scoring, muscular freshness and strength helpers. These are reconstructed equations from ARM64 instructions, not recovered Swift source or runtime-validated replicas.

## Scope and evidence

- App: `com.supersethealth.superset`, version 3.1.7, build 2728.
- IPA SHA-256: `329886dda54e712799b3e913e6f717a1c4e6ddec921cf3f482e4329b02679af7`.
- Main executable: `Payload/Superset.app/Superset`, ARM64, encryption flag `cryptid=0`.
- This IPA links both `BevelAIHealthCoachPatch.dylib` and `blatantsPatch.dylib`, and has a rewritten export-trie root. It is a modified package. Findings apply to this file; equivalence to an unmodified App Store build is unverified.
- The surviving original export trie yielded 108,353 address/name entries, including aliases and non-Swift exports. These are not 108,353 distinct Swift functions. Swift metadata, calculation log strings, call sites and math constants were used to identify functions.
- Addresses below are unslid virtual addresses in the main executable. Assembly is included in [the evidence archive](bevel-evidence.zip).
- The app was not executed. Account access, API responses and server-side coach logic were not inspected.

Confidence: **high** means arithmetic and constants are directly visible. **partial** means core arithmetic is recovered but preprocessing, missing-data rules or surrounding state remain unresolved. A high-confidence kernel does not establish a complete metric implementation.

## 1. Recovery

**High-confidence score arithmetic; partial baseline and input processing.**

Define `clamp(x, lo, hi)` and:

```text
normalized(z) = 100 * clamp((z + 1) / 2, 0, 1)

H = normalized((HRV - meanHRV) / sdHRV)
R = normalized((meanRHR - RHR) / sdRHR)
B = normalized((meanRR - RR) / sdRR)

recovery = clamp(
    0.40 * H + 0.30 * R + 0.30 * sleepScore
    + respiratoryAdjustment + oxygenAdjustment + temperatureAdjustment,
    1, 100
)
```

Available optional terms:

```text
respiratoryAdjustment = 0.20 * (B - 50)

oxygenDeficit = max(0, (meanSpO2 - sdSpO2) * 100 - currentSpO2Percent)
oxygenAdjustment = -min(30, 30 * atan(oxygenDeficit / 5))

temperatureZ = (currentTemperature - meanTemperature) / sdTemperature
temperatureAdjustment = -min(30, 30 * atan(max(0, temperatureZ) / 10))
```

The oxygen equation's baseline-field interpretation follows the surrounding data flow. The subtraction, scaling and arctangent constants are directly visible. SpO2 baseline values here are fractions, while the deficit is percentage points.

Consequences:

- Baseline HRV and RHR yield 50-point components. One favorable standard deviation yields 100; one unfavorable standard deviation yields 0.
- Respiratory rate contributes up to plus or minus 10 points.
- Low oxygen and elevated temperature can each subtract up to 30 points.
- Missing required HRV/RHR can produce no score. Optional terms can be skipped.
- An `ignoreSleepScore` path substitutes 100 for sleep. This matters when interpreting callers that request recovery independent of sleep.

HRV zero-SD normalization returns the neutral component 50 near `0x1015b1400`; the temperature producer sets a zero z-score when SD is zero near `0x1015b2bcc`. This does not settle every degenerate-input branch. Follow-up recovered configurable 30/60-day defaults, daily versus combined aggregation, and a population mean/SD helper (section 20). Accepted sample sets, upstream outlier filtering and calibration transitions remain unresolved. Most recovery operations use float32, including `atanf`, so decimal formulas alone do not specify bit parity.

Evidence: Recovery calculator `0x1015b0ba4`; normalization near `0x1015b13e8`; weighted sum `0x1015b21c8`; RR adjustment `0x1015b20c8`; temperature adjustment `0x1015b213c`; oxygen adjustment `0x1015b366c`. File: `recovery.asm`.

Bevel's public explanation independently confirms the input family: HRV, RHR, sleep, respiratory rate, SpO2 and temperature. [Recovery questions](https://help.bevel.health/en/articles/11258177)

## 2. Daily Strain

**High-confidence daily aggregation; partial workout and muscular units.**

```text
U = exerciseCardioUnits + passiveCardioUnits
    + workoutCardioUnits + workoutMuscularUnits

strain = 16 * atan(totalSteps / 7000)
         + 66 * atan(U / 20000)
```

Angles are radians. The visible daily-return path does not clamp to 100. Its mathematical upper limit, assuming nonnegative inputs, is approximately 128.81.

For example, 7,000 steps and 20,000 strain units produce approximately 64.40.

A cardio accumulation path multiplies each heart-rate segment's **duration in seconds** by a zone weight. The weight interpolates linearly between the following endpoints:

| Zone | Lower-bound weight | Upper-bound weight |
|---|---:|---:|
| 0 | 0 | 1 |
| 1 | 2 | 2 |
| 2 | 3 | 4 |
| 3 | 4 | 7 |
| 4 | 7 | 12 |
| 5 | 12 | 20 |

```text
weight = lowerWeight
         + (HR - lowerHR) / (upperHR - lowerHR)
           * (upperWeight - lowerWeight)

cardioUnits = sum(weight * durationSeconds)
```

Equal HR boundaries use the average of the two endpoint weights. Which segments enter passive versus workout accumulation still depends on filtering. Muscular-workout conversion is not fully recovered.

Evidence: daily calculator `0x1015dc638`, atan calls and constants near `0x1015dc6b8` and `0x1015dcc0c`; weight helper `0x1015daf94`; seconds accumulation `0x1015db208`. Files: `strain.asm`, `strain-unit-helpers.asm`, `strain-cardio-entry.asm`.

## 3. Sleep Score

**High-confidence scoring kernel; partial construction of component inputs.**

Six components enter a nonlinear weighted score:

| Component | Weight | Target | Exponent |
|---|---:|---:|---:|
| Time asleep / sleep needed | 35% | 1.0 | 3 |
| Deep-sleep fraction | 20% | 0.125 default | 2 |
| REM fraction | 20% | 0.20 | 2 |
| Heart-rate dip fraction | 10% | 0.255 default | 3 |
| Sleep efficiency | 7.5% | 0.97 | 15 |
| Sleep continuity | 7.5% | 1.0 | 10 |

```text
component_i = min(1, (input_i / target_i) ^ exponent_i)
sleepScore = clamp(
    100 * sum(weight_i * component_i) / sum(available weight_i),
    0, 100
)
```

Unavailable components are excluded and weights renormalized. No available weight returns no score. A supplied zero first component can also return no score.

This is more punitive than a plain weighted average. Meeting 80% of sleep need contributes `0.8^3 = 0.512` of the duration component. Efficiency and continuity have especially steep penalties below their targets.

Known age and male/female sex replace the deep-sleep and HR-dip targets:

| Age | Deep, male | Deep, female | HR dip, male | HR dip, female |
|---|---:|---:|---:|---:|
| Under 30 | 15% | 15% | 30% | 30% |
| 30-39 | 13% | 14% | 28% | 29% |
| 40-49 | 12% | 13% | 27% | 28% |
| 50-59 | 11% | 12% | 26% | 27% |
| 60-69 | 10% | 11% | 25% | 26% |
| 70+ | 9% | 10% | 24% | 25% |

REM remains 20%. Defaults apply when age/sex cannot select these branches. Sex mapping follows the `BevelBiologicalSex` enum and caller condition.

Sleep-needed arithmetic also includes:

```text
goalSeconds = (goalHours + goalMinutes / 60) * 3600
strainExtraSeconds = goalSeconds * (max(1, strainMultiplier) - 1)
debtExtraSeconds = max(0, -sleepBankMinutes * 60 * 0.25)
```

These terms are conditional on settings. Additional efficiency and sleep-latency adjustments exist; the complete planner remains partial. The local automatic goal estimator is now reconstructed in section 20; producer ordering and settings fallback remain unresolved. Public documentation says Sleep Bank looks back seven days and emphasizes recent nights; the recovered decay kernel is recorded in section 16, while window alignment remains partial. [Sleep Bank](https://www.bevel.health/blog/the-basics-sleep-bank)

Evidence: score calculator `0x1015d11dc`; target helper `0x1015be43c`; caller assembling components near `0x1015c3938`; sleep-needed calculation `0x1015c09d0`. Files: `sleep-debt.asm` (despite its name, this contains the score kernel), `sleep-stage-targets.asm`, `sleep-components.asm`, `sleep-needed-core.asm`.

## 4. Stress

**High-confidence blend and transforms; partial history/context processing.**

Heart rate is first placed in the user's historical HR distribution. The CDF lookup linearly interpolates between stored HR keys, returns 0 below the first key and 1 above the last. The resulting percentile `p` enters this piecewise linear score curve:

| HR percentile p | HR score |
|---:|---:|
| 0 | 0 |
| 0.10 | 3 |
| 0.40 | 18 |
| 0.50 | 30 |
| 0.75 | 45 |
| 0.90 | 60 |
| 0.97 | 85 |
| 1 | 100 |

```text
zHRV = (HRV - baselineMeanHRV) / baselineSDHRV
hrvScore = 100 - 100 * (clamp(zHRV, -4, 3) + 4) / 7
stress = 0.60 * hrScore + 0.40 * hrvScore
```

Missing HRV uses the HR score alone. Zero HRV baseline variance has a branch corresponding to an HRV score of approximately 42.86. Baseline HRV therefore does not mean a 50-point HRV stress component.

Input metadata distinguishes average HR, most recent HRV, average HRV and context. Sleep, workouts and mindfulness affect context handling. Distribution construction, sample-selection rules and displayed smoothing remain unresolved.

Evidence: score paths `0x1015e344c` and `0x1015e493c`; CDF interpolation `0x1015e486c`; HRV normalization near `0x1015e40a8`; blend `0x1015e41c0`; curve table `0x1060b9040`. Files: `stress-score-core.asm`, `stress-heart-rate-transform.asm`, `stress-hrv-normalize.asm`, `stress-score-mix.asm`.

## 5. Energy Bank

**High-confidence local charging/draining curves; partial complete state model.**

The update loop uses **raw stress**, separately stored from display stress. It applies a 360-second interval factor.

For raw stress `S` and current energy `E`:

```text
chargingStressFactor = min(1, 0.93^(S - 5) + 0.10)

drainingStressFactor =
    1.015036^S - 0.90,      when S <= 100
    1.011506^S + 0.4084,    when S > 100

chargingCapacityFactor = min(1, 1.05^(60 - E))
drainingCapacityFactor = min(1, 1.05^(E - 40))

chargeDelta = +baseRate * 360
              * chargingStressFactor * chargingCapacityFactor
drainDelta = -baseRate * 360
             * drainingStressFactor * drainingCapacityFactor
```

A missing stress value substitutes a stress factor of 0.70. Constants are rounded representations of stored float32 values.

Visible base rates:

- Sleep: `80 / sleepGoalSeconds`.
- Mindfulness: `50 / awakeDurationSeconds`.
- Other low-stress samples: `15 / awakeDurationSeconds`.
- Other samples: `60 / awakeDurationSeconds`.

The sleep contexts and mindfulness take the charging branch. Other context values charge when available raw stress is below 20, otherwise drain. Context names follow Swift enum metadata. In this loop, awake duration is looked up from an eight-day history query, with a 57,600-second fallback.

Charging slows above energy 60. Draining slows below energy 40. This is a stateful process, so matching a single displayed stress score is insufficient to match Energy Bank.

Finite per-point updates clamp to **1-100**, not 0-100: `s13=1`, `s14=100` at `0x1015437f0-0x1015437f8`; addition and conditional selects at `0x101543c74-0x101543c84`. Initial energy, day boundaries, historical integration, gaps and recovery coupling remain partial. This update branch does not prove that every initial, empty or presented state shares that range. The above rate equations alone do not reproduce the full chart.

Evidence: update function `0x101543698`; context branch `0x101543940`; stress transforms `0x101543a40`; capacity transforms `0x101543adc`. Files: `energy-update.asm`, `energy.asm`.

## 6. Biological Age

**Age conversion, group combination, PhenoAge coefficients and all factor curves recovered. Factor preprocessing and overlap remain partial.**

### Hazard ratio to age impact

```text
ageDeltaYears = 10 * ln(hazardRatio)
```

This is directly recovered from `BevelBioAge.HazardRatioUtil.calculateDeltaYears` at `0x103c4649c`.

Physiological factor metadata lists sleep duration, sleep consistency, steps, zone 2-3 time, zone 4-5 time, strength training, resting HR, VO2 max and lean body mass. Lifestyle metadata lists nutrition score, alcohol and smoking.

Bevel documents four-week averaging and overlap correction between correlated factors. The per-factor curves are reconstructed in section 14. Correlation corrections remain unresolved. [Physiological age factors](https://www.bevel.health/blog/physiological-age-factors)

### Combining physiological, lifestyle and blood estimates

For chronological age `A`, physiological/lifestyle deltas `Dp`, `Dl`, confidence values `Cp`, `Cl`, and optional blood age `Ab` with confidence `Cb`:

```text
bloodWeight = 0.30 + 0.40 * clamp((A - 30) / 20, 0, 1)
otherWeight = 1 - bloodWeight

effectiveOther = otherWeight * (0.70 * Cp + 0.30 * Cl)
effectiveBlood = bloodWeight * Cb

biologicalAge = (
    (A + Dp + Dl) * effectiveOther + Ab * effectiveBlood
) / (effectiveOther + effectiveBlood)

reportedConfidence = (Cp + Cl + Cb) / 3
```

Missing blood data has zero blood weight/confidence and its numerator term is omitted. Nonpositive effective weight or confidence can return no estimate. A later age-sanitization helper rejects NaN and clips other values to [0, 150], as traced in section 14.

Blood's nominal weight rises from 30% at age 30 or below to 70% at age 50 or above. Confidence changes the effective weight. The physiological and lifestyle deltas are added before group weighting.

Evidence: combine function `0x103c41698`. File: `bioage-combine.asm`.

### Blood age: PhenoAge

The binary contains the following coefficient/unit/log-transform table:

| Marker | Required unit | Coefficient | Transform |
|---|---|---:|---|
| Albumin | g/L | -0.0336 | value |
| Creatinine | micromol/L | 0.0095 | value |
| Glucose | mmol/L | 0.1953 | value |
| hs-CRP | mg/dL | 0.0954 | natural log |
| Lymphocytes | percent | -0.0120 | value |
| Mean corpuscular volume | fL | 0.0268 | value |
| Red-cell distribution width | percent | 0.3306 | value |
| Alkaline phosphatase | U/L | 0.0019 | value |
| White blood cells | 10^9/L | 0.0554 | value |

```text
L = -19.9067 + 0.0804 * chronologicalAge
    + sum(coefficient * transformedMarker)

M = 1 - exp(-exp(L) * 1.51714167042929 / 0.0076927)
phenoAge = 141.50225 + ln(-0.00553 * ln(1 - M)) / 0.090165
```

Unit conversion must precede the regression. In particular, hs-CRP here is mg/dL, not mg/L. The traced calculator omits unavailable marker terms after unit conversion; it does not impute defaults at this stage. Upstream sample construction remains unresolved. Recovered confidence/freshness kernels are recorded below.

The public documentation also identifies Levine's PhenoAge as the blood model. [Biological age basics](https://www.bevel.health/blog/biological-age-the-basics)

Evidence: coefficient initializer `0x103c4522c`; data table `0x106219e10`, nine 32-byte records; regression `0x103c45744`; mortality transform `0x103c45838`; age transform `0x103c44e80`. Files: `phenoage-init.asm`, `phenoage-core.asm`, `phenoage.asm`, `hazard-to-age.asm`.

## 7. Training load and remaining gaps

The cumulative-metrics calculation contains two EWMA updates:

```text
ATL = 0.75 * previousATL + 0.25 * dailyLoad
CTL = 0.9534883723 * previousCTL + 0.0465116277 * dailyLoad
```

These coefficients correspond to `2/(7+1)` and `2/(42+1)`. The exact input-load preprocessing is not fully resolved, so this does not establish the entire ATL/CTL implementation. Evidence: `0x1015f06f4`, `cumulative.asm`.

Identified but not fully recovered:

- Target Strain seed/checkpoint/calendar construction and presentation; history/range kernels recovered in section 20.
- Muscular Strain, personalized freshness capacity/calibration and workout impact.
- Full daily TRIMP calculation.
- Sleep continuity, consistency input construction, Sleep Bank history alignment and automatic sleep-goal producer ordering/settings. The automatic estimator kernel is recovered in section 20.
- Complete daily nutrition combination and glucose baseline construction.
- TDEE outer history/source selection and calorie adjustments; local arithmetic is recovered in section 13.
- Biological Age factor input construction and overlap correction; factor curves are recovered below.
- Complete historical baselines, input filtering, calibration and missing-data behavior.

No bundled Core ML model was found in the archive filename inventory. This does not establish how server-side AI or remotely supplied models work.

## 8. Food glucose score

**High-confidence features and contributor kernels; partial baseline construction and daily aggregation.**

The selected post-food window is the food timestamp through two hours later. Within that window:

```text
peak = maximum available glucose value
exposure = sum((g[i-1] + g[i]) / 2 * (t[i] - t[i-1]) / 3600)
delta = last glucose value - first glucose value
```

Exposure is trapezoidal area, in glucose-value units times hours. Source glucose conversion and resampling still need tracing; do not assume a display unit.

Peak and exposure use their own baseline mean and standard deviation:

```text
contributor = 100 * clamp((1 - (value - baselineMean) / baselineSD) / 2, 0, 1)
```

A value at baseline produces 50; one standard deviation below produces 100; one above produces 0. Invalid/nonfinite calculations can return no contributor.

The delta contributor uses a historical distribution:

```text
q95 = first distribution key whose cumulative probability is >= 0.95
deltaContributor = clamp(100 * (1 - abs(delta / q95)), 0, 100)
foodGlucoseScore = arithmetic mean of available contributors
```

The distribution must have at least two entries. Its construction, integer-key quantization and zero-quantile behavior need tracing. No available contributors produces no score. A dispatch path checks for at least 20 baseline observations per feature; this is not evidence of a 20-day window. Completion delays, CGM-specific behavior and food-to-day weighting remain unresolved.

Evidence: food window `0x100101194`; peak `0x1000975e0`; exposure `0x100097790`; delta `0x100097b4c`; normalizers `0x10010136c`, `0x100101400`; mean `0x100101870`; dispatch `0x100101c00`. Files: `glucose-window.asm`, `glucose-features.asm`, `glucose-normalization.asm`, `glucose-kernel.asm`, `glucose-dispatch.asm`.

## 9. Food quality

**Contributor configurations and linear kernels recovered; complete daily score remains partial.**

| Contributor | Basis | Lower | Upper | Weight |
|---|---|---:|---:|---:|
| Vegetables | calorie fraction | 0 | 0.10 | +10 |
| Fruit | calorie fraction | 0 | 0.06 | +10 |
| Whole grains | calorie fraction | 0 | 0.05 | +10 |
| Nuts, seeds, legumes | calorie fraction | 0 | 0.06 | +10 |
| Fish, seafood | calorie fraction or binary presence | 0 | 0.03 | +10 |
| Healthy oil | calorie fraction | 0 | 0.07 | +10 |
| Red meat | calorie fraction | 0 | 0.09 | -5 |
| Processed meat | calorie fraction | 0 | 0.05 | -10 |
| Added sugar | calorie fraction | 0.05 | 0.10 | -10 |
| Sodium | mass | 1.5 | 2.3 | -5 |
| Alcohol | mass | 0 | 14 | -10 |

Sodium and alcohol use grams. The mass-unit stub at `0x104e6c6a0` loads selector reference `0x1063e9210`, which resolves to `grams` at `0x105cacfc7`. Evidence: `mass-unit-selector.asm`.

```text
contributorScore = weight * clamp((value - lower) / (upper - lower), 0, 1)
calorieFraction = categoryCalories / totalCalories
addedSugarCalories = addedSugarMassInGrams * 4
```

A binary fish/seafood path also exists. Category assignment, overlapping category allocation, zero-calorie cases and the precise binary branch still need tracing.

The aggregate helper filters out keys in a supplied exclusion set, compensates excluded positive contributors at their maximum weight, and then clips the result:

```text
quality = clamp(50 + sum(maxPositiveWeight for excluded positive contributors)
                  + sum(scores for contributors outside the exclusion set), 1, 100)
```

Disabled negative contributors contribute zero. The persisted setting is named `disabledFoodQualityContributors`; the filter-set assignment through published-property key paths still needs a final trace. Daily glucose/quality combination and pre-food versus post-food attribution remain open. Filter evidence: `0x100103170`, `0x100103334`, `quality-filter-predicate.asm`, `quality-config-filter.asm`.

Evidence: configuration `0x1000aa3a0`; linear kernel `0x1000a74a4`; sugar conversion `0x1000a7868`; aggregate `0x10010353c`, initial 50 at `0x100103600`, clipping at `0x100103b58`; daily dispatcher `0x10008f1a4`. Files: `food-quality-config.asm`, `food-quality.asm`, `0x10010353c.asm`, `nutrition-dispatch.asm`.

## 10. Muscular freshness

**Per-muscle fatigue/freshness kernels and 22 default parameter pairs recovered. Personalized capacity and calibration remain partial.**

For each muscle, on each processed day:

```text
fatigue = strengthRaw + cardioDerivedRaw / 3 + decay * previousFatigue
capacity = personalizedCapacity if available, otherwise defaultCapacity
freshnessPercent = clamp(100 * exp(-fatigue / max(1, capacity)), 1, 100)
```

The denominator and returned freshness both have a floor of 1. Default capacity is a fallback, not a minimum imposed on personalized capacity. The units of the raw load terms are not established.

After calibration gates, the visible categories are recovered at >=75%, fatigued at >=35%, and depleted below 35%. Earlier gates can instead label the result calibrating. Exact observation/date requirements and personalization remain unresolved.

| Muscle | Daily decay multiplier | Default capacity |
|---|---:|---:|
| `abductors` | 0.58 | 4500 |
| `abs` | 0.62 | 4200 |
| `adductors` | 0.60 | 4300 |
| `biceps` | 0.78 | 2600 |
| `calves` | 0.52 | 4200 |
| `chest` | 0.78 | 4500 |
| `core` | 0.62 | 4500 |
| `forearm` | 0.66 | 2800 |
| `glutes` | 0.56 | 6000 |
| `hamstrings` | 0.60 | 4500 |
| `hipFlexors` | 0.56 | 3800 |
| `lats` | 0.70 | 4500 |
| `lowerBack` | 0.70 | 4200 |
| `middleBack` | 0.62 | 4500 |
| `neck` | 0.68 | 2200 |
| `obliques` | 0.62 | 4200 |
| `quads` | 0.50 | 5500 |
| `rotatorCuff` | 0.70 | 2200 |
| `shoulder` | 0.68 | 3200 |
| `traps` | 0.62 | 4500 |
| `triceps` | 0.78 | 2600 |
| `upperBack` | 0.62 | 4500 |

An overall-freshness path takes an unweighted arithmetic mean of selected muscle values, with an empty-input fallback of 100. Selection and calibration rules for that collection need tracing.

Evidence: parameter loads `0x100082400`; decay table `0x104ec1fe8`; capacities `0x104ec2098`; fatigue update `0x100082520`; freshness `0x100082824`; overall mean `0x100082d94`; personalization helper `0x10008303c`. File: `muscular-freshness-kernel.asm`.

## 11. Biological Age confidence

**Confidence arithmetic recovered; exact sample selection remains partial.**

```text
nutritionConfidence = min(1, daysWithData / 20)

physioFactorConfidence = min(1, validDays / 20)
```

VO2 max and lean body mass instead use `hasData ? 1 : 0`. Overall physiological confidence is the arithmetic mean of supplied factor confidences. These kernels do not lower-clamp negative counts; callers are expected to supply nonnegative counts.

Smoking confidence depends on elapsed days since confirmation:

```text
months = days / 30
smokingConfidence = 1                                      if months <= 3
smokingConfidence = max(0, 1 - 0.8 * ((months - 3) / 9)^2)  otherwise
```

Missing elapsed-day data produces zero. Alcohol confidence is binary: one when drinks are provided and either drinks equal zero, data is within its validity window, or pre-onboarding eligibility applies. Otherwise it is one if journal data exists and zero if it does not. Validity-window construction remains unresolved.

For nonnegative blood sample age:

| Age in days | Freshness |
|---|---:|
| 0-90 | 1.00 |
| 91-180 | 0.75 |
| 181-272 | 0.50 |
| 273-365 | 0.25 |
| >=366 | 0.00 |

The multi-marker freshness helper averages supplied sample freshness values, including zero-freshness old records. Future-dated samples receive zero freshness. Upstream selection of one sample per marker remains unresolved.

```text
coverage = sum(weights of supplied markers with sample age < 366 days) / sum(all marker weights)
completeness = coverage >= 0.95 ? 1 : 0
bloodConfidence = averageFreshness * completeness
```

Coverage is weighted, not a simple count of available markers. The nine weights are saved in [verified tables](bevel-verified-tables.json). The coverage filter tests signed calendar age `< 366`; it does not reject future dates. Unit-conversion success is not checked by that predicate. Regression unit conversion is a separate path: matching units pass through, convertible units are converted, failed conversions are skipped, and missing marker terms are omitted. Upstream sample construction remains unresolved. Predicate `0x103c447d4`, closure chain `0x103c44860` to `0x103c44580`, conversion `0x103c4532c`, regression `0x103c456d8`.

Evidence: nutrition `0x103c448b0`; physiological factor `0x103c45adc`, mean `0x103c45990`; smoking `0x103c448e8`; alcohol `0x103c44864`; freshness `0x103c43680`, multi-marker mean `0x103c43d64`; coverage `0x103c4443c`, table `0x1051300d8`; confidence `0x103c435f0`. Files: `lifestyle-confidence.asm`, `physio-confidence.asm`, `blood-confidence.asm`, `blood-confidence-details.asm`, `blood-coverage.asm`.

## 12. Biological Age projection

**Projection arithmetic and sanitization limits recovered; source estimate construction remains partial.**

For current chronological age `A` and Biological Age `B`:

```text
rate = clamp(B / A, 0.6, 1.6) if A > 0, otherwise 0.6
projectedChronologicalAge(y) = A + y
projectedBiologicalAge(y) = B + rate * y
```

The helper emits 22 points for years 0 through 21 and advances dates by calendar years. A projected age that fails sanitization falls back to projected chronological age. This is a projection rule, not evidence of a trained forecast model.

Evidence: `0x103c419a8`, `age-projection.asm`.

## 13. TDEE

**BMR, macro-energy arithmetic, local mean gates and final fallback branches recovered. Profile/source construction and outer history remain partial.** The old third-term extract stopped at `0x10199031c`, before two further nutrient lookups and the arithmetic. Treating key 13 as the only input was an extraction omission.

```text
B = 10 * weightKg + 6.25 * heightCm - 5 * integerAge + sexConstant
sexConstant = -161 if sexTag == 1, otherwise +5

X = 0.25 * (4 * meanProteinGrams)
  + 0.07 * (4 * meanCarbohydrateGrams)
  + 0.03 * (9 * meanFatGrams)

TDEE = 2500                          if B is missing
TDEE = roundAway(B * 1.4)            if E is missing
TDEE = roundAway((B+E)+0.1*(B+E))     if E exists and X is missing
TDEE = roundAway(B+E+X)              if E and X exist
```

The BMR helper converts mass through the `kilograms` selector and length through `centimeters`, gets whole-year age using the current date, then applies this Mifflin-St Jeor arithmetic. No lower BMR clip is visible. Tag 1 is consistent with the `BiologicalSex.female` case order; upstream profile type/default construction still needs tracing before treating the whole sex path as reproduced.

The active-energy helper looks up key 9. The third-term helper looks up keys 13, 12 and 14, converts quantities through `gramUnit`, and requires all three usable means. `HealthQuantityType` metadata at `0x105277e88` orders those tags as activeEnergyBurnedDisplay, carbohydratesConsumedDisplay, proteinConsumedDisplay and fatConsumedDisplay. This and the 4/4/9 factors strongly support a thermic-food-energy interpretation. The full dictionary producer/source dispatch is still untraced.

Mean helper `0x101990000` skips zero and nonfinite values. It returns nil unless accepted/supplied is at least 0.8 and at least one value survives. This is coverage among supplied elements, not proof of an 80% calendar-day requirement. Negative finite nonzero values survive the local filter. Calendar-day grouping exists in the active helper; outer window length and per-day sums/source selection remain unresolved.

Macro mean grams are converted to float32 and multiplied by 4/4/9 in float32 before promotion to double and multiplication by 0.25/0.07/0.03. Constants `[4,9]` are at `0x104fb29e8`; `[0.07,0.03]` at `0x104fb29f0`. Final `FRINTA` rounds nearest with ties away from zero, which is not JavaScript `Math.round` for negative halves. The estimate is eventually persisted as float32 and represented as kilocalories, confirmed by selector `0x104e74040`, string `0x105cb86a6` and result caller `0x100112b24`. A 2500 fallback can produce an output without a complete personal model.

Evidence: `assembly/tdee.asm`, `assembly/tdee-inputs.asm`; fresh complete extracts `audit/assembly/fn-0x10198fd0c.asm`, `audit/assembly/tdee-third-term-full.asm`, `audit/assembly/tdee-history-mean.asm`, `audit/assembly/tdee-active-term-full.asm`, `audit/assembly/tdee-energy-samples.asm`, `audit/assembly/tdee-kcal-selector.asm`. Addresses are unslid main-image VAs; `0x1019901c4` maps to file offset `0x19901c4`.

## 14. Biological Age factor curves

**All nine physiological and three lifestyle hazard kernels recovered. Input history, exercise units and factor overlap remain partial.** These are the app's risk-model equations, not independently validated health claims. `x` means the value supplied to the factor calculator; `A` is age in years. Each hazard is clipped to its listed bounds before the existing `10 * ln(hazard)` age transform.

| Physiological factor | Hazard before clipping | Bounds | Calculator |
|---|---|---|---|
| `sleepDuration` | `exp(0.05 * (x - 7.5) * (x - 9))` | [0.9802, 1.24608] | `0x103c4a8c8` |
| `sleepConsistency` | `exp((70 - x) * slope)`, slope 0.007 above 70, otherwise 0.015 | [0.74082, 1.16183] | `0x103c4a46c` |
| `steps` | `(clamp(x, 1, cap) / target)^(-0.26)` | [0.90484, 1.24608] | `0x103c4adf0` |
| `zone2to3Time` | `0.75 + 0.46 * exp(-x / 246)` | [0.74082, 1.10517] | `0x103c4ba38` |
| `zone4to5Time` | `0.95123 + 0.08041 * exp(-x / 20)` | [0.95123, 1.03045] | `0x103c4bda4` |
| `strengthTraining` | `0.827 + 0.3348 * exp(-x / 15.14)` | [0.84366, 1.10517] | `0x103c4b2a4` |
| `restingHeartRate` | `exp(0.012 * (x - referenceRHR))` | [0.63763, 1.2214] | `0x103c4a050` |
| `vo2Max` | `max(0.3, exp(0.038 * (referenceVO2 - x)))` | [0.60653, 1.28403] | `0x103c4b610` |
| `leanBodyMass` | Body-composition rule below | [0.95123, 1.49182] | `0x103c49af8` |

Steps use target 8000 and cap 10000 below age 60, target 6000 and cap 8000 at age 60 or older. Sleep-duration constants suggest hours; exercise denominators suggest time inputs. Their producer conversions and daily versus weekly aggregation have not been traced, so these unit interpretations remain provisional.

The `leanBodyMass` factor consumes a percentage, rather than a mass in kg or pounds:

```text
bodyFatPercent = 100 - leanPercent
z = (referenceBodyFatMean - bodyFatPercent) / referenceBodyFatSD
hazard = 1 + 0.12 * z^2                         if z < 0
hazard = 1 - max(0, 0.005 * (A - 35)) * z       otherwise
```

A nonpositive reference SD returns hazard 1. Demographic lookup selects male/female using the supplied `isMale` flag. How the app constructs that flag remains upstream.

Reference tables use `lower <= A < upper`. Their first bucket includes ages below the label printed in the UI. Do not replace the executable's range with the label.

| RHR age range | Male | Female |
|---|---:|---:|
| [0, 26) | 61 | 65 |
| [26, 36) | 61 | 64 |
| [36, 46) | 62 | 64 |
| [46, 56) | 63 | 65 |
| [56, 66) | 61 | 64 |
| Fallback | 62 | 64 |

| VO2 age range | Male | Female |
|---|---:|---:|
| [0, 20) | 48 | 37.6 |
| [20, 30) | 48 | 37.6 |
| [30, 40) | 42.4 | 30.2 |
| [40, 50) | 37.8 | 26.7 |
| [50, 60) | 32.6 | 23.4 |
| [60, 70) | 28.2 | 20 |
| [70, 80) | 24.4 | 18.3 |
| Fallback | 24.4 | 18.3 |

| Body-fat age range | Male mean | Male SD | Female mean | Female SD |
|---|---:|---:|---:|---:|
| [0, 20) | 17 | 7.78 | 30 | 6.82 |
| [20, 40) | 21.2 | 6.82 | 32.5 | 7.71 |
| [40, 60) | 25.2 | 5.19 | 36.4 | 6.45 |
| [60, 80) | 27.3 | 5.26 | 38.9 | 5.41 |
| Fallback | 27.3 | 4.89 | 36.9 | 5.56 |

The body-fat fallback differs from the last bucket. Lookup helpers: RHR `0x103c46abc`, VO2 `0x103c46c20`, body fat `0x103c46d88`. Initializers: `0x103c466b0`, `0x103c467ac`, `0x103c468f0`.

Lifestyle kernels:

```text
nutritionHazard = clamp(0.96^((nutritionScore - 50) * 1.1 / 10), 0.79, 1.27)
alcoholHazard = clamp(max(1, 1 + slope * (drinksPerWeek - threshold)), 1, 1.28)
```

Alcohol uses slope 0.025 and threshold 4 for male, slope 0.035 and threshold 2 otherwise. A zero-drink value returns 1, without a protective adjustment. Addresses: nutrition `0x103c472ec`, alcohol `0x103c47054`.

Smoking and vaping combine excess hazard:

```text
cigExcess = (0.06 * averageCigsPerDay + min(0.05 * cigDurationYears, 0.2))
            * (1 + 0.03 * cigDurationYears) * exp(-0.75 * cigYearsSinceQuit)
vapeExcess = averageVapingIntensity * min(0.04 * vapingDurationYears, 0.15)
             * (1 + 0.015 * vapingDurationYears) * exp(-0.75 * vapeYearsSinceQuit)
smokingHazard = clamp(1 + cigExcess + vapeExcess, 1, 1.65)
```

Years since quitting are calendar days from quit date to the end-of-window date, divided by 365.25. A missing quit date uses zero elapsed years. No negative elapsed-time clamp is visible in this kernel. The journal-to-history calculation, intensity encoding and input constraints remain unresolved. Smoking `0x103c47644`; signed calendar-day helper `0x1030f8fb8`.

Age sanitization at `0x1038cd3b8` returns nil for NaN and otherwise clips to [0, 150]. Positive and negative infinity clip to 150 and 0. This closes the previously untraced sanitizer behavior.

Evidence: `hazard-*.asm`, `physio-hazard-dispatch.asm`, `lifestyle-hazard-dispatch.asm`, `bioage-neutral-rhr.asm`, `bioage-neutral-vo2.asm`, `bioage-bodyfat-reference.asm`, reference initializer files, `date-days-between.asm`, `bioage-sanitize.asm`.

## 15. Strength calculation helpers

**Effective weight, set effort and estimated one-rep max kernels recovered. Complete muscular strain remains partial.** All weight arithmetic below uses pounds, confirmed by recovered function signatures.

Effective weight at `0x103e45340`:

- `cableDouble`, `dumbbellDouble`, `kettlebellDouble`: twice recorded weight.
- `machineAssisted`: `max(bodyWeight - recordedWeight, 0)`.
- `bodyweight`: body weight plus recorded weight for `chestDip`, `chinUp`, `pullUp`, `pullUpCloseGrip`, `pullUpWideGrip`, `pullUpLSit`, `pullUpTypewriter`, `pullUpFrenchie`, `muscleUp`.
- Other equipment/exercise combinations: recorded weight.

These nine preset IDs were resolved against the 548-case `StrengthWorkout` registry. Custom exercise dispatch, units conversion and missing body-weight defaults remain upstream.

Estimated one-rep max at `0x103e45580`:

```text
r = clamp(recordedReps, 1, 20)
if recordedReps <= 12 and RPE >= 7:
    estimate = weight * 100 / (100 - 1.5 * r - 1.5 * (10 - min(RPE, 10)))
    return estimate if finite, otherwise 0
otherwise:
    return weight * (1 + r / 30)
```

The low-repetition path also floors zero/negative reps to one. The fallback has no finite-value sanitization in this helper.

Set RPE at `0x103e45650`:

```text
fallback = sessionEstimatedEffort if supplied, otherwise 5
if steLoss_v1 exists and detectedReps_v1 is absent:
    RPE = clamp(3 + 10 * steLoss_v1, 3, 10)
if both analysis fields exist and abs(detectedReps - recordedReps) <= 5:
    RPE = clamp(3 + 10 * steLoss_v1, 3, 10)
otherwise:
    RPE = fallback
```

Missing recorded reps use zero for the agreement check. The fallback is not clipped here. The motion-only helper `0x103e457c4` returns nil when these conditions fail. How motion samples produce `steLoss_v1` and `detectedReps_v1` remains unresolved.

Callers `0x1015ae3f0` and `0x1015aeea8` keep the maximum estimated one-rep max per exercise. This establishes a use of these helpers but does not establish muscular-load accumulation, muscle allocation or final strain units.

Evidence: `strength-effective-weight.asm`, `strength-1rm.asm`, `strength-rpe.asm`, `strength-velocity-rpe.asm`, `muscular-strain-set.asm`, `muscular-strain-estimation.asm`.

## 16. Sleep history kernels

**Sleep Bank decay and consistency scoring recovered. History selection, absent-night handling and time-zone behavior remain partial.**

The Sleep Bank helper `0x1015cd324` processes a supplied ordered array of sleep durations. For each nonzero supplied slot:

```text
contribution[i] = ((sleepSeconds[i] - goalHours * 3600) / 60) * exp(0.3 * (i - 6))
sleepBankMinutes = sum(contribution)
```

For a seven-slot array, slot-0-to-slot-6 weights are approximately `[0.1653, 0.2231, 0.3010, 0.4066, 0.5488, 0.7408, 1]`. Zero slots are skipped. The final sum has no range clip in this helper. Caller ordering, slot construction, and how absent nights affect the seven-slot alignment still require tracing. The goal is supplied by the caller, not estimated by this equation.

The consistency helper `0x1015cdbb4` creates 1440 minute-of-day counters. Its terminal kernel is:

```text
agreement = sum(k[m] * (k[m] - 1) + (N - k[m]) * (N - k[m] - 1))
sleepConsistency = 100 * agreement / (N * (N - 1) * 1440)
```

`k[m]` counts a marked state at minute `m` across `N` included days. The terminal equation counts both matching states equally. It returns no value when `N <= 1`. Minute indexing uses calendar hour and minute; session classification, day eligibility, boundary inclusion and DST handling remain unresolved. Do not assume standard SRI scaling: this code returns agreement percent without a `2 * agreement - 1` transform.

Evidence: `sleep-history-bank.asm`, `sleep-bank-actual-kernel.asm`, `sleep-bank-kernel.asm`. The last filename is historical; it contains the consistency calculation.

## Using this for Pulse

These recovered kernels can guide separate experimental implementations. Reproducing Bevel outputs requires matching its inputs, baseline construction and state history as well as the equations.

Bevel's recovered Strain equation is not Pulse's 0-21 display scale. Recovery and Stress also use different normalization ranges. Directly replacing existing scorers would change score meaning and history.

Next useful work is to trace unresolved preprocessing and compare an independently implemented kernel against known input/output pairs from this exact build. No changes were made to Pulse application code.

## Evidence files

[The evidence archive](bevel-evidence.zip) includes calculation disassembly, recovered symbol names, relevant type metadata and coefficient tables. It excludes the IPA, executables, app resources, complete raw string dumps and account material.

Objdump's printed function labels can be misleading because this package's public export root was patched. Use the stated addresses and `recovered-symbols.tsv`. Automated assembly comments are navigation aids, not independently verified operand semantics. Conclusions above follow instruction sequences and selected constants, with uncertainties stated explicitly.

## Tracking rules

Current status: 54 kernel-labelled entries, 31 partial entries, 13 located entries, 1110 names awaiting producer tracing, zero runtime-validated entries. Kernel is a local arithmetic label, not a complete score or an independently proven runtime replica. Counts include duplicate concepts across registries.

- Add every newly identified metric/input to the inventory before tracing it. Keep aliases and registry membership explicit.
- Record formula, units, source selection, history window, calibration, missing-data behavior, clipping and evidence address independently.
- Promote status only when evidence supports it. A symbol or product explanation alone does not establish arithmetic.
- Keep imported/input metrics separate from derived scores. Blood markers and nutrients may require conversion and aggregation rather than proprietary scoring.
- Check callers before treating shared helper formulas as the formula for a displayed metric.
- Runtime validation is a separate step. No recovered kernel currently has it.

## Registry coverage

These are registry entries, not distinct score counts. The same concept can appear in several registries.

| Registry / ledger group | Entries | Evidence |
|---|---:|---|
| `AgeDeltaEstimate` | 2 | descriptor `0x1052b34f0`, accessor `0x103e02580` |
| `AgeEstimate` | 2 | descriptor `0x1052b350c`, accessor `0x103e02614` |
| `AggregateFoodQualityContributorScore` | 2 | descriptor `0x1051fea28`, accessor `0x1000a59bc` |
| `AggregateStatistics` | 4 | descriptor `0x1052311c8`, accessor `0x10158c070` |
| `AggregatedDataState` | 3 | descriptor `0x1052462fc`, accessor `0x101dfc274` |
| `BaselineConfiguration` | 3 | descriptor `0x105246bb8`, accessor `0x101e232b0` |
| `BioAgeProjectionPoint` | 2 | descriptor `0x1052aec6c`, accessor `0x103c4184c` |
| `BioAgeScoreConfidence` | 5 | descriptor `0x1052b3528`, accessor `0x103e028a4` |
| `BioAgeScoreData` | 3 | descriptor `0x1052098f4`, accessor `0x100589f90` |
| `BioMetric` | 9 | descriptor `0x10529f55c`, accessor `0x1038aee4c` |
| `Biomarker` | 89 | descriptor `0x10529f5cc`, accessor `0x1038b6370` |
| `BloodPressureCalculationService` | 2 | descriptor `0x1052099f8`, accessor `0x100595a94` |
| `CadenceMetrics` | 2 | descriptor `0x1052b4f50`, accessor `0x103ed0328` |
| `CalculatedMetric` | 12 | descriptor `0x105246bd4`, accessor `0x101e232c0` |
| `CalculationConfiguration` | 5 | descriptor `0x105246bf0`, accessor `0x101e23efc` |
| `CalculationOutcome` | 3 | descriptor `0x1052b1384`, accessor `0x103d1eda4` |
| `CalculationsOptions` | 8 | descriptor `0x105236898`, accessor `0x101914c34` |
| `CaloriesDisplay` | 2 | descriptor `0x1052367d4`, accessor `0x101912760` |
| `CardioFocusImpact` | 2 | descriptor `0x1052b4c58`, accessor `0x103ec00a4` |
| `CardioFocusMetric` | 2 | descriptor `0x1052b596c`, accessor `0x103ef5de8` |
| `CardioFocusSummaryItem` | 3 | descriptor `0x10521e6b0`, accessor `0x100d93d34` |
| `CardioFocusZone` | 3 | descriptor `0x1052b5950`, accessor `0x103ef5dd8` |
| `CardioLoadData` | 11 | descriptor `0x1051fd3ec`, accessor `0x10000e060` |
| `CategoryFreshness` | 3 | descriptor `0x1051fe4ac`, accessor `0x100087618` |
| `CoachingJournalInsightInsufficientDataResult` | 2 | descriptor `0x1052c7520`, accessor `0x1044ce4a4` |
| `CoachingJournalInsightStrongResult` | 1 | descriptor `0x1052c74e8`, accessor `0x1044ce478` |
| `CoachingJournalInsightWeakResult` | 1 | descriptor `0x1052c7504`, accessor `0x1044ce488` |
| `CumulativeMetrics` | 4 | descriptor `0x10523181c`, accessor `0x1015f2180` |
| `CurrentStressStatus` | 8 | descriptor `0x10529f904`, accessor `0x1038c9ce4` |
| `CyclePhaseInfo` | 4 | descriptor `0x10521a2e0`, accessor `0x100b2c7ec` |
| `CycleSummaryMetrics` | 7 | descriptor `0x105215e4c`, accessor `0x100a0fb7c` |
| `CycleTrackingMetrics` | 11 | descriptor `0x10521a334`, accessor `0x100b37bb4` |
| `CycleTrackingPredictionDefaults` | 2 | descriptor `0x10521a2c4`, accessor `0x100b2c740` |
| `CycleTrackingSymptomData` | 24 | descriptor `0x1052149fc`, accessor `0x1009877c0` |
| `CycleTrackingSymptomType` | 23 | descriptor `0x105214b70`, accessor `0x10098d9a8` |
| `DailyCycleInfo` | 17 | descriptor `0x10521a2fc`, accessor `0x100b2c8ec` |
| `DailyScores` | 5 | descriptor `0x10524b3fc`, accessor `0x101f82c94` |
| `DayHealthTrendBaseline` | 4 | descriptor `0x105215098`, accessor `0x100999ef4` |
| `DayNutritionScores` | 3 | descriptor `0x1051fe890`, accessor `0x10009e128` |
| `DayScoreCalorieConfiguration` | 2 | descriptor `0x1051ff590`, accessor `0x100104ae4` |
| `Derived` | 20 | Manual derived-kernel group, not a Swift registry |
| `DerivedAgeScore` | 6 | descriptor `0x105208fc0`, accessor `0x10054d46c` |
| `DerivedAgeScoreRecord` | 8 | descriptor `0x10523f9b8`, accessor `0x101bd7920` |
| `DistanceMetrics` | 1 | descriptor `0x1052b4ec4`, accessor `0x103ed0140` |
| `DistanceWorkoutMetrics` | 9 | descriptor `0x1052b5a04`, accessor `0x103ef65e8` |
| `DynamicSleepGoalCalculationError` | 1 | descriptor `0x105244a48`, accessor `0x101d74134` |
| `DynamicSleepGoalCalculationResult` | 3 | descriptor `0x105244a64`, accessor `0x101d79a70` |
| `ElevationMetrics` | 3 | descriptor `0x1052b4ee0`, accessor `0x103ed0150` |
| `EnergyBankDerivedMetrics` | 5 | descriptor `0x10523078c`, accessor `0x101544a24` |
| `EnergyDayContext` | 3 | descriptor `0x105230710`, accessor `0x1015357b8` |
| `EnergyMetrics` | 2 | descriptor `0x1052b4f88`, accessor `0x103ed0348` |
| `EnergyUnit` | 2 | descriptor `0x105278290`, accessor `0x1031119b0` |
| `FoodGlucoseScores` | 5 | descriptor `0x1051fe728`, accessor `0x10009a678` |
| `FoodNutritionScores` | 2 | descriptor `0x1051fe8e0`, accessor `0x10009faa8` |
| `FoodQualityContributor` | 11 | descriptor `0x1051fea90`, accessor `0x1000aa350` |
| `FoodQualityScores` | 3 | descriptor `0x1051fe8b8`, accessor `0x10009ec60` |
| `FoodScoreApportionBasis` | 3 | descriptor `0x10520d444`, accessor `0x10067c0c0` |
| `FoodScoreApportionEntry` | 3 | descriptor `0x10520d2d0`, accessor `0x10067a768` |
| `GenerateDayPrototypeDataAndStressResult` | 3 | descriptor `0x105230738`, accessor `0x10154525c` |
| `GetEnergyHistoryResult` | 2 | descriptor `0x105230754`, accessor `0x10154526c` |
| `GlucoseContributor` | 3 | descriptor `0x1051fe784`, accessor `0x10009c5e0` |
| `GlucoseDataPoint` | 2 | descriptor `0x1051fec48`, accessor `0x1000aeee8` |
| `GlucoseScoreState` | 3 | descriptor `0x1051fe768`, accessor `0x10009c5d0` |
| `GlucoseUnit` | 2 | descriptor `0x1052782ac`, accessor `0x1031123b8` |
| `GoogleHealthBackfillJobTypeResponse` | 18 | descriptor `0x10520c008`, accessor `0x10064025c` |
| `GoogleHealthDailySyncService` | 5 | descriptor `0x10522c324`, accessor `0x1013a4388` |
| `GoogleHealthDuplicateSourceService` | 1 | descriptor `0x10522c610`, accessor `0x1013b7ff0` |
| `GoogleHealthSampleSyncType` | 11 | descriptor `0x10522c3e0`, accessor `0x1013a77cc` |
| `GoogleHealthSamplesSyncService` | 5 | descriptor `0x10522c370`, accessor `0x1013a74f0` |
| `GoogleHealthSleepSyncService` | 5 | descriptor `0x10522c3fc`, accessor `0x1013aaa68` |
| `GoogleHealthSyncService` | 16 | descriptor `0x10522c550`, accessor `0x1013b7164` |
| `GoogleHealthWorkoutsSyncService` | 5 | descriptor `0x10522c470`, accessor `0x1013ad780` |
| `HealthDataBaselines` | 9 | descriptor `0x105231084`, accessor `0x10158bf80` |
| `HealthDataRHRCalculation` | 4 | descriptor `0x105231e38`, accessor `0x101655f44` |
| `HealthKitRHRCalculation` | 2 | descriptor `0x105231e70`, accessor `0x101655f64` |
| `HealthMetric` | 55 | descriptor `0x10529f840`, accessor `0x1038c3c9c` |
| `HealthMetricCalculationResult` | 2 | descriptor `0x105234b90`, accessor `0x1017e010c` |
| `HealthMetricUnit` | 24 | descriptor `0x10529f878`, accessor `0x1038c5228` |
| `HealthQuantityType` | 84 | descriptor `0x105277e88`, accessor `0x103102f44` |
| `HeartRateDetails` | 2 | descriptor `0x1052b59c0`, accessor `0x103ef5e24` |
| `HeartRateMetrics` | 2 | descriptor `0x1052b4f18`, accessor `0x103ed0274` |
| `HeartRateRecoveryDataPoint` | 6 | descriptor `0x10521fba8`, accessor `0x100e25510` |
| `HeartRateRecoveryDetails` | 4 | descriptor `0x1052b4cc8`, accessor `0x103ec0188` |
| `HeartRateRecoveryPayload` | 3 | descriptor `0x1052b59a4`, accessor `0x103ef5e14` |
| `HeartRateRecoveryResult` | 3 | descriptor `0x1052b4ce4`, accessor `0x103ec0428` |
| `HeartRateZoneMethod` | 4 | descriptor `0x1052367f0`, accessor `0x1019127b0` |
| `HeartRateZoneSettings` | 7 | descriptor `0x105236990`, accessor `0x101917318` |
| `HrvMethod` | 2 | descriptor `0x10523680c`, accessor `0x101913034` |
| `IntegrationDailyHealthSampleResponse` | 5 | descriptor `0x10520bfd0`, accessor `0x1006400fc` |
| `IntegrationHealthSample` | 9 | descriptor `0x10522e7d0`, accessor `0x10146ca98` |
| `IntegrationHealthSampleResponse` | 6 | descriptor `0x10520bc44`, accessor `0x100639e44` |
| `IntegrationHealthSampleSourceType` | 2 | descriptor `0x10522e81c`, accessor `0x10146e260` |
| `IntegrationHealthSampleType` | 19 | descriptor `0x10522e838`, accessor `0x10146eaf0` |
| `IntegrationHealthSampleUnitType` | 11 | descriptor `0x10522e854`, accessor `0x10146ef24` |
| `IntegrationRHRCalculation` | 1 | descriptor `0x105231e54`, accessor `0x101655f54` |
| `IntegrationSleepSessionResponse` | 7 | descriptor `0x10520bc94`, accessor `0x10063a808` |
| `IntegrationSleepStageSegmentResponse` | 3 | descriptor `0x10520bcbc`, accessor `0x10063ad28` |
| `IntegrationWorkoutSessionResponse` | 21 | descriptor `0x10520bd34`, accessor `0x1006388f8` |
| `JournalInsightResult` | 4 | descriptor `0x105235260`, accessor `0x101863a54` |
| `LifestyleHazardRatioContext` | 3 | descriptor `0x1052aeef0`, accessor `0x103c499e8` |
| `LifestyleMetricDeltaYears` | 6 | descriptor `0x1052b3544`, accessor `0x103e028ec` |
| `LifestyleMetricType` | 3 | descriptor `0x10529f894`, accessor `0x1038c6300` |
| `LiveEnergyBankState` | 9 | descriptor `0x105231d6c`, accessor `0x10164eaa8` |
| `LoadMetrics` | 4 | descriptor `0x1052b4da8`, accessor `0x103ec0bd8` |
| `MacroBalanceWeekDataValue` | 3 | descriptor `0x10524ad34`, accessor `0x101f69618` |
| `MetricContext` | 5 | descriptor `0x105236828`, accessor `0x101913b80` |
| `MuscleFreshness` | 6 | descriptor `0x1051fe4c8`, accessor `0x1000876d4` |
| `MuscleFreshnessStatus` | 4 | descriptor `0x10526b34c`, accessor `0x102c3dc5c` |
| `MuscleRawLoad` | 2 | descriptor `0x1051fe490`, accessor `0x10008756c` |
| `MuscularFreshnessData` | 1 | descriptor `0x1051fe50c`, accessor `0x100087f58` |
| `MuscularFreshnessMetrics` | 1 | descriptor `0x1051fe528`, accessor `0x100087f68` |
| `MuscularFreshnessStatus` | 4 | descriptor `0x1052b40d4`, accessor `0x103e434bc` |
| `MuscularLoadData` | 11 | descriptor `0x1051fe6a8`, accessor `0x10008dd8c` |
| `MuscularLoadDebugDay` | 23 | descriptor `0x10526b2bc`, accessor `0x102c3c8b0` |
| `MuscularLoadDebugStatus` | 7 | descriptor `0x10526b454`, accessor `0x102c656d0` |
| `MuscularLoadMetrics` | 3 | descriptor `0x1051fe644`, accessor `0x10008caa0` |
| `NutrientType` | 42 | descriptor `0x1052d87b0`, accessor `0x104aead60` |
| `NutritionMetrics` | 7 | descriptor `0x1051fea44`, accessor `0x1000a3f68` |
| `NutritionScoreCategory` | 3 | descriptor `0x1051ff574`, accessor `0x100101184` |
| `OuraReadinessSummary` | 4 | descriptor `0x10520ca3c`, accessor `0x100666c28` |
| `OuraReadinessSummaryData` | 4 | descriptor `0x10522cb28`, accessor `0x1013d7de8` |
| `PaceMetrics` | 1 | descriptor `0x1052b4efc`, accessor `0x103ed0160` |
| `PendingOrAvailableNutritionScore` | 2 | descriptor `0x1051fe830`, accessor `0x10009d3d4` |
| `PeriodCycle` | 4 | descriptor `0x10521a350`, accessor `0x100b37c24` |
| `PhysioHazardRatioContext` | 9 | descriptor `0x1052aef44`, accessor `0x103c4c7c8` |
| `PhysioMetricDeltaYears` | 7 | descriptor `0x1052b356c`, accessor `0x103e032e4` |
| `PhysioMetricType` | 9 | descriptor `0x10529f8e8`, accessor `0x1038c9c00` |
| `PowerMetrics` | 1 | descriptor `0x1052b4f6c`, accessor `0x103ed0338` |
| `RhrMethod` | 2 | descriptor `0x105236860`, accessor `0x101914684` |
| `RunningDynamicsMetrics` | 3 | descriptor `0x1052b4fa4`, accessor `0x103ed03fc` |
| `SamplesAggregationMethod` | 2 | descriptor `0x1052315d8`, accessor `0x1015be18c` |
| `ScoreBoundaryInclusion` | 2 | descriptor `0x105277b80`, accessor `0x1030f7e70` |
| `ScoreCalculationError` | 3 | descriptor `0x1052315bc`, accessor `0x1015b489c` |
| `ScoreInterval` | 4 | descriptor `0x105277b9c`, accessor `0x1030f7e94` |
| `ScoreThresholdType` | 2 | descriptor `0x105277a14`, accessor `0x1030f5280` |
| `SleepContributorStatus` | 5 | descriptor `0x105233d78`, accessor `0x10172785c` |
| `SleepDebugDataDownloadType` | 6 | descriptor `0x10526a030`, accessor `0x102b9f164` |
| `SleepGoalCalculationMethod` | 2 | descriptor `0x105237bfc`, accessor `0x10193910c` |
| `SleepLatencyStatus` | 3 | descriptor `0x105233ddc`, accessor `0x101728298` |
| `SleepScoreComponent` | 6 | descriptor `0x105233ae0`, accessor `0x101725178` |
| `SleepScoreComponentResult` | 3 | descriptor `0x105233ac4`, accessor `0x101725168` |
| `SleepSessionSummary` | 5 | descriptor `0x105233b74`, accessor `0x101726b0c` |
| `SleepStage` | 6 | descriptor `0x105233a48`, accessor `0x101724650` |
| `SleepStageMetric` | 3 | descriptor `0x105233b18`, accessor `0x101725248` |
| `SleepStageSegment` | 5 | descriptor `0x1052332c8`, accessor `0x10170dfec` |
| `SmokingHazardRatioContext` | 7 | descriptor `0x1052aeeb8`, accessor `0x103c495e4` |
| `SpO2Sample` | 3 | descriptor `0x1052035cc`, accessor `0x100322ce4` |
| `SpO2SampleMetadata` | 6 | descriptor `0x1052035f4`, accessor `0x1003225ec` |
| `SportSummaryScores` | 16 | descriptor `0x1052b4ff8`, accessor `0x103ed0f14` |
| `StrainZoneMetric` | 5 | descriptor `0x1052b5934`, accessor `0x103ef5dc8` |
| `StrengthMuscleGroup` | 22 | descriptor `0x1052b410c`, accessor `0x103e45298` |
| `StressActivityInputs` | 4 | descriptor `0x1052309f4`, accessor `0x10155fbec` |
| `StressContextHistory` | 4 | descriptor `0x1052316b0`, accessor `0x1015e8228` |
| `StressDataPoint` | 6 | descriptor `0x10523817c`, accessor `0x1019470ec` |
| `StressScore` | 2 | descriptor `0x10529f92c`, accessor `0x1038cc07c` |
| `StressScoreInput` | 4 | descriptor `0x105231688`, accessor `0x1015e6c94` |
| `StressScoreLevel` | 6 | descriptor `0x10529f948`, accessor `0x1038cc08c` |
| `SwimMetrics` | 3 | descriptor `0x1052b4fc0`, accessor `0x103ed0430` |
| `SyncedSpO2Record` | 8 | descriptor `0x105242b8c`, accessor `0x101c8b318` |
| `TDEECalculator` | 3 | descriptor `0x1051ff840`, accessor `0x100112f34` |
| `TemperatureBaselineDefaultCalculator` | 1 | descriptor `0x10522f020`, accessor `0x10149ddd8` |
| `TemperatureSource` | 2 | descriptor `0x10523687c`, accessor `0x101914898` |
| `TrendAnalysisEntry` | 2 | descriptor `0x105202c38`, accessor `0x1002d1584` |
| `ValueWithBaseline` | 4 | descriptor `0x105233980`, accessor `0x10171b4c8` |
| `WorkoutOverlayScores` | 10 | descriptor `0x1052b5a20`, accessor `0x103ef6c64` |
| `WorkoutOverlayScoresBuildDependencies` | 16 | descriptor `0x105234a38`, accessor `0x1017c376c` |
| `WorkoutScoreCalculationResult` | 3 | descriptor `0x105234ae4`, accessor `0x1017d4370` |
| `WorkoutScoreOwner` | 4 | descriptor `0x1052426bc`, accessor `0x101c762f0` |
| `WorkoutSummaryScoreRecordData` | 19 | descriptor `0x10524286c`, accessor `0x101c7c26c` |
| `WorkoutSummaryScoreState` | 3 | descriptor `0x1052b5858`, accessor `0x103eebcb8` |
| `WorkoutSummaryScores` | 10 | descriptor `0x1052b589c`, accessor `0x103eee630` |
| `WorkoutWindowScoreBuildResult` | 4 | descriptor `0x105234508`, accessor `0x1017806f8` |
| `WorkoutWindowScores` | 9 | descriptor `0x1052b4fdc`, accessor `0x103ed0894` |

### Health metric ledger

| Metric | Status |
|---|---|
| `recoveryScore` | kernel |
| `restingHeartRate` | registered |
| `heartRateVariability` | registered |
| `respiratoryRate` | registered |
| `heartRateDip` | partial |
| `daytimeHeartRate` | registered |
| `maxHeartRate` | registered |
| `meditationMinutes` | registered |
| `sleepBank` | kernel |
| `sleepScore` | kernel |
| `sleepConsistency` | kernel |
| `timeInBedMinutes` | registered |
| `timeAsleepMinutes` | registered |
| `timeRemSleepMinutes` | registered |
| `timeDeepSleepMinutes` | registered |
| `wakeTime` | registered |
| `sleepTime` | registered |
| `sleepEfficiency` | partial |
| `timeToFallAsleep` | registered |
| `exerciseMinutes` | registered |
| `cardioMinutes` | registered |
| `activeCaloriesBurned` | registered |
| `totalCaloriesBurned` | registered |
| `strainScore` | kernel |
| `trainingLoad` | partial |
| `steps` | registered |
| `zone2Minutes` | registered |
| `zone2and3Minutes` | registered |
| `zone4and5Minutes` | registered |
| `strengthTrainingMinutes` | registered |
| `stressScore` | kernel |
| `activeStress` | registered |
| `inactiveStress` | registered |
| `sleepStress` | registered |
| `averageHeartRateVariability` | registered |
| `averageHeartRate` | registered |
| `spO2` | registered |
| `temperature` | registered |
| `bodyTemperature` | registered |
| `daylightMinutes` | registered |
| `energyConsumed` | registered |
| `netEnergy` | registered |
| `foodQualityScore` | partial |
| `macroBalanceBreakdown` | registered |
| `proteinConsumed` | registered |
| `carbsConsumed` | registered |
| `fatsConsumed` | registered |
| `nutritionScore` | partial |
| `glucoseAverage` | registered |
| `glucoseVariability` | registered |
| `morningFastingGlucose` | registered |
| `temperatureDeviation` | registered |
| `hrvDeviation` | registered |
| `rhrDeviation` | registered |
| `recoveryDeviation` | registered |

### Other registered measurements and contributors

**BioMetric:** `vo2Max`, `bodyWeight`, `bodyFatPercentage`, `rhrBaseline`, `hrvBaseline`, `leanBodyMass`, `leanBodyPercentage`, `bloodPressureSystolic`, `bloodPressureDiastolic`.

**Biomarker:** `magnesiumRBC`, `mercury`, `erythrocyteSedimentationRate`, `totalCholesterolHDLRatio`, `neutrophilsPercent`, `eosinophilsPercent`, `bunCreatinineRatio`, `estimatedAverageGlucose`, `insulinFasting`, `correctedCalcium`, `folateRBC`, `folateSerum`, `methylmalonicAcid`, `omega3Total`, `omega6Total`, `thyroidPeroxidaseAntibodies`, `hematocrit`, `hemoglobin`, `meanCorpuscularHemoglobin`, `meanCorpuscularHemoglobinConcentration`, `meanCorpuscularVolume`, `meanPlateletVolume`, `plateletCount`, `redBloodCellCount`, `redCellDistributionWidth`, `calcium`, `carbonDioxide`, `chloride`, `magnesium`, `potassium`, `sodium`, `ldlCholesterol`, `apolipoproteinB`, `hdlCholesterol`, `hsCRP`, `lipoproteinA`, `nonHDLCholesterol`, `totalCholesterol`, `triglycerides`, `vldlCholesterol`, `whiteBloodCellCount`, `basophils`, `eosinophils`, `lymphocytes`, `monocytes`, `neutrophils`, `basophilsPercent`, `lymphocytesPercent`, `monocytesPercent`, `bloodUreaNitrogen`, `creatinine`, `eGFR`, `alanineTransaminase`, `albumin`, `albuminGlobulinRatio`, `alkalinePhosphatase`, `aspartateAminotransferase`, `gammaGlutamylTransferase`, `globulin`, `totalBilirubin`, `totalProtein`, `dheaSulfate`, `sexHormoneBindingGlobulin`, `testosteroneFree`, `testosteroneTotal`, `estradiol`, `follicleStimulatingHormone`, `luteinizingHormone`, `prolactin`, `glucose`, `hemoglobinA1c`, `uricAcid`, `homocysteine`, `iron`, `ironSaturation`, `ironBindingCapacity`, `vitaminB12`, `vitaminD`, `igf1`, `cortisol`, `tsh`, `freeT3`, `freeT4`, `creatineKinase`, `immunoglobulinA`, `amylase`, `lipase`, `ferritin`, `crp`.

**NutrientType:** `addedSugar`, `biotin`, `caffeine`, `calcium`, `calories`, `carbs`, `chloride`, `cholesterol`, `chromium`, `copper`, `fat`, `fiber`, `folate`, `iodine`, `iron`, `magnesium`, `manganese`, `molybdenum`, `monounsaturatedFat`, `niacin`, `pantothenicAcid`, `phosphorus`, `polyunsaturatedFat`, `potassium`, `protein`, `riboflavin`, `saturatedFat`, `selenium`, `sodium`, `sugar`, `thiamin`, `transFat`, `vitaminA`, `vitaminB6`, `vitaminB12`, `vitaminC`, `vitaminD`, `vitaminE`, `vitaminK`, `water`, `zinc`, `alcohol`.

**PhysioMetricType:** `sleepDuration`, `sleepConsistency`, `steps`, `zone2to3Time`, `zone4to5Time`, `strengthTraining`, `restingHeartRate`, `vo2Max`, `leanBodyMass`.

**LifestyleMetricType:** `nutritionScore`, `alcohol`, `smoking`.

**FoodQualityContributor:** `vegetables`, `fruit`, `wholeGrains`, `nutsSeedsLegumes`, `fishSeafood`, `healthyOilUse`, `redMeat`, `processedMeat`, `excessSugar`, `excessSodium`, `alcohol`.

### Derived metric ledger

| Registry | Metric | Status |
|---|---|---|
| `CardioLoadData` | `atl` | registered |
| `CardioLoadData` | `bufferRangeStart` | registered |
| `CardioLoadData` | `optimalATLRangeStart` | registered |
| `CardioLoadData` | `optimalATLRangeEnd` | registered |
| `CardioLoadData` | `bufferRangeEnd` | registered |
| `CardioLoadData` | `calibrationConfidence` | registered |
| `CardioLoadData` | `ctlMaturity` | registered |
| `CardioLoadData` | `trainingDensity` | registered |
| `CardioLoadData` | `recency` | registered |
| `CardioLoadData` | `dailyTrimp` | registered |
| `MuscularFreshnessData` | `overallFreshnessPercent` | partial |
| `MuscleFreshness` | `muscle` | registered |
| `MuscleFreshness` | `freshnessPercent` | kernel |
| `MuscleFreshness` | `capacity` | partial |
| `MuscleFreshness` | `personalizedCapacity` | located |
| `MuscleFreshness` | `observationCount` | registered |
| `MuscleFreshness` | `fatigue` | kernel |
| `MuscularLoadData` | `atl` | registered |
| `MuscularLoadData` | `displayLoad` | registered |
| `MuscularLoadData` | `optimalRangeStart` | registered |
| `MuscularLoadData` | `optimalRangeEnd` | registered |
| `MuscularLoadData` | `calibrationConfidence` | registered |
| `MuscularLoadData` | `ctlMaturity` | registered |
| `MuscularLoadData` | `trainingDensity` | registered |
| `MuscularLoadData` | `recency` | registered |
| `MuscularLoadData` | `dailyRaw` | registered |
| `MuscularLoadData` | `ratio` | registered |
| `DayNutritionScores` | `overallScore` | located |
| `DayNutritionScores` | `glucoseScore` | partial |
| `DayNutritionScores` | `qualityScore` | partial |
| `CycleTrackingMetrics` | `medianCycleLength` | located |
| `CycleTrackingMetrics` | `medianPeriodLength` | located |
| `CycleTrackingMetrics` | `cycleVariability` | located |
| `CycleTrackingMetrics` | `cycleLengthTag` | located |
| `CycleTrackingMetrics` | `periodLengthTag` | located |
| `CycleTrackingMetrics` | `variabilityTag` | located |
| `CycleTrackingMetrics` | `cycleCount` | located |
| `EnergyBankDerivedMetrics` | `lastCharge` | partial |
| `EnergyBankDerivedMetrics` | `energyCharged` | partial |
| `EnergyBankDerivedMetrics` | `energyDrained` | partial |
| `EnergyBankDerivedMetrics` | `chargingSegments` | partial |
| `EnergyBankDerivedMetrics` | `solidEnergyHistory` | partial |
| `SleepScoreComponent` | `asleepRatio` | partial |
| `SleepScoreComponent` | `heartRateDipPercentage` | partial |
| `SleepScoreComponent` | `remSleepRatio` | partial |
| `SleepScoreComponent` | `deepSleepRatio` | partial |
| `SleepScoreComponent` | `sleepEfficiency` | partial |
| `SleepScoreComponent` | `sleepContinuity` | partial |
| `CumulativeMetrics` | `atl` | partial |
| `CumulativeMetrics` | `ctl` | partial |
| `CumulativeMetrics` | `targetStrain` | partial |
| `CumulativeMetrics` | `dailyTrimp` | partial |
| `Derived` | `biologicalAge` | kernel |
| `Derived` | `phenoAge` | kernel |
| `Derived` | `bioAgeProjection` | kernel |
| `Derived` | `bloodConfidence` | kernel |
| `Derived` | `physioConfidence` | kernel |
| `Derived` | `nutritionConfidence` | kernel |
| `Derived` | `alcoholConfidence` | kernel |
| `Derived` | `smokingConfidence` | kernel |
| `Derived` | `totalDailyEnergyExpenditure` | partial |
| `Derived` | `sleepNeeded` | partial |

### Additional registry entries

All names below have individual status and evidence records in the JSON inventory. Some fields are collections, categorical dimensions or state flags rather than scalar metrics. Registry membership alone does not establish a calculation.

**HealthQuantityType:** `restingHeartRate`, `heartRateVariability`, `vo2Max`, `respiratoryRate`, `heartRateMinuteAggregates`, `heartRateSamples`, `restingEnergyBurned`, `activeEnergyBurned`, `restingEnergyBurnedDisplay`, `activeEnergyBurnedDisplay`, `energyBurnedDisplay`, `energyConsumedDisplay`, `proteinConsumedDisplay`, `carbohydratesConsumedDisplay`, `fatConsumedDisplay`, `bloodGlucose`, `bloodPressureSystolic`, `bloodPressureDiastolic`, `spO2`, `temperature`, `bodyTemperature`, `steps`, `stepsDisplay`, `physicalEffort`, `distanceCrossCountrySkiing`, `distancePaddleSports`, `distanceRowing`, `distanceSkatingSports`, `distanceWalkingRunning`, `distanceCycling`, `distanceSwimming`, `distanceWheelchair`, `distanceDownhillSnowSports`, `height`, `weight`, `bodyFatPercentage`, `exerciseTime`, `hydration`, `caffeine`, `vitaminB12`, `vitaminC`, `vitaminD`, `zinc`, `magnesium`, `calcium`, `alcoholIntake`, `daylightTime`, `environmentalAudioExposure`, `leanBodyMass`, `cyclingPower`, `runningPower`, `cyclingFunctionalThresholdPower`, `cyclingSpeed`, `runningSpeed`, `walkingSpeed`, `powerWatts`, `speedMetersPerSecond`, `biotin`, `chloride`, `cholesterol`, `chromium`, `copper`, `fiber`, `folate`, `iodine`, `iron`, `manganese`, `molybdenum`, `monounsaturatedFat`, `niacin`, `pantothenicAcid`, `phosphorus`, `polyunsaturatedFat`, `potassium`, `riboflavin`, `saturatedFat`, `selenium`, `sodium`, `sugar`, `thiamin`, `vitaminA`, `vitaminB6`, `vitaminE`, `vitaminK`.

**CalculatedMetric:** `averageHeartRateVariability`, `restingHeartRateVariability`, `respiratoryRate`, `restingHeartRate`, `inactiveHeartRate`, `sleepingHeartRate`, `wristTemperature`, `bodyTemperature`, `spO2`, `foodGlucoseAUC`, `foodGlucosePeak`, `foodGlucoseDelta`.

**SportSummaryScores:** `distance`, `elevation`, `pace`, `heartRate`, `cadence`, `power`, `energy`, `swim`, `runningDynamics`, `strainScore`, `trimp`, `muscularLoad`, `heartRateRecovery`, `rpe`, `cardioFocus`, `cardioLoad`.

**WorkoutSummaryScores:** `strainScore`, `trimp`, `muscularStrainUnits`, `cardioStrainUnits`, `cardioFocus`, `heartRateRecovery`, `distanceWorkoutMetrics`, `strainZones`, `hrDetails`, `resolvedWorkoutEffort`.

**HeartRateRecoveryPayload:** `heartRateRecovery`, `recoveryStartHeartRate`, `recoveryEndHeartRate`.

**DistanceWorkoutMetrics:** `distanceMiles`, `elevationAscendedFeet`, `elevationDescendedFeet`, `elevationFeet`, `speedMilesPerHour`, `paceSecondsPerMile`, `powerAverage`, `mileSplits`, `kmSplits`.

**StrengthMuscleGroup:** `abductors`, `abs`, `adductors`, `biceps`, `calves`, `chest`, `core`, `forearm`, `glutes`, `hamstrings`, `hipFlexors`, `lats`, `lowerBack`, `middleBack`, `neck`, `obliques`, `quads`, `rotatorCuff`, `shoulder`, `traps`, `triceps`, `upperBack`.

**GlucoseContributor:** `peak`, `exposure`, `delta`.

**MuscleRawLoad:** `strengthRaw`, `cardioDerivedRaw`.

**MuscularLoadMetrics:** `atl`, `ctl`, `dailyRaw`.

**FoodGlucoseScores:** `glucoseScore`, `glucoseContributors`, `glucoseMetrics`, `glucoseBaselines`, `glucoseScoreState`.

**FoodQualityScores:** `qualityContributors`, `preFoodQualityScore`, `postFoodQualityScore`.

**AggregateFoodQualityContributorScore:** `score`, `percentage`.

**NutritionMetrics:** `nutritionScore`, `foodQualityScore`, `glucoseScore`, `aggregateQualityContributors`, `nutrients`, `metricMeasurements`, `foodScores`.

**BioAgeProjectionPoint:** `projectedBioAge`, `chronologicalAge`.

**AgeEstimate:** `age`, `confidence`.

**AgeDeltaEstimate:** `ageDeltaInYears`, `confidence`.

**PhysioMetricDeltaYears:** `metricType`, `metricValue`, `hazardRatio`, `deltaYears`, `confidence`, `validDays`, `rangeSegments`.

**LifestyleMetricDeltaYears:** `metricType`, `metricValue`, `hazardRatio`, `deltaYears`, `confidence`, `rangeSegments`.

**CycleSummaryMetrics:** `periodLength`, `periodLengthTag`, `cycleLength`, `cycleLengthTag`, `variability`, `variabilityTag`, `hasFullCycleWindow`.

**DailyCycleInfo:** `dayOfCycle`, `dayOfPhase`, `phase`, `isLowConfidence`, `isFuturePrediction`, `hasFlow`, `medianCycleLength`, `medianPeriodLength`, `cycleVariability`, `cycleLengthTag`, `periodLengthTag`, `variabilityTag`, `hasSufficientData`, `cycleCount`, `status`, `nextPeriodDate`, `isUsingDefaults`.

**CyclePhaseInfo:** `phase`, `startDay`, `endDay`, `isLowConfidence`.

**PeriodCycle:** `startDateKey`, `endDateKey`, `periodLength`, `cycleLength`.

**CycleTrackingPredictionDefaults:** `cycleLength`, `periodLength`.

**CycleTrackingSymptomData:** `flow`, `moodChanges`, `sleepChanges`, `appetiteChanges`, `cramps`, `bloating`, `constipation`, `diarrhea`, `nausea`, `chills`, `fatigue`, `hotFlashes`, `lowerBackPain`, `headache`, `memoryLapse`, `breastPain`, `pelvicPain`, `dryness`, `acne`, `drySkin`, `hairLoss`, `nightSweats`, `bladderIncontinence`, `spotting`.

**CycleTrackingSymptomType:** `spotting`, `cramps`, `bloating`, `constipation`, `diarrhea`, `nausea`, `appetiteChanges`, `chills`, `fatigue`, `hotFlashes`, `lowerBackPain`, `headache`, `memoryLapse`, `moodChanges`, `breastPain`, `pelvicPain`, `dryness`, `acne`, `drySkin`, `hairLoss`, `nightSweats`, `sleepChanges`, `bladderIncontinence`.

**DistanceMetrics:** `distanceMeters`.

**ElevationMetrics:** `ascendedMeters`, `descendedMeters`, `deltaMeters`.

**PaceMetrics:** `speedMetersPerSecond`.

**HeartRateMetrics:** `bpm`, `strainZones`.

**CadenceMetrics:** `cadence`, `unit`.

**PowerMetrics:** `watts`.

**EnergyMetrics:** `activeKcal`, `totalKcal`.

**SwimMetrics:** `strokeCountPer100Meters`, `poolLengthMeters`, `laps`.

**RunningDynamicsMetrics:** `strideLengthMeters`, `verticalOscillationCm`, `groundContactMs`.

**HeartRateDetails:** `maxHR`, `averageHR`.

**WorkoutWindowScores:** `duration`, `distance`, `elevation`, `pace`, `heartRate`, `cadence`, `power`, `energy`, `swim`.

**StrainZoneMetric:** `percentage`, `durationMinutes`, `strainZone`, `zoneBpmMin`, `zoneBpmMax`.

**MacroBalanceWeekDataValue:** `averageGrams`, `totalGrams`, `percentageOfCalories`.

**HeartRateZoneSettings:** `zone1`, `zone2`, `zone3`, `zone4`, `zone5`, `maxHR`, `methodPayload`.

**HeartRateZoneMethod:** `maxHR`, `hrReserve`, `lactateThreshold`, `manual`.

**SleepStageMetric:** `percentage`, `seconds`, `sleepStage`.

**SleepSessionSummary:** `isPrimary`, `startTime`, `endTime`, `secondsInSleepStage`, `activityScore`.

**Additional cycle fields:** `currentPhases`, `shouldShowPhases`, `status`, `dailyPredictions`.

**Strength helper entries:** `estimated1RM`, `effectiveStrengthWeight`, `setRPE`, `motionDerivedRPE`. See section 15.

**Additional derived entries:** `bloodFreshness`, `bloodCoverage`, `bloodCompleteness`, `foodGlucoseScore`, `muscularFreshness`, `muscularFatigue`. See recovered kernels above.

**CardioFocusImpact:** `percentageImpact`, `valueImpact`.

**CardioFocusSummaryItem:** `zone`, `value`, `percentage`.

**CardioFocusZone:** `lowAerobic`, `highAerobic`, `anaerobic`.

**CardioFocusMetric:** `zone`, `value`.

**TrendAnalysisEntry:** `trendDays`, `diff`.

**DayHealthTrendBaseline:** `baseline`, `standardDeviation`, `currentValue`, `smoothedDeviation`.

**JournalInsightResult:** `strong`, `weak`, `insufficientData`, `regressionError`.

**CoachingJournalInsightStrongResult:** `slope`.

**CoachingJournalInsightWeakResult:** `slope`.

**CoachingJournalInsightInsufficientDataResult:** `falses`, `trues`.

## Investigation queue

1. Food-quality configuration filtering, daily nutrition combination, glucose baseline/CDF construction and CGM completion rules.
2. Personalized muscular capacity, calibration, raw load, daily TRIMP and Target Strain.
3. Sleep consistency minute/day eligibility, continuity, Sleep Bank slot alignment and goal estimation.
4. TDEE, energy consumed/net energy and macro balance.
5. Biological Age factor history/units, overlap correction, upstream blood sample construction and confidence validity windows.
6. Cycle prediction, variability, phase estimation and temperature processing.
7. Raw HR/HRV/RHR acquisition, HR zones, baselines and deviation metrics.
8. Workout metrics, journal impacts and trend aggregation, including any additional metric families found in the binary.

## Research log

- 2026-10-06: Persisted initial recovered kernels and metadata inventory. Continuing calculator tracing.
- 2026-10-06: Added glucose feature/scoring kernels, food-quality configuration, 22 muscular decay/capacity pairs, age confidence and projection rules, and conditional TDEE arithmetic. Expanded coverage to 627 entries across 60 registries. Corrected name-only deviation entries to registered.
- 2026-10-06: Added cardio focus/impact, trend baseline/deviation and journal result/slope schemas. That earlier pass had 655 entries and 70 registries; section 18 supersedes those counts. No journal regression arithmetic recovered yet.
- 2026-10-06, earlier pass, superseded: The 11-headline grouping, five close-fit labels and Sleep Bank-as-new claim were too coarse. The independent audit below replaces those counts and input-fit conclusions.

- 2026-10-06: Recovered all 12 age-factor hazard curves, demographic reference tables, age sanitization, four strength helpers, Sleep Bank exponential decay and consistency agreement arithmetic. Traced PhenoAge unit conversion and confirmed missing terms are omitted in the calculator. Refined food-quality exclusion/compensation behavior. Static kernels only; runtime validation remains zero.

## 17. Revised families, counts and Pulse crosswalk

Count one family per distinct score, balance, load, estimate or recommendation output. Daily/workout aliases, chart fields and context variants collapse. Recovery, Strain, Sleep Score, Stress, Energy Bank and Biological Age are six. Cardio Load, Muscular Load, Muscular Freshness, Food Glucose, Food Quality, Daily Nutrition and TDEE add seven. Sleep Bank, Consistency, Needed, Target Strain and Heart Rate Recovery add five: **18 discovered families**. This is a declared taxonomy, not an exhaustive-app claim.

ATL/CTL/TRIMP and cardio optimal ranges stay under Cardio Load. PhenoAge, age projection, confidence and nine physiology/three lifestyle impacts stay under Biological Age. Per-muscle freshness is one family. Cardio Focus is a workout contribution/dimension summary. Raw vitals, stages, zone minutes, macro breakdowns, strength helpers, cycle predictions and journal associations remain in the inventory but are excluded from this score-family count. The former 11-headline grouping arbitrarily hid several separately presented outputs.

- **12 Pulse counterpart benchmark targets:** Recovery, Strain, Sleep Score, Stress, Energy Bank, Biological Age, Cardio Load, Sleep Bank, Consistency, Needed, Target Strain and HR Recovery.
- **11 have plausible currently mapped cardio/sleep/HR inputs for core or explicit fallback branches.** Add Biological Age as **one partial-composite candidate**, making 12. This is input plausibility, not a close-fit or parity label.
- **Two new cardio-only algorithm leads:** Muscular Load and Muscular Freshness. Debug models and the freshness kernel include cardio-derived load. Missing local muscle loads default to zero. Their cardio allocation and full eligibility paths are untraced, so neither is proven Air-compatible end to end or proven impossible without lifting logs.
- **Four additional-input families:** Food Glucose, Food Quality, Daily Nutrition and personalized TDEE. They need meals/glucose/detail or personal weight beyond Air measurements. TDEE nevertheless has output-producing fallbacks. Biological Age's full optional groups and full strength models also need non-Air data; these gaps overlap the partial/lead categories and must not be added as new families.
- **Zero new Air-compatible families proven end to end; zero runtime-validated replicas; zero production replacements justified.** Experimental kernels and connector parity research can start now.

Sleep Bank is an alternate to an existing Pulse debt family, not Pulse's first sleep-balance algorithm. Pulse's ledger is in `src/core/scoring/sleep.ts`, with planning in `sleepPlanner.ts`. HR Recovery and Target Strain also already exist. The table below reflects source reads at Pulse HEAD `6efe9df65ed2891ac9e14aed8493dc508a6401f2`.

| Bevel family | Actual current Pulse path and behavior | Relationship / current fit |
|---|---|---|
| Recovery | [recovery.ts](../../src/core/scoring/recovery.ts), [baselines.ts](../../src/core/scoring/baselines.ts): HRV .55, RHR .20, RR .05, sleep .15, skin .05 plus optional terms; renormalized weighted z then logistic `100/(1+exp(-1.6*(z+.2)))`. Baseline SD proxy is `1.253*spread`; prior-night Winsorized EWMA, early regime, trust/staleness gates. | Alternate model; Bevel uses linear clipped components and SpO2 penalty. A neutral Bevel z is not Pulse's logistic neutral. |
| Strain | [strain.ts](../../src/core/scoring/strain.ts), [stage1.ts](../../src/server/pipeline/stage1.ts): current call selects Edwards HRR-zone weights 1-5 times minutes, capped gap integration, `100*ln(TRIMP+1)/ln(7201)`; display multiplies by 21/100. | Alternate model and incompatible scale; Bevel uses seconds/interpolated zone weights plus steps and muscular units. |
| Sleep Score | [sleep.ts](../../src/core/scoring/sleep.ts), [scores.ts](../../src/server/pipeline/scores.ts): weights .50 duration/.20 efficiency/.20 restorative/.10 consistency; deep+REM combined target; pipeline passes absent stages as zero. | Alternate model; Bevel drops invalid components and has separate steep deep/REM/HR-dip/continuity terms. |
| Stress | [stress.ts](../../src/core/algorithms/stress.ts) is the actual pipeline minute model: still-awake HR logistic on 0-3, step/sleep/workout exclusion, daytime baseline and provisional fallback. [stressBase.ts](../../src/core/scoring/stressBase.ts) is a separate helper, not the main scorer called here. | Alternate model; Bevel has HR CDF, optional HRV and context paths. Pulse's step proxy loses motion detail. |
| Energy Bank | [energyBank.ts](../../src/core/algorithms/energyBank.ts): wake seed .6 Recovery+.4 sleep performance; per-minute basal/Edwards/stress drain, calm and nap charge, clip each minute. | Alternate state model; Bevel 360-second curves and carry/history require trajectory parity. |
| Biological Age | [healthspan.ts](../../src/core/algorithms/healthspan.ts): custom nine-factor curves, 180-day history, VO2/run-versus-RHR estimator, FFMI, overlap shrink, minimum factor/history gates, age delta clip +/-15 and separate pace. | Partial Air physiology comparison; Bevel body-composition percentage, hazard tables, weekly composite, confidence and blood/lifestyle models differ. No full composite parity. |
| Cardio Load | [trainingLoad.ts](../../src/core/scoring/trainingLoad.ts), [readiness.ts](../../src/core/scoring/readiness.ts): daily Effort, alphas `1-exp(-1/7)` and `1-exp(-1/42)`, contiguous suffix/reset/prime rules. | Alternate model. Bevel uses .25 and 2/43, not the same smoothing just because both say 7/42 days. Daily TRIMP and range/status still need tracing. |
| Sleep Bank | [sleep.ts](../../src/core/scoring/sleep.ts): 14 usable-night ledger, next debt `.55*max(0,need+priorDebt-slept)`, below 10 minutes clears, includes naps when main sleep usable; balance never positive. | Existing family alternate. Bevel seven-slot signed exponential surplus/deficit, no local clip. |
| Consistency | [sleepRegularity.ts](../../src/core/algorithms/sleepRegularity.ts): adjacent-day comparisons, noon-to-noon days, wear/coverage mask, raw Phillips SRI `-100+200p`, displayed nonnegative. | Existing family alternate. Bevel all included pairs and agreement percent; day/bin construction unknown. |
| Sleep Needed | [sleepPlanner.ts](../../src/core/algorithms/sleepPlanner.ts): personalized base, strain above prior mean, 20% debt, naps, wake-time/efficiency history. | Existing family alternate; Bevel 25% negative bank and manual/automatic goal settings, automatic estimator recovered; history ordering/settings partial (section 20). |
| Target Strain | [strainTarget.ts](../../src/core/algorithms/strainTarget.ts): 28-day mean on 0-21, minimum 14 days, recovery-band multipliers/cold defaults, ACWR lift/cap and range constraints. | Existing guidance family; Bevel producer not yet reproduced. |
| HR Recovery | [hrRecovery.ts](../../src/core/scoring/hrRecovery.ts): last-five-minute sustained >=70% max HR gate; cessation peak, medians at +1/+2/+5 minutes, gap/sample requirements, negative drop permitted. | Existing family; Bevel maximum-drop selector within 120 seconds, earlier point at/before workout end, explicit zoneFourNotReached result. Supplied interval, gate and Air cadence remain partial. |
| Muscular Load | No per-muscle/load history scorer. [Google map.ts](../../src/server/sources/google/map.ts) retains workout summaries, not sets. | Additional family, cardio-only lead; full lifting path needs extra inputs. |
| Muscular Freshness | No per-muscle freshness scorer. | Additional family, cardio-only lead. Local zero-load fallback permits output; not evidence producer fidelity. |
| Food Glucose | [map.ts](../../src/server/sources/google/map.ts) retains daily mean glucose only. | Additional model; post-meal time series and meal timestamps absent. These are not Air measurements. |
| Food Quality / Daily Nutrition | Same connector keeps daily kcal/carbs/fat/protein, not food-category allocations, sugar/sodium/alcohol detail. No equivalent scorer. | Two additional families, richer food logging required. Do not equate quality and overall nutrition. |
| TDEE | Calorie rollups mapped; [profile.ts](../../src/server/profile.ts) has birth date/sex/optional height. No TDEE scorer or manually entered weight in that profile. | Additional estimate; Bevel fallback branches can output. Personalized weight must come from user/profile/scale, not Air. |

## 18. Independent audit and new evidence

### Identity and extraction checks

The IPA is 532,162,261 bytes with the hash above. Its main executable is 113,099,984 bytes, SHA-256 `78c1c99c815163517c69a0bec10bd97b415e4b3b3c0d642132c13a43b366c083`, UUID `481D40FB-A9DF-3306-8F29-139B32C123C8`, thin arm64 ALL, PIE executable. `LC_ENCRYPTION_INFO_64`: cryptoff 48,541,696, cryptsize 4096, cryptid 0. Minimum iOS 18.0, SDK 26.5. All 12 Mach-O images inventoried have cryptid 0. This establishes analyzability of these bytes, not authenticity of a pristine build.

Both patch dylibs are linked. Bevel patch SHA-256 `e5f14354d2b146f6110e19a66da82d39ae283bcb8b39ec5d7cec969e5379d3d1`; blatants patch `4fb1f1d688a795bd3fb63aec01cf238ed48834fb95733cdaa280ee0618401f5a`. Hook effects are uncharacterized. Do not assume modifications only unlock subscriptions or cannot alter scores. The extensions also link blatantsPatch. Version/build labels alone do not establish an original App Store binary.

Fresh parsing reproduces all 108,353 recovered export address/name entries and demangles, and all 14,064 Swift metadata records. All available descriptor/accessor/field references in the original 655-entry ledger match. Its 20 manually named derived entries do not have Swift registry descriptors. The export trie starts at file offset 107,917,432, size 3,158,208; rewritten root ends at byte 6, surviving original root at trie offset 3,157,882 with original nodes beginning at 2307. The recovery utility prepended `$s` to 3,982 non-Swift labels too; those display names are not Swift symbols. Export aliases/shared implementations must not inflate function counts.

Fresh Xcode `llvm-objdump` disassembly matches all 110 original assembly extracts: 165,078 instruction records, zero mismatches. The independent direct-BL index matches all 98,904 target keys and 2,142,419 call sites. That index excludes tail `B`, indirect `BLR`, ObjC and async dispatch. Exact instruction matching verifies extraction, not every formula interpretation. Original annotation register tracking does not invalidate on every clobber; some annotations interpret pointers/instructions as numbers. Use fresh instructions and verified data bytes, not automated comments or patched objdump labels.

Addresses are unslid VAs. Main `__TEXT` addresses generally map to VA minus `0x100000000`; data addresses use Mach-O segment mapping, not that shortcut. The [audit report](bevel-audit.json) records image hashes, checks, table offsets, additions, limitations and equation recomputations. Original evidence zip hash before supplementation was `8bec7fd7e1310f264d4be7bec6ac7cc9c18b745fb417295ed0d1d2bf9e1352ab`; all original members are preserved.

### Corrections to interpretation

| Earlier claim or shortcut | Audit result |
|---|---|
| One patch library mentioned | Two linked patch dylibs; their runtime effect is unverified. |
| 108,353 recovered Swift functions | Address/name entries including aliases and 3,982 non-Swift labels. |
| Kernel status or public explanation proves metric implementation | False. Every inventory row now separates metadata/arithmetic/pipeline/runtime confidence; runtime is unvalidated throughout. |
| Five close-fit Air replacements, seven migration targets | Input plausibility only; 12 existing counterpart benchmark targets under explicit 18-family taxonomy. |
| Sleep Bank is a wholly new Pulse algorithm | Pulse already implements a debt ledger. Bevel adds different signed surplus/history behavior in the same family. |
| Pulse and Bevel both use equivalent 7/42-day smoothing | False. Pulse 0.133122/0.023529 versus Bevel 0.25/0.046512; input loads also differ. |
| HR Recovery arithmetic unknown | New 120-second maximum-drop selector recovered, plus Float32-negated result. Supplied interval and zone gate remain unresolved. |
| TDEE key 13/third term cannot be resolved | Original extraction truncated it. Complete helper exposes three macro keys, 4/4/9 conversion and .25/.07/.03 factors; outer source/history still partial. |
| TDEE output unit assumed | Kilocalories verified through selector `0x104e74040`, string `0x105cb86a6`, result caller `0x100112b24`. |
| TDEE average only drops nonfinite data | Also drops exactly zero; coverage denominator is supplied-element count. |
| Numeric Freshness requires set-level lifting inputs | Local absent loads/prior fatigue become zero. Cardio-derived path exists; full allocation/eligibility remains unknown. |
| Daily HRV equals the samples consumed by Bevel | Unproven. Bevel Google mapper explicitly handles `hrvRmssd`; Pulse does not request HRV sample type. |
| API/type registry proves Air hardware measured weight, food or glucose | False. Integrations include personal, scale and other-app data. Keep source provenance. |
| No Core ML filenames proves no remote/non-Core-ML model | False. Filename inventory only establishes no matching bundled filename was found. |

Table byte checks independently match all 22 muscle decay/capacity doubles, nine PhenoAge coefficient/log flags, nine blood coverage doubles and four zone-weight pairs. Sleep/food/age tables additionally have matching fresh instruction evidence, but upstream enum/source conversions remain a separate task. Float32 decimal approximations, C/Swift math, summation order and ties-away rounding matter near thresholds. Equation sanity examples in `audit/equation-recomputations.json` are synthetic math evaluations, not Bevel reference outputs. Examples: neutral recovery with sleep 100 is 65; HRV stress at z=0 is 42.8571; one-hour first-slot surplus gives 9.9179 minutes versus 60 in slot 6.

### HR Recovery selector recovered

Fresh `audit/assembly/hrr-selection.asm` covers `0x1017cdb20-0x1017ce068`. Caller `0x1017cd57c` supplies 120.0 seconds. Its source/function label is `findMaxHRRecoveryInWindow(activeWorkoutEnd:hrRecoverySamples:)`, string `0x105927910`, referenced at `0x1017cd854` in `audit/assembly/hrr-service.asm`.

For chronological finite HR points, the helper selects:

```text
minimumDelta = min(HR[j] - HR[k])
    over earlier k < j,
    time[j] - time[k] <= 120 seconds,
    time[k] <= activeWorkoutEnd
serviceRecovery = -Float32(minimumDelta)
```

It maintains a sliding maximum-HR deque, does not sort points, and returns nil for fewer than two points, nonpositive window or no eligible pair. Comparisons are at `0x1017cdd80-0x1017cdd98`, `0x1017cdda0-0x1017cdda4` and `0x1017cde68-0x1017cde90`; Float32 conversion/negation is at `0x1017cd8e0-0x1017cd8e4`. Increasing HR can yield negative recovery; no clipping is observed locally.

The later point is not locally required to follow workout end. The upstream supplied interval matters: a pair wholly inside a workout can satisfy this helper. Do not call this a fixed +2-minute measurement. Sample ordering, source/unit conversion, active-workout-end construction, zone-four eligibility and aggregation into daily/workout aliases remain untraced. `data`, `noData` and `zoneFourNotReached` result cases are verified metadata, not a fully recovered gate. This differs from Pulse's +1/+2/+5-minute median sampler and supports an experimental comparison, with no runtime parity claim.

### Fitbit path found in this IPA

The user's observation that Bevel returns outputs connected to Fitbit Air is the behavior to reproduce. It does not imply every score uses every optional input. A replica should match Bevel's source selection and missing-input branches, including estimates, defaults and visibility gates.

This build explicitly contains Google Health integration support at `0x1058bb5d0` and an Air heart-rate visibility guide at `0x105a13300`, referenced in function `0x104b17850`. The guide mentions Share heart rate and Always visible. This is build-specific evidence of an Air integration path, stronger than generic marketing.

The path is Bevel server endpoints `googleHealthSamplesByType`, `googleHealthDaily`, `googleHealthSleep`, `googleHealthWorkouts` and backfill, then local integration stores and shared metric services. Response models at `0x10520bc44` and `0x10520bfd0` contain sourceId, sampleType, time/date, value and platform. They do not expose Google's raw payload shape. The raw Google-to-Bevel conversion, backend filters and possible estimates occur across a server boundary and cannot be recovered from these DTOs alone.

Sample mapper `0x1013a2050` and daily mapper `0x1013a2518` explicitly compare the small string `hrvRmssd`, select internal type tag 8, preserve the numeric value, and assign its unit using byte table `0x104f82e40`. That tag resolves to heartRateVariability and unit tag 5 to ms. Unknown types are skipped. Integration sample types also register HR samples/minute aggregate, active/resting energy, SpO2, weight/body fat, glucose and temperature. Their registration does not establish Air-specific availability or the backend's raw-field conversion. Fresh evidence: `audit/assembly/google-response-map1.asm`, `google-response-map2.asm`, `fn-0x10146eaa0.asm`, `audit/selected-models.json`.

Pulse's [catalogue](../../src/server/sources/google/catalogue.ts), [normalizer](../../src/server/sources/google/map.ts) and [sync](../../src/server/sources/google/sync.ts) currently:

- Request nightly HRV average and deep-sleep RMSSD as separate daily fields. They do not request `heart-rate-variability` samples. Bevel's HRV method/context/window selection therefore needs matching; do not treat a daily field as inherently sufficient or unavailable.
- Retain RHR bpm, RR breaths/min, nightly temperature/baseline/30-day SD in C, SpO2 percent, sleep segments, HR timestamps, minute steps and workout summaries. Temperature C versus Bevel Fahrenheit must be reconciled before z/penalty calculations.
- Map HR while dropping only HEALTH_CONNECT points, round/deduplicate to second timestamps and integer bpm, and discard metadata/device provenance. This does not guarantee Air-only source selection. Minute steps take the per-minute maximum across grouped sources; Google daily rollups are merged sources.
- Preserve main-sleep/processed/stages-status handling, but omit separate short awakenings and out-of-bed intervals. Those omissions can change continuity, efficiency and time-in-bed construction.
- Keep daily-average glucose and daily kcal/carbs/fat/protein rollups, not meal-time glucose or food detail. Scale weight/body fat is grams-to-kg/percent; it is not an Air sensor. No sets/reps/weight/RPE, mindfulness session stream, raw RR intervals or time-resolved HRV is retained.
- Do not fetch personal HRV/RHR range rollups: sync comments report UNSUPPORTED_DATA_TYPE_ACTION. Catalogue listing does not mean a fetch runs. Plain `vo2-max` is a probe entry; daily/run forms are normalized, but Air-specific production availability is still account-dependent.

Current Google docs explicitly list Air for sleep, nightly vitals and HRV/SpO2 sample types. These are concrete connector expansion leads. They describe HRV as sleep physiology, so this is not evidence of daytime beat-to-beat availability. Query sample HRV and SpO2, preserve sources/time and inspect their actual cadence before assuming a daily summary matches Bevel's selected window. [Google sleep data](https://developers.google.com/health/data-types/sleep)

Google's schema provides sample RMSSD/SDNN fields, nightly temperature derivations, and separate overlapping short-awakening intervals. Those distinctions can affect Bevel's inputs. The backend's handling of these raw fields remains unknown; live same-account payloads are needed. [Google data-point schema](https://developers.google.com/health/reference/rest/v4/users.dataTypes.dataPoints)

These Google pages were checked 2026-10-06 and may postdate this IPA. Current Bevel public settings are also not version-locked code evidence. Do not use current help copy to fill this build's unknown branches. No account/API payloads were inspected during this audit.

### Completeness and remaining trace paths

Added 553 verified fields/cases from 103 additional Swift registries, plus missing existing-model fields: total 1208 ledger entries: 1188 verified fields/cases across 172 Swift registries and 20 manually named derived entries. They do not add 553 scores. New omissions now tracked include aggregate statistics, baseline/configuration windows/histograms, HRV method, stress context/point state, manual/automatic goal and insufficient-data results, weekly age records, pending nutrition, calorie thresholds, workout HR Recovery results, detailed Google integration models and muscular debug source fields.

Newly explicit score families are Daily Nutrition and Muscular Load; newly explicit existing-family outputs are HR Recovery, Sleep Needed and Target Strain. Cardio load's optimal ranges/status/calibration remain distinct logic beyond its EWMA kernel. Other algorithms present include cycle median/phase/temperature prediction, journal regression/insufficient-data outcomes, cardio focus dimensions, strength effective weight/RPE/1RM and health trends. Those are additional algorithm workstreams, not automatically extra scalar score families or proven Air-only features.

Located callers/builders include `HealthDataBaselines.calcMissingAggregates` at `0x10158af94`, HRV history continuations at `0x10166a59c`, `0x10166ab98`, `0x10166b678`, sample-history calculators around `0x1016a1318` and `0x1016a1f98`, RHR baseline around `0x1014ecff0`, Sleep component builder `0x1015c3938`, workout scoring caller `0x100f5a644`, and HR Recovery service `0x1017cd18c`. Names are anchored by nearby source/function strings plus fresh disassembly; an async continuation address is not proof of a whole Swift function boundary.

The resource inventory has 1156 zip entries and 818 selected JSON/localization-type paths. The only JSON filename classes found are phone metadata and app-intents version files; no named Core ML model, CSV coefficient file or bundled SQLite DB was found. Asset catalogs/opaque blobs and remote configuration are not ruled out. English biological-age resources explicitly describe Nutrition Score separately from its input factors. Widget extension strings also locate copies of Recovery, Sleep, Strain, Nutrition, Glucose and MetricSampleHistory calculators. Their arithmetic has not been independently traced; no extra families are counted for copies. Capture extension was screened but not exhaustively reverse engineered. Evidence: `audit/resource-discovery.json`, `audit/resource-selected-evidence.json`, `audit/ipa-manifest.json`.

The whole raw-input-to-presentation path remains partial for **all 18 families**. The machine inventory now records raw inputs, transformations, history, formula/output, null/error behavior, presentation, evidence, unresolved questions and runtime cases per family. Registered vitals, glucose variability/fasting glucose, macro balance, pace/power/cadence/swim/running dynamics, journal and cycle fields still lack complete producer paths; metadata existence is the verified claim. A kernel being found is never a completeness claim.

### Final discovery pass: settings, state and imported scores

A broader model screen added source/context and output-state records that the first audit pass missed. `CalculationsOptions` at `0x105236898` contains hrvMethod, rhrMethod, hrvContext, rhrContext, caloriesDisplay, temperatureSource, sp02Window and rrWindow. `MetricContext` at `0x105236828` lists entireSleep, remDeepSleep, mindfulnessOnly, sleepAndMindfulness and entireDay. These are concrete selection dimensions to match, not proof of a default selected value.

`HealthDataRHRCalculation` at `0x105231e38` separates healthKit/garmin/oura/googleHealth; `IntegrationRHRCalculation` at `0x105231e54` has the sole case bevel. Do not equate Google's daily RHR field with Bevel's selected RHR solely because both are bpm. The configuration factory and aggregate consumer are now traced in section 20. Exact accepted samples, integration source precedence and Google RHR equivalence remain unresolved. `SyncedSpO2Record` at `0x105242b8c` preserves sampleUUID/source bundle/name/product/user-entered metadata; Pulse's HR normalization discards comparable provenance.

`EnergyDayContext` distinguishes day from functionalDay. `LiveEnergyBankState` includes calibrationState, solidData, derived/prototype data and chart bounds. `StressContextHistory` includes sleep/workout/exercise/mindfulness. These are state/preprocessing gaps beyond local rate kernels. `GlucoseScoreState` explicitly lists waitingForData, baselinesCalibrating and complete, so missing and pending outputs need separate reference cases.

Workout build dependencies include pauses, zones, baseline RHR, biological sex, power/distance/elevation, effort, strength sessions and HR. Records distinguish algorithmVersion, cached/calculated and calculated/legacy/recordedOnly states. Reference outputs must identify which producer version made them. `LoadMetrics.epoc` is a time series alongside TRIMP and cardio impacts, not evidence of a separate user-facing EPOC score. Its producer and interpretation remain unknown. Imported `OuraReadinessSummary` is an Oura model, not a recovered Bevel or Air readiness algorithm.

`SleepDebugDataDownloadType` at `0x10526a030` lists sleepStages, sleepingHeartBeats, sleepingHeartRate, sleepingHRV, sleepingRespiration and sleepGoal. Trace its exporter as a route to reference intermediates; enum existence does not prove Air populates every export. Evidence: `audit/final-discovery-models.json`. The broad `audit/remaining-candidate-models.json` queue also contains UI/SDK/imported models; it is not a score count or a claim all its names are untraced Bevel algorithms.

## 19. Next reverse-engineering and parity work

1. Prioritize Google integration: trace sample enum-to-quantity conversion, HRV source/method/context selection, sample/minute-HR coalescing, SpO2 percent/fraction, temperature conversions and sleep-stage merge. Follow async continuations and indirect call slots, not just direct BL. The raw Google adapter lives partly on Bevel's server; same-account normalized Bevel export/debug records are necessary to resolve that boundary.
2. Trace baseline/configuration constructors and consumers: accepted samples, log HRV versus raw HRV, mean/SD definition, histograms, baselineDays, day endpoints and context inclusion. Then follow Recovery/Sleep/Stress builders through defaults and gates. These are high-value parity gaps shared by several families.
3. Finish the sleep-goal estimator, seven-slot bank alignment, HR dip/efficiency/continuity producers, eligible consistency-day masks and DST behavior. Identify whether Google short awakenings were merged server-side.
4. Trace daily TRIMP, cardio targets/calibration/status, workout/passive/muscular allocation and cardio-derived per-muscle loads. Then follow HR Recovery's zone-four gate and supplied sample interval. This resolves the two new Air algorithm leads before deciding lifting data is required.
5. Complete Energy Bank initial seed, gap/context/day updates and history persistence. Trace Biological Age weekly source records, optional-group weighting, missing-factor normalization and overlap. Do not port a sum of hazard deltas as the whole age model.
6. Finish daily Nutrition combination and TDEE history/profile construction, then meal/glucose/quality inputs. Audit patch initializers/hook targets and compare a legitimately obtained pristine matching executable and widget copy. This is essential to separate package-specific behavior from original-build behavior.

For parity, freeze this executable hash, version/build, settings, profile, time zone, source priority and history snapshot. Record algorithmVersion and cached/legacy status, supplied raw inputs and Bevel's normalized intermediates where available, then score/contributors, calibration/reason state, chart trajectory and displayed rounding. A screenshot alone lacks intermediate inputs and cannot isolate formula errors. The user's current Bevel version may differ from 3.1.7; results from another build must be labelled separately.

For each family use the reference cases in `score_families[].reference_cases`. At minimum:

| Family group | Required reference examples beyond a happy path |
|---|---|
| Recovery | Cold-start and stable history, each missing vital/sleep setting, zero variance, units and adverse oxygen/temperature; compare six intermediate components. |
| Strain/Cardio Load/Target Strain | Identical timestamped HR/zones/steps/workout boundaries; sparse gaps, true-rest versus missing days, long calibration history, target range/status; preserve seconds versus minutes. |
| Sleep Score/Needed/Bank/Consistency | Stage overlaps and short awakenings, missing stages/night, nap/split sleep, goal/settings changes, surplus/debt order, HR dip, age/sex boundaries and DST. |
| Stress/Energy Bank | HR CDF and selected HRV/context, absent or stale HRV, raw versus display stress; multi-day energy trajectory with known initial state, gaps and rollover. |
| Biological Age | Weekly update and optional factor/group subsets, every demographic bucket, confidence count/freshness boundaries, equivalent unit conversions and projection dates. |
| HR Recovery | Zone-four threshold, workout cessation, supplied sample interval/cadence, 120-second boundary, within-workout versus post-workout pairs, empty/negative recovery and multiple workouts. |
| Muscular Load/Freshness | Cardio-only with no lifting logs, empty history/calibration, muscle allocation, one logged session, customized capacities and status thresholds. |
| Food Glucose/Quality/Daily Nutrition | Known meal/glucose traces, delayed data/pending state, 19/20 observation gate, unit conversions, excluded contributors, no/partial food intake and calorie threshold. |
| TDEE | B/E/X independently absent, exactly zero/nonfinite history, 80% supplied coverage, known profile/birthday, macro units, half-rounding boundary and late source updates. |

Build isolated experimental implementations and compare local kernels first, then each normalized input, then stateful output. Include holdout histories from the same source and build. Arithmetic tolerance must reflect native float32/64 operations; eligibility, reason/calibration states, clipping branches and day assignment should match exactly. Agree tolerances from reference precision before validation, not after seeing errors. Replaying future data must not silently change prior Pulse history; if Bevel does revise it, record a deliberate compatibility decision. Pulse's per-user isolation, nullable reason states and strain scale remain constraints for any later migration.

The current evidence supports experiments and a concrete Fitbit connector parity investigation. It does not support changing a production Pulse scorer today. There are no Bevel input/output pairs, no validated complete path, and no pristine-binary comparison. This is a reproducibility gap to close, not a claim that Air cannot produce Bevel's outputs.


## 20. Follow-up tracing of surrounding logic

This pass closes local gaps in baseline configuration, aggregate statistics, automatic sleep goal and Energy Bank. It does not establish runtime parity. "Unresolved" means the evidence has not established a claim, not that code is absent from this IPA or that Bevel cannot produce an Air score. No remaining local path below is classified server-only merely because it uses async or indirect calls.

### Baseline configuration and population statistics

The default map constructor `0x10158c980` calls configuration factory `0x101e23994`. `CalculatedMetric` metadata at `0x105246bd4` identifies the enum tags; `BaselineConfiguration` at `0x105246bb8` identifies configuration, baselineDays and computeHistogram. These are recovered **defaults**, not proof that every caller uses them unchanged.

| Metric | Default days | Aggregation | Window / context |
|---|---|---|---|
| Average HRV | 60 | Combined samples | Midnight to midnight |
| Resting HRV | 60 | Daily means | HRV context setting, table below |
| Respiratory rate | 60 | Combined samples | rrWindow byte 1: midnight; otherwise sleep session |
| Resting HR | 60 | Combined samples | RHR context setting, table below |
| Inactive HR | 60 | Combined samples | Midnight to midnight, awake context, histogram enabled |
| Wrist temperature | 30 | Daily means | Midnight to midnight, useEndTime true |
| Body temperature | 30 | Daily means | Sleep start to sleep start, useEndTime true |
| SpO2 | 60 | Daily means | sp02Window byte 1: midnight; otherwise sleep session |
| Food glucose AUC, peak, delta | 60 | Combined samples | Factory default midnight window |

Sleeping HR has a separate factory branch: combined samples, sleep start to sleep start, sleep contexts. It is excluded from the default metric enum list constructed at `0x101e23614`, so this pass does not assign it an invented default day count. Histogram is false in the other default rows above.

`CalculationConfiguration.windowType` is an **array** of WindowType, not a scalar. `contexts` is an optional array of context groups. This comes from symbolic type references and metadata, not only field names. Window tags are 0 midnightToMidnight, 1 sleepSession, 2 sleepStartToSleepStart. SampleContextType tags are 0 otherSleep, 1 remAndDeepSleep, 2 workout, 3 mindfulness, 4 awake, 5 exercise.

The HRV and RHR context options share the following lookup, with different aggregation methods. Both factories select a single-element window array using `[1,1,0,2,2]`, and read context groups from pointer table `0x106115818`.

| MetricContext setting | Window | Allowed context group | forceIncludeMindfulness |
|---|---|---|---|
| entireSleep | Sleep session | otherSleep, remAndDeepSleep | false |
| remDeepSleep | Sleep session | remAndDeepSleep | false |
| mindfulnessOnly | Midnight to midnight | mindfulness | false |
| sleepAndMindfulness | Sleep start to sleep start | otherSleep, remAndDeepSleep | true |
| entireDay | Sleep start to sleep start | All six contexts | false |

The consumer now traces forced mindfulness from the original supplied array, outside the time slice, as described below. Do not describe the stored sleepAndMindfulness group as already containing mindfulness.

Aggregate consumer `0x1015bab50` branches on aggregation method. Daily mode calls sample/window selector `0x1015b9fbc` for each supplied functional day, skips empty results and per-day errors, computes a Float32 arithmetic daily mean, then aggregates those daily means equally. Combined mode passes the first supplied functional-day/window argument to the selector and aggregates its selected sample array. It is not established that this argument spans all baselineDays; the upstream window builder must prove that.

Statistics helper `0x10183bdc0` skips nil values, sums Float32 values and computes:

```text
mean = sum(x) / n
sd = sqrt(sum((x - mean)^2) / n)
```

The divisor is **n**, not n-1. Empty input returns nil mean, SD and count. One value yields SD zero. There is no zero-value, nonfinite, Winsorization or outlier rejection test in this statistics helper. Upstream filters remain possible. Helper `0x101dc3358` boxes supplied floats into optionals; its scratch filename `baseline-filter-helper.asm` does not establish filtering.

For `[2, nil, 4]`, this arithmetic gives mean 3 and SD 1. If two days have samples `[1,3]` and `[10]`, daily mode gives mean 6, SD 4, count 2; combining the three samples gives a different mean. Pulse [baselines.ts](../../src/core/scoring/baselines.ts) instead folds prior-night values with Winsorized EWMA and an absolute-deviation spread floor. Substituting Bevel's score formula while retaining that baseline would change the normalized inputs.

Remaining: source precedence, raw versus log HRV selection, functional-day timezone/endpoints, accepted sample windows, duplicate rejection, histogram bins, overrides, calibration and historical causality. The factory does not prove these.

Evidence in ZIP: `audit/deep/baseline-map-constructor.asm`, `baseline-config-dispatch.asm`, `baseline-per-window-builder.asm`, `aggregate-statistics-kernel.asm`, `fn-0x1015b9fbc.asm`, `raw-configuration-bytes.json`, `model-descriptors.json`. [Machine tables](bevel-verified-tables.json) key `baseline_configuration` records exact branches. Raw bytes include VA and Mach-O file offset.

### Automatic sleep goal

Async entry `0x101d78fbc` materializes continuation `0x101d79054`, then calls swift_task_switch. This explains why an ordinary direct-BL caller search misses it. The input type resolves to an array of `(primarySleep: SleepSession?, recovery: RecoveryMetrics?)`.

For positive finite durations, the recovered path is:

1. Skip a record without primary sleep, recovery or recovery score.
2. Sum available Float32 `secondsInSleepStage` entries across all six stage tags except awake (tag 1). The loop **does include inBed (tag 5) if supplied**. Upstream construction must establish whether this entry exists or overlaps asleep stages.
3. Keep the first at most 90 eligible `(recoveryScore, seconds)` pairs in supplied order. Helper `0x101d72cb8` takes a prefix; it does not sort.
4. Sort that prefix by recovery descending. Comparator region `0x101d744dc` and driver `0x101d72880` establish direction.
5. Select `k = trunc(Float64(n) * 0.15)` pairs and average their seconds in Float32. At n=90, **k=13**, not 15.
6. Round mean seconds to the nearest integer, ties away from zero (`0x1030d5a84`), add 30, then integer-divide into hours/minutes. For positive durations this implements rounding to minutes after the prior second rounding.
7. Independently count supplied nonmissing recovery scores at least 67 (`0x42860000`) across the original input using `0x101d78d04`. This count does not require primary sleep and is not restricted here to the selected top 13 pairs.
8. Zero qualifying high recoveries returns failed. Otherwise return sufficientData when prefix n>=90 and high-recovery count>=15, insufficientData otherwise. A zero-size selected set fails through the nonfinite mean/conversion path. Overflow trap paths also exist.

The result enum at `0x105244a64` distinguishes sufficientData, insufficientData and failed. An insufficient result can carry a computed hours/minutes value; which state the UI displays or falls back from still requires tracing.

This is an estimator within Sleep Needed, not a nineteenth score family. Do not call the prefix "the last 90 calendar days" until its producer establishes ordering and span. Equal-score sorting, stage construction, manual/automatic setting transitions and recovery preprocessing used for calibration also remain unresolved. The synthetic tests exercise positive finite inputs; they do not execute the app.

Pulse [sleepPlanner.ts](../../src/core/algorithms/sleepPlanner.ts) consumes a baseline need, adds strain/debt, subtracts naps and estimates wake time/efficiency from 14 nights. It does not implement this goal selection/confidence path. Planner arithmetic and goal calibration must be compared separately.

Evidence: `audit/deep/dynamic-goal-calculation.asm` at `0x101d794b0-0x101d797c8`, `dynamic-goal-top-sort.asm`, `dynamic-goal-sort-comparator.asm`, `dynamic-goal-number-conversion.asm`, `dynamic-goal-duration-selection.asm`, `model-descriptors.json`. [Machine tables](bevel-verified-tables.json) key `dynamic_sleep_goal`.

### Energy Bank input builders and clipping

Input entry `0x10154152c` leads to window/source builder `0x10153f504`, HR interpolation `0x10154062c`, stress representation builders `0x1015e493c` and `0x1015e457c`, and point assembly `0x101538478`. The HR builder contains a branch averaging two available neighboring HR values using 0.5 at `0x101540f8c-0x101540f90`; this is not proof of every gap or boundary rule.

Input-builder return continuation `0x101543618` stores the point array at async frame+0x9f0. At `0x101543678` it materializes update continuation `0x101543698` and reaches swift_task_switch. The missing direct BL edge was an indexing limitation, not evidence of an absent caller.

Finite updates clamp the new level to 1-100. Pulse [energyBank.ts](../../src/core/algorithms/energyBank.ts) clips 0-100 and starts at wake from `.6*recovery + .4*sleepPerformance`; Bevel's complete seed is still unresolved. The initial state cannot be borrowed from Pulse and labeled a matching port.

Prototype helper `0x101541440` creates empty debug arrays labeled Stress, HeartRate and NormalizedHeartRate. Those labels do not establish fabricated measurements. An async relative descriptor at `0x104f93330` resolves to `0x10158cd6c`, with argument 30 at `0x1015432a0` and downstream calendar date addition at `0x10158d318`. Its complete role is still being traced; neither a 30-day goal history nor an energy seed is claimed from that argument alone.

Evidence: `audit/deep/energy-input-builder.asm`, `energy-source-window.asm`, `energy-hr-interpolation.asm`, `energy-point-assembly.asm`, `energy-prototype-source.asm`, `energy-continuation-and-clamp.asm`, `energy-sleep-goal-history-query.asm`. [Machine tables](bevel-verified-tables.json) key `energy_update_surroundings`.

### Other paths and outstanding work

A wider string-reference search located daily strain producer `0x1015dc638` via calculateDayStrainScore at string VA `0x10591c9d0`, and cumulative checkpoint entry `0x1015ec700` via calculateCumulativeMetricsFromCheckpoint at `0x10591cb80`. Its local cumulative helper `0x1015efbc4` writes the CumulativeMetrics target-range field at output+8. Target-range history and adjustment kernels are now recovered below. Load calibration and muscular allocation remain partial.

The follow-up gap ledger covers all 18 families. Existing verified kernels remain in the earlier sections and machine inventory.

| Family | Remaining path work | Why it matters |
|---|---|---|
| Recovery | Accepted vital samples, integration precedence, history/endpoints, caller gates | Equal formulas can receive different z-scores or return different availability |
| Strain | Exercise/passive/workout allocation, interpolation/gaps, current-day coverage | Determines which seconds and steps contribute |
| Sleep Score | Primary-session/stage construction, continuity, missing component builders | Stage overlap and absent components change weighting |
| Stress | HR distribution bins, HRV freshness/context selection, displayed smoothing | Raw stress and displayed stress can differ |
| Energy Bank | Seed, gaps/rollover, calibration, persistence, all interpolation branches | A trajectory depends on prior state and accepted points |
| Biological Age | Weekly source selection, optional groups, overlap and normalization | Factor kernels are not the composite |
| Cardio Load | TRIMP construction, checkpoint priming, gaps, range/status calibration | EWMA constants alone do not determine the load |
| Muscular Load | Cardio-derived producer, muscle allocation and range/status | Air branch exists as a lead; complete behavior is unproved |
| Muscular Freshness | Raw fatigue producer, calibration dates, source allocation | Zero loads and incomplete history may look artificially fresh |
| Food Glucose | CGM/meal window completion, feature baseline and distribution | Requires other-source data and has pending/calibrating states |
| Food Quality | Food/category normalization, exclusions and upstream portions | Inputs are richer than Air sensing or macro rollups |
| Daily Nutrition | Full contributor combination, pending food, calorie thresholds | It is distinct from food-quality scoring |
| TDEE | Personalized weight/history, activity coverage, fallback selection | A numeric fallback does not establish personalized parity |
| Sleep Bank | Seven-slot day alignment, missing nights, goal changes | Signed totals depend on the correct dates and goal |
| Sleep Consistency | Epoch grid/masks, timezone/DST, accepted day pairs | Pair arithmetic alone cannot reconstruct inclusion |
| Sleep Needed | Goal history ordering/stages/settings, latency/efficiency, naps | Estimator is recovered, whole recommendation remains partial |
| Target Strain | Seed calendar inclusion/order, checkpoint/calibration, upstream recovery and presentation | Range arithmetic is recovered; supplied histories and gates determine parity |
| HR Recovery | Workout-end slice, zone-four gate, gaps/source eligibility, display | Same maximum-drop kernel can receive a different interval |

These local gaps can still be researched from this IPA. Backend Google raw-field conversion is a separate boundary: the IPA's DTO mapper proves what the client accepts, not all transformation performed before the server response. Historical user state, remotely supplied settings and authentic same-input output examples require runtime evidence. No local code has been proved absent by these searches.

Patch follow-up found two initialization entries in each added dylib. BevelAIHealthCoachPatch has named HookSurface/Entitlement/Subscription helpers and arithmetic-heavy initializer control flow; blatantsPatch has rebindSecFuncs. This does not establish their full hook targets or that scoring is untouched. Evidence: `audit/deep/patch-initializer-screen.json`, `bevel-patch-init.asm`, `blatants-patch.asm`. A pristine same-build comparison is still needed before attributing supplied-build runtime behavior to the distributed app.

### Counts and parity fixtures after this pass

Counts remain **18 output families, 12 Pulse counterparts, 11 mapped-core candidates plus one partial Biological Age composite, two additional cardio-only muscular research leads, four additional-input families**. Baselines, automatic goal, context options, stage tags, interpolation and checkpoint helpers are internal paths within existing families. They add zero families. Full strength and age data gaps overlap those categories. Zero complete new Air algorithms, zero runtime-validated replicas and zero production-parity replacements are established.

New required fixtures: exact accepted baseline values and per-day groupings, unequal daily sample counts, nil/zero/zero-SD/nonfinite cases, all five HRV/RHR contexts, window changes and DST; automatic-goal original input ordering, stage dictionaries including inBed, 89/90 eligible pairs, 14/15 recoveries >=67, equal recovery ties and second/minute rounding boundaries; Energy trajectories with known seed and points crossing levels 1 and 100, empty points, missing-neighbor interpolation, long gaps and day rollover. Save settings/profile/source IDs, intermediate arrays, baselines and unrounded outputs alongside displayed values.

Nineteen synthetic arithmetic checks passed in `audit/deep/recomputations.json`. They validate the transcription on the stated finite inputs, not ARM64 execution, equal-score sorting or Bevel runtime parity. New evidence is indexed by `audit/deep/manifest.json`, with file hashes and instruction bounds. Direct tail branches and selected async continuation references supplement the earlier BL index; a full indirect-call graph is still not recovered.


### Additional continuation: Target Strain range recovered

Target Strain is no longer arithmetic-unknown. `CumulativeMetrics` metadata at `0x1060b94a0` supplies field offsets `[0,4,8,24,32,40,56]`; targetStrain is the optional pair at +8. Caller `0x1015eff24-0x1015eff48` passes its history through `0x1016e233c` and optional current recovery through `0x1016e2394`, saves the two returned floats and writes them to that field at `0x1015f0750-0x1015f0774`.

```text
B = first supplied history value, or 0
for each supplied value, including first:
    B = Float32(.75*B + .25*(value or 0))

if recovery R exists:
    center = B * (1 + .6*(R-50)/100)
else:
    R = 50
    center = B

low  = clamp(center - 5 - 5*(R/100), 20, 120)
high = clamp(center + 10 + 20*(R/100), 40, 120)
```

Empty history folds to 0. Nil history entries decay the fold; they are not omitted. Width offsets use R/100 computed in Float32, widened to Float64, multiplied by coefficients 5/20 then narrowed to Float32. Center uses stored Float32 0.6. Vector comparisons clip the bounds; no input recovery clip or NaN sanitization is present in this helper. Equations above describe finite inputs.

For B=60, R=50 or missing gives `[52.5,80]`; R=100 gives `[68,108]`; R=0 gives `[37,52]`. Empty history and missing recovery give `[20,40]`. These are the supplied history's strain units; no 0-21 display conversion is established.

Seed helper `0x1015eecc0` subtracts 14 calendar days at `0x1015eefe4`, generates dates and looks up optional history. The cumulative caller calculates the range before appending the current value, with a count>=15 removal branch. Exact seed endpoints, generated-date ordering, checkpoint replay and display remain partial. The recovery role is anchored by the named function's parameter order: async entry `0x1015ec374` stores x4 in frame+0x298; the caller passes it as the recovery dictionary. Do not infer that it equals Google's raw daily recovery or Pulse Recovery.

Pulse [strainTarget.ts](../../src/core/algorithms/strainTarget.ts) uses a 28-day nonmissing mean, 14-valid-day cold gate, band multipliers and ACWR adjustments on 0-21. Bevel's local range helper has a different continuous recovery adjustment and finite bounds. It does not use an ACWR argument; this does not exclude caller gating elsewhere.

Evidence: `audit/deep/target-strain-history-summary.asm`, `target-strain-recovery-kernel.asm`, `target-strain-table-bytes.json`, `checkpoint-input-frame-region.asm`, `checkpoint-seed-window.asm`, `cumulative-load-aggregation.asm`. Scratch file `target-strain-local-kernel.asm` actually contains a sort driver at `0x1015e8ac0`; its filename is not formula evidence.

### Additional continuation: baseline date/context selector recovered

Selector `0x1015b9928` binary-searches the supplied array using sample startDate or endDate according to useEndTime. Comparisons `>= start` and `>= end` select **[start,end)** when the array is sorted by the chosen timestamp. This selector does not check that sorting invariant.

With no context groups, the time slice is retained. With groups, it tries groups in order, keeps samples whose stage matches a member, and stops at the first nonempty group or final group. These are fallback groups, not a union of every group. An empty supplied group array yields no selected samples.

When forceIncludeMindfulness is true, the selector scans the **original supplied array** for mindfulness stage tag 3 and appends those records after time/context filtering. Append helper `0x1017e4674 -> 0x1017e88b4` copies arrays; it performs no deduplication or timestamp check. Thus this branch can include mindfulness outside the time slice if it exists in the supplied original array. Upstream array contents still limit the dates available. If an override already includes those samples, duplication needs a fixture rather than an assumed set union.

The window consumer then reads HealthQuantitySample.doubleValue and narrows Float64 to Float32 at `0x1015ba98c-0x1015ba9b8`. It does not log-transform, convert units or reject outliers/nonfinite values at that point. Such transformations may happen earlier. Field metadata at `0x105232480` identifies HealthQuantitySampleWithStage(sample,stage,source), with HealthQuantitySample at `0x105277e38` supplying doubleValue/startDate/endDate.

Remaining shared-baseline work narrows to original sample construction and source precedence, functional-window generation, sorting invariant, histogram construction, calibration and overrides. New fixtures must put mindfulness before/inside/after a sleep window, use start/end timestamps on both boundaries, provide multiple fallback context groups, and compare duplicate UUIDs. Evidence: `audit/deep/baseline-sample-selection.asm`, `fn-0x1015b9fbc.asm`, `baseline-mindfulness-union.asm`, `baseline-context-append-consumer.asm`.
