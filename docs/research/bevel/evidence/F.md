# Agent F findings: Biological Age (M06), Muscular Load (M08), Muscular Freshness (M09)

Conventions. Addresses are VAs in `Superset`. Decompiler references are `decomp-main/<shard>:<line>` (line of the `// ====` header). Scratch tools are in `/Users/adityajindal/bevel-re/work/F/`.
The decompiler drops `fmaxnm`/`fminnm` clamps and mislabels Swift comparison stubs. Stubs at `0x104e57d6c/78/84/90` are `>`, `<`, `>=`, `<=` (verified with `otool -Iv`: `$sSL1goiy`, `1loiy`, `2geoiy`, `2leoiy`). Every boundary quoted below was re-read in assembly (condition codes named in the text).
Date maths: `FUN_1030cbe4c(d,n)` = d minus n days; `FUN_1030cc894(d,n)` = d minus n years (calendar); `FUN_1030c92c8(d,1)` = d plus 1 week; `FUN_1030ca614(d,1)` = start of week with `firstWeekday = 2` (Monday); `FUN_1030cf508(a,b)` = calendar day difference.

---------------------------------------------------------------------
## BIOLOGICAL AGE

### Architecture (all local, one service)
```
BioAgeRecalcService (100585890 …, triggers: dataLoad, journal, document, smoking, profile; debounced AsyncStream; BioAgeRecalcTrigger{fromDate | full})
  -> BioAgeService.recalculateFromDate / recalculateAll   (strings "Superset/BioAgeService+Recalculation.swift")
     -> 100591080 (date,isFull) -> 1005910fc (week list) -> 1005914c8 -> 100591694 (loop head)
         for every weekStart W:
            async let physio  = 100592cac -> 100572fa4 (9 factors)   -> (Dp, Cp)
            async let lifestyle = 100592dd4 -> 1005718ac (3 factors) -> (Dl, Cl)
            async let blood   = 100592ef4 -> 100570cf4              -> (Ab?, Cb?)
            combine 103c41698(A, Dp, Cp, Dl, Cl, Ab, Cb, bloodNil)    -> AgeEstimate(age, confidence)?
     -> 100592170/100591ff4 flatten arrays -> persistBioAge (100564c18 ...): PhysioMetricDeltaYears / LifestyleMetricDeltaYears rows + derived score (WeeklyBioAgeData: weekStart, chronologicalAge, bioEstimate, physio/lifestyle breakdowns, bloodEstimate, bloodCompleteness, bloodFreshness, biomarkerSamples)
```
Preconditions in the loop head (`100591694`, asm): effective sex via protocol (`FUN_1005915c8`): `BiologicalSex` raw 0 male, 1 female, 2 other/missing; 2 => log "Effective sex is missing. Skipping bio age calculations." and return. Birthday nil => "Birthday is missing. Skipping bio age calculations." isMale flag = (sex byte == 0) (`cset w26, eq`).

### M06.01 — RESOLVED (local arithmetic); one bounded exception stated below
**Which factors exist when only wearable data exists.** There is no factor selection or renormalisation step. Nine physiological factors are always evaluated, in iteration order `[0,1,2,3,4,5,7,6,8]` (array at `0x1061ff138`). Each yields a `PhysioMetricDeltaYears` record `(kind, metricValue?, hazardRatio?, deltaYears?, confidence, validDays, rangeSegments)` (`1005736f0`). A factor with no data has `metricValue/hazardRatio/deltaYears = nil` and confidence 0. The composite then uses:
```
Dp = sum of non-nil deltaYears over the 9 records            (100576cfc: plain add loop, missing = contributes 0)
Cp = mean(confidence) over ALL 9 records, nil ones included  (103c45990)
Dl, Cl identically over the 3 lifestyle records (100572d38, 103c4496c)
```
No renormalisation of Dp for missing factors, and no overlap/correlation correction: the sums are plain additions (see M06.02). Missing factors lower only the confidence mean.

Physiological factor definitions (`1005736f0` dispatch; kinds are the tag byte `*(x22+0xd9)`). Window for every factor: D = weekStart W; 28 calendar days `W-28d … W-1d` (see M06.02 for the exact day list).

| kind | factor | producer | daily source (HealthMetric index / BioMetric) | aggregate over window |
|---|---|---|---|---|
| 0 | sleepDuration | `100573e08`→`100573f3c` | HealthMetric 12 `timeAsleepMinutes` | mean of (min/60) over days that have a value |
| 1 | sleepConsistency | `10057445c`→`100574590` | HealthMetric 10 `sleepConsistency` | mean |
| 2 | steps | `100574a94`→`100574bc8` | HealthMetric 25 `steps` | mean (also receives age A) |
| 3 | zone2to3Time | `1005750cc(0)`→`100575204` | HealthMetric 27 `zone2and3Minutes` | sum x 0.25 (= minutes per week) |
| 4 | zone4to5Time | `1005750cc(1)` | HealthMetric 28 `zone4and5Minutes` | sum x 0.25 |
| 5 | strengthTraining | `100575734`→`100575868` | HealthMetric 29 `strengthTrainingMinutes` | sum x 0.25 |
| 6 | restingHeartRate | `100575d48`→`100575e7c` | HealthMetric 1 `restingHeartRate` | mean |
| 7 | vo2Max | `100576380`→`1005763e4` | raw samples, BioMetric key 0 `vo2Max` | mean of samples with `windowStart <= t < D` |
| 8 | leanBodyMass (percent) | `1005766e8`→`10057674c` | raw samples, BioMetric key 6 `leanBodyPercentage` | mean of samples with `windowStart <= t < D` |

Daily sources are a Combine `@Published` dictionary on the service's metrics provider (`keypath DAT_104ef7478/104ef74a0`; value = array indexed by HealthMetric raw index, enum cases value(Float)/…/nil). Raw samples are `@Published` `[BioMetric: [(Double value?, Date)]]` (`DAT_104ef74c0/104ef74e8`). Day = `Calendar.current.startOfDay`.
Day-level loop (all day-based producers, e.g. `100573f3c` lines ~60-150): for each of the days from `FUN_1030e44c0(windowStart, D)`, lookup dict[startOfDay]; take the Float at the metric index; skip when the enum case is "nil"; count++. Result `(mean|sum, isNil = count<1, count)`. Zero valid days => `isNil`.

Hazard and delta (`1005736f0`, asm 100573800-100573818): `x` nil -> hazard nil, delta nil. Else `(HR, hrNil) = 103c4c110(x, age_or_isMale_payload, kindCode)`; if hrNil, hazard and delta nil; else `delta = 10 * ln(HR)` (`fmul d0, d0, #10.0` after `log`). `confidence = min(1, validDays/20)` for kinds 0-6 (asm 100573914-100573928: `fdiv 20`, `fcmp`, `fcsel gt`); for kinds 7 and 8 (`w8 = kind-7 <= 1`) confidence = `x != nil ? 1 : 0`. No lower clamp on count (counts are non-negative). The per-factor kernels were re-verified against the binary (constants read from data, clamps from assembly):

| factor | hazard before clamp | clamp | notes |
|---|---|---|---|
| sleepDuration `103c4a8c8` | `exp(0.05*(x-7.5)*(x-9))` | [0.9802, 1.24608] | hours |
| sleepConsistency `103c4a46c` | `exp((70-x)*s)`, s=0.007 if x>70 else 0.015 (`10512f110/118`) | [0.74082, 1.16183] | |
| steps `103c4adf0` | `(clamp(x,1,cap)/target)^-0.26` | [0.90484, 1.24608] | age < 60 (`fcmp d1,60; mi`): target 8000, cap 10000; age >= 60: target 6000, cap 8000 |
| zone2to3 `103c4ba38` | `0.75 + 0.46*exp(-x/246)` | [0.74082, 1.10517] | args 0x3fe8.., `104ec0090`=0.46, 246 |
| zone4to5 `103c4bda4` | `0.95123 + 0.08041*exp(-x/20)` | [0.95123, 1.03045] | |
| strength `103c4b2a4` | `0.827 + 0.3348*exp(-x/15.14)` | [0.84366, 1.10517] | |
| RHR `103c4a050` | `exp(0.012*(x-ref))` | [0.63763, 1.2214] | ref from RHR table |
| vo2Max `103c4b610` | `max(0.3, exp(0.038*(ref-x)))` | [0.60653, 1.28403] | |
| leanBodyMass `103c49af8` | z = (bfMean-(100-lean))/bfSD; z<0: `1+0.12 z^2`; else `1-max(0,0.005*(A-35))*z`; SD<=0 -> 1 | [0.95123, 1.49182] | |

Reference tables, re-read from the binary:
- RHR (`103c466b0`, rows `[lower,upper): male/female`): [0,26) 61/65; [26,36) 61/64; [36,46) 62/64; [46,56) 63/65; [56,66) 61/64; fallback male `0x404f..`=62, female 64.
- VO2 (`103c467ac`): [0,20) 48/37.6; [20,30) 48/37.6; [30,40) 42.4/30.2; [40,50) 37.8/26.7; [50,60) 32.6/23.4; [60,70) 28.2/20; [70,80) 24.4/18.3; fallback 24.4/18.3.
- Body fat (`103c468f0`): [0,20) M 17/7.78 F 30/6.82; [20,40) 21.2/6.82, 32.5/7.71; [40,60) 25.2/5.19, 36.4/6.45; [60,80) 27.3/5.26, 38.9/5.41; fallback M 27.3/4.89, F 36.9/5.56.
- Lookup `lower <= A < upper`, rows scanned in order; male selected when `isMale & 1`.

Lifestyle (kinds 0 nutrition, 1 alcohol, 2 smoking; iteration order from `FUN_1038c6178`; `1005718ac`/`100571a30`/`100571f28`/`100572904`):
- nutrition (`10056fdd8`): mean over the same 28 days of the daily nutrition score (separate `@Published` dict `DAT_104ef72a8/72d0`, value case 1 = present), nil if none. Hazard `clamp(0.96^((x-50)*1.1/10), 0.79, 1.27)`; confidence `min(1,count/20)`.
- alcohol: see M06.04.
- smoking: see M06.04.
Lifestyle record: `deltaYears = 10*ln(HR)` same as above; confidence for nutrition `min(1,count/20)`; alcohol/smoking per M06.04.
Smoking record `metricValue` for display = `clamp(10*ln(HR)/5.007752879124892 * 100, 0, 100)` (`103c496f4`; constant is 10*ln(1.65)).

**Composite (`103c41698`, asm verified)**, A = (W - birthday)/31557600 s (`100591980`, divisor 365.25 d):
```ts
function combine(A, Dp, Cp, Dl, Cl, Ab, Cb, bloodNil) {
  const w = Math.max(A, 30);                         // fmaxnm (dropped by the decompiler)
  const bloodW = A < 50 ? 0.3 + 0.4*(w-30)/20 : 0.7; // [0.3, 0.7]
  const otherW = A < 50 ? 0.7 - 0.4*(w-30)/20 : 0.3;
  const effBlood = bloodNil ? 0 : bloodW*Cb;
  const effOther = otherW*(0.7*Cp + 0.3*Cl);
  const total = effOther + effBlood;
  if (total <= 0) return null;                        // fcmp d17,#0; b.le
  const conf = (Cl + Cp + (bloodNil?0:Cb)) / 3;
  if (conf <= 0) return null;                         // fcmp d8,#0; b.le
  const age = ((A + Dp + Dl)*effOther + (bloodNil?0:Ab)*effBlood) / total;
  return sanitize(age) ? {age: clamp(age,0,150), confidence: conf} : null;   // 1038cd3b8 NaN -> nil, else clip [0,150]
}
```
`Ab` and `Cb` are zeroed when `bloodNil`. This matches the earlier doc except the A<30 case (weight 0.3, not below).
With wearable-only data: blood nil, Cl is 0 if there is neither nutrition nor alcohol nor smoking record confidence (alcohol and smoking confidence rules in M06.04). `conf` still > 0 whenever Cp > 0.

**Blood path (`100570cf4`)**: `100551dc8` fetches `(Biomarker -> sample)` for the nine PhenoAge markers (remap table `0x104ef6bb2` PhenoAgeBiomarker -> Biomarker raw index: albumin 53, creatinine 50, glucose 69, ALP 55, lymphocyte % 47, MCV 20, RDW 24, WBC 40, hsCRP 34) with two dates D and D-365d (`100551e4c`: `FUN_1030cbe4c(out, 0x16d)`) via GRDB (`ConfirmedBiomarkerSampleRecord`). One sample per marker results (the dictionary is built with `Dictionary(uniqueKeysWithValues:)`, `100bbd2ec`). Then (`100570d98`, asm verified):
```
(phenoAge, usedSamples) = 103c44c7c(samples, A)       // unit conversion 103c4532c, PhenoAge regression 103c456d8
if usedSamples == nil -> nil
fresh = mean freshness over usedSamples (103c43d64)
cover = sum(weights of markers with calendarAge(collectedAt vs D) < 366) / sum(all 9 weights)   (103c4443c, 103c447d4: cmp x0,#0x16e; signed lt)
conf = cover >= 0.95 ? fresh : 0                    // fcmp d0,0.95; b.ge  (asm 100570e1c-e2c)
if conf <= 0 -> nil else AgeEstimate(sanitize(phenoAge), conf)
```
Freshness tiers (`103c43680` asm, days n = calendar days from collectedAt to D, unsigned compares): n <= 90 -> 1.0; 91..180 -> 0.75; 181..272 -> 0.5; 273..365 -> 0.25; >= 366 or future (wraps unsigned) -> 0.
Coverage weights re-read from `0x1051300d8` (marker order albumin, creatinine, glucose, ALP, lymph%, MCV, RDW, WBC, hsCRP): 1.4448, 0.684, 0.99603, 0.133, 0.36, 2.412, 4.2978, 0.3601, 0.15354037684621316. These match the earlier table.
PhenoAge coefficient table `0x106219e10` (32-byte records marker id, unit code, coef, logFlag), re-read: albumin -0.0336 (unit 6); creatinine 0.0095 (11); glucose 0.1953 (10); hsCRP 0.0954 (1, log=1); lymph% -0.012 (24); MCV 0.0268 (22); RDW 0.3306 (24); ALP 0.0019 (16); WBC 0.0554 (20). `L = -19.9067 + 0.0804*A + sum(coef*marker)`, `M = 1 - exp(exp(L) * -1.51714167042929 / 0.0076927)`, `phenoAge = 141.50225 + ln(-0.00553 * ln(1 - M)) / 0.090165` (constants at `0x105142dd8..e08`).
Blood query predicate (extracted from the GRDB expression tree built in `100557580`, operator small-strings `0x3d3c` "<=" and `0x3d3e` ">=" at `102fee804`/`102fee870`; dates built in `100551dc8/100551e4c`):
```sql
-- tables health_document (HealthDocumentRecord: deletedAt col 3, date col 6) JOIN confirmed_biomarker_sample
WHERE document.deletedAt IS NULL
  AND document.date IS NOT NULL
  AND document.date <= :D                      -- D = weekly date W (Monday 00:00); a test dated in the current week is therefore excluded until next week
  [AND document.date >= :D - 365d]             -- optional lower bound; weekly path passes D-365d, and the blood banner path `100457e90` also passes now-365d (`FUN_1030cbe4c(date, 0x16d)` then `1005545fc`)
  AND sample.markerId IN (9 PhenoAge marker ids, remapped 53,50,69,55,47,20,24,40,34)
```
Each row is annotated with `collectedAt` (= document.date) and folded into a `[marker: sample]` dictionary where the LAST row wins (`100557484` assign). There is no explicit `ORDER BY date` in the request, so "latest per marker" depends on SQLite's row order (the planner normally walks the `date` index ascending, which makes the last row the latest). Residual: that ordering is planner-dependent and was not provable statically. Parity rule: take the latest sample per marker with `D-365d <= collectedAt <= D`; freshness and coverage use calendar days from collectedAt to D as above. Note the bound is `<= D` (not `< D`); with W at 00:00 only a test stamped exactly at Monday 00:00 differs.

Evidence: 10059.c:2072 (loop head), 10059.c:1178 (combine call), 103c4.c:1593 (combine), 10057.c:3097 (record builder), 10057.c:1484/3829/2858/3587/4445/5164/3396/4929 (producers), 10057.c:4714 (sum), 103c4.c:4466 (mean confidence), 10057.c:332 (blood), 103c4.c:3096 (freshness).

Corrections to earlier research:
- Old: "Factor preprocessing and overlap remain partial". New: all nine producers, windows, units and confidence counts are recovered; no overlap correction exists.
- Old: exercise denominators "suggest time inputs". New: minutes per week = sum over the 28 day window x 0.25.
- Old: blood age weight clamp `clamp((A-30)/20,0,1)`. Same value, but the code is `max(A,30)` and `A<50`; at A >= 50 the weight is the constant 0.7.

### M06.02 — RESOLVED (weekly history/overlap); overlap correction is NOT IN IPA (proven)
**Week list** (`1005910fc`, `100592fec`, asm):
```ts
X  = userSetting("data_loading.full_metrics_recalculate_window")  // LOCAL, UserDefaults-backed; string enum oneYear..fiveYears via _findStringSwitchCase; nil or unknown -> 0
start = max(now - (X+1) years, fromDate)                          // 1005911a0: Comparable.>= (stub 104e57d84): csel picks now-Ny when it is >= fromDate
firstW = startOfWeek(start) + 1 week
lastW  = startOfWeek(now)                                          // loop condition is `<=` (stub 104e57d90) so the current week IS included
weeks  = [firstW, firstW+1w, ... , lastW]                          // Monday 00:00 local, firstWeekday = 2
```
(CORRECTION, agent B is right that it is local: `1005910fc` calls `FUN_101dce914`, a UserDefaults-backed read, then `FUN_100050e1c` (string-switch enum, 5 -> 0), then `FUN_1030cc894(now, X+1)`. I found no remote-config fetch in that path and have no evidence it is remote. Key string at `0x1058aea60`, case strings `oneYear..fiveYears` at `0x1058aea30..`. Discrepancy to settle with B: my asm subtracts X+1 CALENDAR years (`FUN_1030cc894`, a Calendar.date(byAdding: .year) helper), B reports (option+1)x365 days; the difference is at most a few days of leap years and does not change which week list shape results. Default when unset is X = 0, i.e. one year.) `recalculateAll` passes the earliest date so `start = now-(X+1)y`; `recalculateFromDate(d)` passes `d`. Persisted per week: `WeeklyBioAgeData` (types decoded from descriptor `0x105208e50`).
Per-week input windows: factor window is the 28 days `W-28d … W-1d`. Verified in `FUN_1030e44c0(windowStart, D)`: it takes `C = D - 1 day`, then `FUN_1030e9e04` builds days from noon(C) stepping back one day while `day >= noon(windowStart)` (`Comparable.>=` stub 104e57d84, asm 1030ea40c and 1030ea5a0), so the list is `D-1 … D-28` (28 days), sorted ascending (`FUN_1030db8cc`). Samples (VO2, lean %) use `D-28d <= t < D` (`>=` then `Date.<`, asm 100576550-100576564). Blood window D-365d … D. Alcohol window `[D-28d, D]` with `weeks = daysBetween(start,end)/7 = 4`.
Consecutive weekly windows therefore overlap by 21 days (rolling 28-day windows at a 7-day stride). That is the only "overlap" in the code. The documented "overlap correction between correlated factors": the combination is `A + sum(deltas)` with no pairwise term (asm of `103c41698` and sums `100576cfc`/`100572d38` contain no correlation constants). Not in IPA: the app has no such code path; it may exist only in Bevel's marketing text.
Trigger path (`BioAgeRecalcService`): sources = dataLoad, journal, document, smoking, profile (`BioAgeRecalcSource`), trigger = `.fromDate(Date)` or `.full`; log strings "Algo version is stale at startup. Running full recalculate" and "Somehow finished an initial data load without knowing where we started. Treating as full recalculation." The `fromDate` selection per source was not decoded (only the set of sources, 100581704). After recalculation a CurrentValueSubject emits false (isCalculating flag) and the "New Biological Age Available" banner/reminder logic reads the week records.
Weekly "update boundary": a given W is fully determined by data strictly before W (blood/physio) so reruns within the same week change nothing except new data inside windows.
Projection (display only): `103c419a8`, rate = `clamp(B/A, 0.6, 1.6)` if A > 0 else 0.6 (constant `0x105142dc8` = 1.6); 22 points y = 0..21: `(date+y years, projectedBio = B + rate*y [sanitised, falls back to A+y], chrono = A+y)`; caller `100468328` converts to Float pairs for the chart.
Confidence tier for UI (`103e027dc`, asm): conf <= 0 -> missingData; (0,1/3) low; [1/3,2/3) medium; [2/3,1) high; >= 1 max.

### M06.03 — NOT IN IPA (proven) for a VO2 estimator; availability RESOLVED
Bevel never estimates VO2 max. The factor reads BioMetric `vo2Max` samples only (BioMetric enum: vo2Max, bodyWeight, bodyFatPercentage, rhrBaseline, hrvBaseline, leanBodyMass, leanBodyPercentage, bloodPressureSystolic, bloodPressureDiastolic). Samples arrive through `BioBackgroundQueryService` anchored HealthKit query ("[BIO ANCHOR QUERY]") and from Garmin/Oura/Google Health integrations ("bio data point sourced from …" strings), stored by `BioBodyCompositionDatabaseManager`. Availability rule: at least one sample with `D-28d <= t < D`; value = arithmetic mean; confidence = 1 if any sample else 0 (`1005736f0`: kinds 7 and 8). Nothing else (no run pace/HR formula, no Cooper-type estimate) exists in the binary: no code references a VO2 formula; the only VO2 numerics are the reference table and the hazard kernel above.

### M06.04 — RESOLVED
Body composition: factor input is `leanBodyPercentage` samples (mean in window). Derivation at ingestion (`100595d08`, line ~2539): `leanBodyPercentage = leanBodyMass / bodyWeight * 100` when both exist and bodyWeight > 0; HealthKit bodyFat fraction is multiplied by 100 (type tag 0x23, `100599c54`). No default is substituted: no sample -> factor nil, confidence 0, delta 0. Hazard uses `100 - lean` as body-fat %.
Nutrition: no default; no days -> nil factor, confidence 0.
Alcohol (`AlcoholIntakeResolver.resolve = 103c4c900`, struct `Sources{onboardingDrinksPerWeek:Int?, onboardingCompletedAt:Date?, windowStart, windowEnd, journalDrinksByDay:[ymd:Double]}`):
- Journal drinks per day = (sum of Float alcohol amounts logged that day, from the journal answers via `10056fa24`) / 14.0 (`10056f6c4`, constant 14 at asm 10056f784); only days D-28..D-1 enter the dictionary.
- Aggregate (`103c4d69c`) over sorted journal days: `total`, `sinceOnboarding` (days with ymd >= ymd(onboardingCompletedAt); all days if completedAt nil), `firstDayOnOrAfterOnboarding`, `noneOnOrAfter`, `hasJournal = dict nonempty`, `anyBeforeOnboarding`.
- `within = start <= onboarding <= end` by (y,m,d) (`103c4d994`); `before = ymd(windowEnd) < ymd(onboarding)` (`103c4db88`).
```ts
weeks = daysBetween(ymd(windowStart), ymd(windowEnd)) / 7         // 28/7 = 4
if (onboardingDrinks == nil || (!(within && !anyBefore) && !(before && !hasJournal))) {
   // journal-only path (also the path when onboardingDrinks present but neither case below applies)
   drinks = hasJournal && weeks > 0 ? total / weeks : nil
} else if (within && !anyBefore) {
   pre = daysBetween(windowStart, noneOnOrAfter ? windowEnd : firstDayOnOrAfter)
   drinks = weeks > 0 ? (sinceOnboarding + (onboardingDrinks/7) * max(pre,0)) / weeks : nil
} else /* before && !hasJournal */ { drinks = onboardingDrinks as Double }
```
(case order from asm `103c4c9b0-103c4cb80`: with `onboardingDrinks` nil go straight to the journal path; with it present test `within && !anyBefore` first, then `before && !hasJournal`.) Output flags: `isWithinOnboardingWindow`, `hasJournalEntry`, `isBeforeOnboardingWindow`.
Alcohol factor confidence (`100571f28`, asm 1005722b8-1005723f0, flags `w28` = resolver output: bit0 drinks nil, bit8 within, bit16 hasJournal, bit24 isBefore):
```ts
eligibleBeforeOnboarding = onboardingCompletedAt != nil && !hasJournal && isBefore && windowEnd >= (onboardingCompletedAt - 1 year)  // Comparable.>= stub 104e57d84 with 1030cc894(onb,1)
conf = (drinks != nil && (drinks == 0 || within || eligibleBeforeOnboarding)) ? 1.0 : (hasJournal ? 1.0 : 0.0)
```
The default value used when the user never logs is the profile `drinksPerWeek` ("This value is used for Biological Age unless alcohol is logged in Nutrition or Journal", UI string). No other default.
Alcohol hazard `103c47054`: male slope 0.025 threshold 4, other 0.035 threshold 2 (isMale flag), `clamp(max(1, 1+slope*(d-thr)), 1, 1.28)`, zero drinks -> 1.
Smoking inputs (`103c47b2c` <- `103c48c24` log clipping, `103c49100` accumulation): logs are clipped to the window, then for cigarette periods `avgCigsPerDay = sum(intake/divisor[freq] * days)/sum(days)` with divisor table `0x105130730` = [1, 7, 30, 365] (per day/week/month/year); for vaping `avgIntensity = sum(freqFactor[f]*strengthFactor[s]*days)/sum(days)` with `freqFactor` `0x105130750` = [1.0, 0.7, 0.3, 0.1] and `strengthFactor` `0x105130770` = [0.3, 0.7, 1.0]; durations = days/365.25; years since quit from the quit dates (`1030f8fb8` day difference). Hazard `103c47644`: constants 0.06, 0.05 (cap 0.2), 0.03, -0.75, 0.04 (cap 0.15), 0.015, clamp [1, 1.65] as in the earlier doc (re-verified: constants read at 103c47644). Smoking confidence by months since `smokingBehaviorLastConfirmedAt` per the earlier doc (`103c448e8`; not re-derived here).
Persistence of profile: `BioAgeProfile{id, drinksPerWeek, checkpoint, onboardingCompletedAt, smokingBehaviorLastConfirmedAt, updatedAt, syncedAt}` synced via `api/user-data/v1/biology-profile/push|pull`.

### What is not recovered for Biological Age
- `BioAgeStateController` (@Observable view model, init `103e06384`, class descriptor `0x1052b362c`, plain stored properties: state byte at +0x68, flags +0x78/+0x79; vtable impls `103e06440..103e07458`, metadata accessor `103e07670`). Ownership and wiring recovered: it is the `_stateController` stored property of `BiologyViewModel` (created in the VM ctor `10044abc0`). It has NO logic of its own; it is written from exactly one place, the stream consumer `1004589c0`, via vtable setter slot +0xa0 (`displayState`), after which `100453fc0` refreshes the blood banner (`bloodBiomarkerCardState`) and the VM's `_confidenceSheetData` and `_dropdownData` are updated through the ObservationRegistrar. Start: `100456e40` launches `bioAgeSubscriptionTask` (MainActor Task) -> `100459ed4` -> `100457070`, which builds a Combine pipeline (about 10 publisher/stride type slots, `replaceError`, `eraseToAnyPublisher`), fetches the weekly records (`1005656f0`, request enum of two dates) and profile (`100561470`), and the blood banner stream (`100457e90`: `1005545fc(now-365d)`). Each stream element is a tuple (BioAgeDisplayState, confidence-sheet payload (7 words), dropdown array); the consumer loops `for await` (`1004528f8` = next), checks `Task.isCancelled`, and applies it. Delta status badge (`100448a74`): asm `100448ba0-bbc`: `fabd` then `fcmp d0,0.1; b.mi` (strictly less) -> "in line"; else `bio-chrono > 0` -> older, `<= 0` -> younger (threshold constant `0x104ebf1b0`, years; so a gap of exactly 0.1 is NOT in line). `BioAgeRestrictionState` cases: userUnderAge18, unpaid, onboardingIncomplete, missingAgeOrSex; `BioAgeState.calibrating` and the coaching enum `BioAgeCalibrationReason` (missingMetrics, missingProfile) come from the persisted weekly scores.
  NOT recovered: the closure that maps weekly data + profile + restriction inputs into the element's `BioAgeDisplayState` (the `streamBiologicalAge(for:)` map step); it is a Combine closure reached only through witness tables, and immediate scans for the case strings found no direct constructor. Narrowed unblock path: decode the closure/partial-apply context objects allocated in `100457070`/`100457bb8` (allocObject metadata `DAT_106443ba0..106443bf0` generic args at `DAT_104eed8f0..104eed940`) and follow the `map`/`combineLatest` function pointers they store. Parity consequence is small: the state a user sees is determined by the already-recovered data (weekly record present with confidence > 0, profile fields age/sex, paid/age >= 18, onboarding complete), but exact gating order for calibrating vs blocked remains unverified.
- Blood SQL predicate (see M06.01).

---------------------------------------------------------------------
## MUSCULAR LOAD AND FRESHNESS

### Data model (types decoded from descriptors)
`MuscleRawLoad{strengthRaw: Float, cardioDerivedRaw: Float}` (0x1051fe490); per-day `MuscularFreshnessMetrics{muscleLoads: [StrengthMuscleGroup: MuscleRawLoad]}`; `MuscularLoadMetrics{atl?, ctl?, dailyRaw?: Float}` (0x1051fe644); both live inside `CumulativeMetrics{atl, ctl, targetStrain, workoutImpacts, dailyTrimp, muscularLoad, muscularFreshness}` (0x10523181c; JSON via encode/decodeMuscularLoad; DB migration `B2026_07_16_UpsertMuscularMetrics`). Display models: `MuscularLoadData{atl, displayLoad, optimalRangeStart, optimalRangeEnd, calibrationConfidence, ctlMaturity, trainingDensity, recency, dailyRaw, ratio, status}`; `MuscleFreshness{muscle, freshnessPercent, status, capacity, personalizedCapacity?, observationCount, fatigue}`; `MuscularFreshnessData{muscles, categories, overallFreshnessPercent}`. `LoadStatus` enum order (0x1052b409c): 0 calibrating, 1 detraining, 2 maintaining, 3 peaking, 4 productive, 5 fatigued, 6 overtraining. `MuscularFreshnessStatus`: 0 calibrating, 1 recovered, 2 fatigued, 3 depleted. 22 `StrengthMuscleGroup` cases (index): abductors0 abs1 adductors2 biceps3 calves4 chest5 core6 forearm7 glutes8 hamstrings9 hipFlexors10 lats11 lowerBack12 middleBack13 neck14 obliques15 quads16 rotatorCuff17 shoulder18 traps19 triceps20 upperBack21. Categories: legs0 shoulders1 core2 arms3 chest4 back5.

### M08.01 — RESOLVED (cardio-to-muscular conversion)
Per workout `w` (protocol existential, 40 bytes; slots +0x20 sport byte = `WorkoutActivityType` raw, +0x28 `cardioStrainUnits: Float?` (`WorkoutSummaryScores.cardioStrainUnits`), +0x30 `muscularStrainUnits: Float?`, +0x38 strength sessions):
```ts
cardioMuscularUnits(w) = (w.cardioStrainUnits ?? 0) * F[sport]               // Float table 0x104ec2fac (identical Double table 0x104ec2148)
perMuscle[m]           = w.cardioStrainUnits * F[sport] * frac[sport][m]       // 100085838; only when product > 0
```
Sport factors F (nonzero only; `WorkoutActivityType` indices): indoorWalking(20) .12, outdoorWalking(21) .12, indoorRunning(22) .35, outdoorRunning(23) .35, indoorCycling(24) .30, outdoorCycling(25) .30, handCycling(26) .30, elliptical(28) .25, hiit(30) .45, hiking(44) .35, rowing(52) .40, swimming(55) .25, mixedMetabolicCardioTraining(73) .45, mixedCardio(78) .45. All other types 0 (strengthTraining 66 has 0).
Per-sport muscle fractions (`1000857b4` switch; arrays at the addresses in brackets, Double fractions, sum 1):
- walking 20/21 [0x1060289d8]: quads .30, glutes .25, calves .20, hamstrings .15, hipFlexors .10
- running 22/23 and hiking 44 [0x106028a48]: identical to walking
- cycling 24/25/26 [0x106028ab8]: quads .40, glutes .25, calves .15, hamstrings .10, hipFlexors .10
- elliptical 28 [0x106028848]: quads .30, glutes .25, hamstrings .15, calves .15, hipFlexors .10, core .05
- hiit 30, 73, 78 [0x1060287a8]: quads .25, glutes .20, hamstrings .15, calves .10, core .10, shoulder .10, chest .05, lats .05
- rowing 52 [0x106028958]: quads .30, lats .25, glutes .20, hamstrings .10, biceps .10, core .05
- swimming 55 [0x1060288c8]: lats .30, shoulder .20, chest .15, triceps .10, core .10, quads .10, calves .05
- any other sport: empty map -> no cardio-derived load.
Daily totals: dailyRaw gets `(strength S_w or overlay) + cardioUnits*F` per workout (`10008b9d0`); per-muscle dict is the sum over workouts (`100085b1c` = sum of `100085464` strength dict and `100085838` cardio dict; returns nil when empty).
`cardioStrainUnits` itself (and `muscularStrainUnits`) are columns of `WorkoutSummaryScores` computed in the workout strain pipeline (Strain family, not traced here): hand-off.

### M08.03 — RESOLVED (lifting-data branch)
`StrengthSession` = array in the workout (+0x38) with fields `sets` (array, record offset +0x1c) and `estimatedEffort: Double?` (+0x20). In `10008b9d0`: if `sessions` is empty the workout contributes `muscularStrainUnits ?? 0` (UI "overlay muscular units"); otherwise `S_w = sum over sessions of 1015ad2d4(session)`, ignoring the overlay.
Per session (`1015acb64`, asm 1015acca0-1015acfb0), for each set `s` of exercise `e`:
```ts
rpe   = setRPE(s, sessionEstimatedEffort)               // 103e45650, see below
w[e]  = muscle weights: each primary muscle 1/nPrimary; each secondary muscle 0.5/nSecondary (secondary overwrites if also primary)   // 1015ac7f4
raw[m] += rpe * w[e][m]                                  // fmul d0,d8,d9; no reps/weight/volume term
// after all sets:
L[m] = 100 * atan(raw[m] * k[m] / 150)                   // k from 0x104f93f20 (below), 150 = 0x4062c0.., 100 = 0x4059..
```
Session dictionaries are summed over sessions (`1015ad2d4`) and `S_w = 50.0 * sum_m L[m]` (asm 1015ad6d0 `fmul 50.0`); per-muscle strength raw = `50 * L[m]` (`100085300`, constant 50 at `0x100085300`). `k[m]`: abductors 1.8, abs 3.0, adductors 1.8, biceps 2.0, calves 1.6, chest 3.6, core 3.0, forearm 1.4, glutes 4.0, hamstrings 2.8, hipFlexors 2.2, lats 3.2, lowerBack 2.4, middleBack 3.0, neck 1.0, obliques 2.6, quads 3.6, rotatorCuff 1.2, shoulder 2.4, traps 4.4, triceps 1.8, upperBack 3.4.
Set RPE (`103e45650`, asm): fallback `f = sessionEstimatedEffort ?? 5.0`; if the set's analysis dictionary (offset 0x40, `[String:Double]`) is nil or empty -> f. Else `steLoss_v1` present: `r = 3 + 10*steLoss` else `r = 3`; then if `detectedReps_v1` present: `if |detectedReps - recordedReps| > 5 (recorded nil = 0) -> f`; if absent: `steLoss present ? clamp(max(r,3),..,10) : f`. Clamp `r` to [3,10]. Recorded weight, reps count and equipment never enter muscular load; they enter 1RM/volume stats (doc section 15) only.
Magnitude check: 5 sets x RPE 8 of a single-primary chest exercise gives raw 5*8*3.6/150 = 0.96, L = 100*atan(0.96) = 76.4, strengthRaw = 3820, consistent with the default capacities (4500).

### M08.02 — RESOLVED (producer, display, status path)
Producer (cumulative loop `1015e9840`, day iteration ascending, calls `1015efbc4` once per day with the previous day's state; the same function updates the Cardio Load ATL/CTL and per-workout impacts). Muscular half (asm epilogue 1015f06f8-1015f0798):
```ts
daily = sum over workouts W(day) of 10008b9d0(w)                      // Float
perMuscle = 100085b1c(workouts)                                        // nil if empty -> muscularFreshness nil
muscATL' = 0.25*daily + (prev == nil ? 0 : 0.75*prevATL)             // 0.75 = fmov #0.75
muscCTL' = 0.046511628*daily + (prev == nil ? 0 : 0.95348835*prevCTL)   // 2/43
store MuscularLoadMetrics(atl: muscATL', ctl: muscCTL', dailyRaw: daily), muscularFreshness: perMuscle
```
(0.046511628 = `0x3d3e82fa`, 0.95348835 = `0x3f7417d0`.) No seed beyond "prev nil".
Display (`10008bd08`, caller `101db5d6c`; asm verified at 10008c1f0-10008c320): input `[(date, MuscularLoadMetrics)]` sorted ascending by date (`100083908`; days with nil dailyRaw produce no output element but still advance the windows with 0).
```ts
for each day d (ascending):
  raw = dailyRaw ?? 0
  trainingFlags.push(raw > 250); keep last 42 flags; trainedDays = sum(flags)           // 10008b85c: removeFirst when count>=42 before append
  rawWindow.push(raw); keep last 28                                                         // removeFirst when count>=28 before append
  if dailyRaw == nil -> emit nothing
  if ATL or CTL not finite -> emit nothing
  ratio = CTL > 0 ? ATL/CTL : 0
  ctlMaturity = min(1, CTL/1500)
  trainingDensity = min(1, trainedDays/28)
  recency = n>=2 ? min(1, 0.25 * sum over i=0..n-2 with dist=(n-1-i) <= 15 and rawWindow[i] > 250 of (1 - dist/16)) : 0   // excludes today
  confidence = min(trainingDensity, recency)
  pctCTL = prevCTL > 0 ? (CTL - prevCTL)/prevCTL*100 : (none)          // prevCTL = CTL of previous emitted day
  trend  = pctCTL > 5 ? rising : pctCTL < -5 ? falling : stable           // none -> stable
  status: if (confidence < 0.35 || !(prevCTL > 0)) calibrating(0)         // fcmp d3,0.35; b.mi ; fcmp s13,#0; b.ls
          else ratio >= 1.5 overtraining(6); >= 1.3 fatigued(5); >= 1.05 productive(4); >= 0.95 maintaining(2);
               >= 0.8 ? (rising peaking(3) : falling detraining(1) : stable maintaining(2)) : detraining(1)
  displayLoad = ATL/50 ; optimalRange = [0.8*CTL/50, 1.5*CTL/50]   // constants at 0x104ec2f80 (0.8, 1.5), 50.0
  emit MuscularLoadData(atl, displayLoad, optStart, optEnd, confidence, ctlMaturity, trainingDensity, recency, dailyRaw, ratio, status)
```
These match the in-app "Muscular Load Status Logic" debug text (strings `0x10596cde0…`). UI also shows 30-day display history. Cardio Load uses the sibling rules in `1015efbc4` (ratio 1.0/1.4 thresholds, recovery < 20 splits productive/fatigued, maturity 0.35 gate, CTL +-5%); that function belongs to the Cardio Load family.

### M09.01 — RESOLVED (cardio-to-muscle mapping for freshness)
The freshness input per muscle is `MuscleRawLoad(strengthRaw, cardioDerivedRaw)` exactly as M08.01/M08.03 (strengthRaw = 50*L, cardioDerivedRaw = strainUnits*F*fraction). In the kernel the cardio part is divided by 3 (`0.3333333333333333`, `100081efc`).

### M09.03 — RESOLVED (personal capacity, calibration, thresholds)
Kernel `100081efc` (`MuscularFreshnessCalculator.calculate`, asm verified): input `[Date: [Muscle: MuscleRawLoad]]` converted to an array and sorted ascending by date; state: `prevFatigue[m]` (starts missing = 0) and `events[m]`.
```ts
for day in sortedDays:
  for m in muscles present in day's dict (keys, filtered):                 // only keys of that day's dictionary are processed
    decay = DECAY[m]; base = CAP[m]                                         // tables 0x104ec1fe8, 0x104ec2098 (re-read, identical to earlier doc)
    fatigue = strengthRaw + cardioDerivedRaw/3 + decay*(prevFatigue[m] ?? 0)
    prevFatigue[m] = fatigue
    if (strengthRaw + cardioDerivedRaw > 0) events[m].push({initialFatigue: strengthRaw + cardioDerivedRaw, date: day})   // undiscounted sum, cardio NOT /3
    calib = capacityCalibration(events[m], day)                              // 10008303c
    cap = max(1, calib?.personalizedCapacity ?? base)
    fresh = clamp(100*exp(-fatigue/cap), 1, 100)                             // lower clamp 1, upper 100 (fcmp/fcsel)
    status = calib == nil ? calibrating
           : (daysBetween(calib.latestObservationDate, day) > 42 ? calibrating   // cmp x20,#0x2a; b.le -> thresholds only when <= 42 days (or day diff nil)
              : fresh >= 75 ? recovered : fresh >= 35 ? fatigued : depleted)    // fcmp d10 vs 0x4052c0.. (75), 0x4041800.. (35); csel ge
    out[m] = {freshnessPercent: fresh, status, capacity: cap, personalizedCapacity: calib?.personalizedCapacity, observationCount: calib?.count, fatigue: fatigue/cap}
  categories (100086904): for each category c in [legs, shoulders, core, arms, chest, back]:
     members = muscles of out with CATEGORY[m] == c (table 0x104ec23d0: abductors/abs/adductors/core/obliques=core, biceps/forearm/triceps=arms, calves/glutes/hamstrings/hipFlexors/quads=legs, chest=chest, lats/lowerBack/middleBack/upperBack=back, neck/rotatorCuff/shoulder/traps=shoulders)
     catFresh = members.isEmpty ? 100 : mean(freshnessPercent)
     catStatus = (any member status == calibrating) ? calibrating : (catFresh >= 75 recovered : >= 35 fatigued : depleted)
  overall = out.isEmpty ? 100 : mean(freshnessPercent of out)                // unweighted mean
```
`capacityCalibration` (`10008303c`, asm): `n = events.count`; need `n >= 3` (`cmp x22,#2; b.ls` -> nil); weights `w_i = exp(-max(daysBetween(event.date, day), 0)/28)` (days nil -> weight 1); pairs `(initialFatigue_i, w_i)` sorted ascending by value (insertion sort `100084480` compares `fcmp d0,d1; b.pl`); `personalizedCapacity = max(1, weightedQuantile(0.9))` with `weightedQuantile`: `W = sum w`; if `W <= 0` return the last value; walk ascending accumulating `cum`; return the first value with `cum/W >= 0.9` (`fcmp d8,d2; b.hi` continues while `0.9 > cum/W`); else last value; `latestObservationDate = max(event.date)`; `observationCount = n`. Constant 0.9 at `0x104ec1f38`, 28 at asm 1000832d8.
Muscles whose personalized capacity is nil (fewer than 3 loaded days) still display `freshnessPercent` with the default capacity but `status = calibrating`.
Thresholds 75/35: verified by `csel ..., ge` (value >= 75 recovered, >= 35 fatigued).
Re-verified tables (decay, base capacity): abductors .58/4500, abs .62/4200, adductors .60/4300, biceps .78/2600, calves .52/4200, chest .78/4500, core .62/4500, forearm .66/2800, glutes .56/6000, hamstrings .60/4500, hipFlexors .56/3800, lats .70/4500, lowerBack .70/4200, middleBack .62/4500, neck .68/2200, obliques .62/4200, quads .50/5500, rotatorCuff .70/2200, shoulder .68/3200, traps .62/4500, triceps .78/2600, upperBack .62/4500. Corrections to the earlier text: (1) "units of raw load terms not established": strength raw = `50*100*atan(...)` per muscle, cardio raw = strain units x sport factor x fraction; (2) the personalization is now fully specified; (3) the status gate "earlier gates label calibrating" is: no personalized capacity, or last loaded day older than 42 days.

### M09.02 — RESOLVED for eligibility and rest-day semantics; one residual (feed lookback start)
Kernel input type: `100081efc` takes `[Date: CumulativeMetrics]` (the per-day cumulative-metrics record produced by `1015e9840`/`1015efbc4`), built at `101db6c80` (x20) from the trend provider `MuscleGroupTrendStreamProvider` (`101db3e48`/`101db51e4` -> `101db6a30` -> `100081efc`). The strength-load sum reads the record through keypaths `DAT_104fec3d8/104fec400` (`101db7440`).
```ts
// kernel (100081efc), ascending over the supplied dates
for (date of sortedKeys(dict)) {
  const day = dict[date].muscularFreshness            // nil on rest days (100085b1c returns nil when the per-muscle dict is empty)
  for (muscle of keys(day ?? {})) { update(muscle, day[muscle]) }   // decay applied ONCE per processed (date, muscle)
}
overall = processedMuscles.isEmpty ? 100 : mean(...)
```
Rest-day answer: rest days ARE keys in the dictionary (every calendar day of the cumulative loop has a `CumulativeMetrics` entry), but their `muscularFreshness` is nil, so the inner loop has no muscle keys and nothing runs. Therefore rest days do NOT decay or restore anything: freshness changes only on days with a workout for that muscle; the time axis is workout-event based, not calendar based (a muscle trained once, then idle for 30 days keeps the freshness of its last processed entry). Per-display-day point selection is `101db78c4` (picks the dictionary day for each chart day) and hidden/empty chart rules are in `101db825c`. UI string "30-Day Muscle Freshness" is the chart window only.
Residual (not recovered): the writer of the generic provider dictionary (the cumulative-metrics trend feed) and the first date it covers. Since decay is per processed entry with factors 0.50-0.78, entries older than ~10 processed workouts per muscle contribute < 3%, so any lookback of at least ~90 days reproduces the numbers to rounding for regular trainers; exact parity for sparse trainers needs the true start. Unblock: the writer of `DAT_104fec3d8/400` keypath-backed property (searched, vtable only), via callers of `101db6c80`.

### M09.04 — RESOLVED (connector gap: exact lifting inputs)
Bevel's muscular numbers need, per strength workout: (a) a list of sessions each with a list of sets; per set the exercise identity (preset from the 548-case `StrengthWorkout` catalog or a custom exercise with user-chosen primary/secondary `StrengthMuscleGroup`s; units none); (b) for each set an optional analysis dictionary `[String: Double]` with `steLoss_v1` (fractional velocity loss, 0..~0.7) and `detectedReps_v1` (count), recordedReps (Int, for the 5-rep agreement check); (c) per session an optional `estimatedEffort` on a 0-10 scale (default 5 when nil); (d) when no sets exist, an overlay `muscularStrainUnits` Float on the workout summary; (e) for cardio workouts only `cardioStrainUnits` (Float, Bevel's strain-unit scale) and the workout activity type. Weight (lb), reps count and equipment are not read by Muscular Load/Freshness (only by 1RM/volume helpers). Pulse maps set count x default RPE 5 if per-set exercise/muscle data is available; without sets Pulse can only use cardio-derived loads and has no way to produce the strength term. Pulse code to compare: `/Users/adityajindal/personal/pulse/src/server/sources/google/map.ts` keeps workout summaries, not sets.

---------------------------------------------------------------------
## New discoveries
- Local user setting (UserDefaults-backed, not remote config) `data_loading.full_metrics_recalculate_window` (oneYear..fiveYears) controls how many years back weekly Bio Age and full metric recalculation reach.
- Debug view strings document the Muscular Load status ladder and `ATL/50` display scale (verified in code).
- `leanBodyPercentage` is derived at ingestion (lean mass / body weight x 100).
- Blood freshness function used by the weekly pipeline is the same as the UI sample freshness (`103c43680`).

## Hand-offs
- Agent A (ingestion): HealthMetric indices consumed by Bio Age (1, 10, 12, 25, 27, 28, 29, nutrition daily score) and BioMetric samples (vo2Max, leanBodyPercentage derivation at `100595d08`/`100599c54`); BioBackgroundQueryService anchored query.
- Agent B (framework): week/day boundaries use `Calendar.current` local time, Monday weeks (`FUN_1030ca614`); window helper `FUN_1030e44c0` (D-28..D-1 days, noon-based descending loop); Data Loading Window is a local user setting (see M06.02).
- Strain/Cardio owner: definition of `WorkoutSummaryScores.cardioStrainUnits` and `muscularStrainUnits`; `1015efbc4` also holds Cardio Load ATL/CTL/status (ratio 1.0/1.4, CTL +-5%, maturity 0.35, recovery < 20), alpha 0.25 and 2/43.
- Blood SQL and `BioAgeStateController` writers: see unrecovered items above.
