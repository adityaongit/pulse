# Fitness level: VO2max percentile

Code: `src/core/algorithms/fitnessLevel.ts`. Tests: `fitnessLevel.test.ts`.

Fitness level places a VO2max value among people of the same sex and age decade, using the FRIEND registry's measured treadmill VO2max. The percentile maps to one of five categories. The same table supplies the 75th-percentile VO2max that Healthspan scores against.

## Formula

1. **Pick the decade row** for the sex: 20–29, 30–39, … 70–79. Ages under 20 use 20–29, and ages 80 and over use 70–79, because the 2015 table stops at 79.
2. **Interpolate the percentile** linearly between the published columns (5, 10, 25, 50, 75, 90, 95). Below the 5th column it is 5, and above the 95th it is 95. The table does not resolve the tails, so the clamp keeps the number honest.
3. **Category by percentile:**

   | Category | Percentile |
   |---|---|
   | Poor | < 20 |
   | Fair | 20–39 |
   | Good | 40–59 |
   | Excellent | 60–79 |
   | Superior | ≥ 80 |

   The bands are half-open, so 39.9 is Fair and 40 is Good.
4. **The Healthspan reference**, `referenceVo2max(age, sex)`, is the 75th-percentile column, linear between decade midpoints (25, 35 … 75) and flat outside them. A decade step would make WHOOP Age jump by about 1.5 years on a decade birthday. Fitness level itself keeps the published decade rows. Near a decade edge, someone exactly at the Healthspan reference can therefore show a percentile a few points off 75.

## Inputs

| Input | Unit | Notes |
|---|---|---|
| `vo2max` | mL O₂·kg⁻¹·min⁻¹ | U10 picks the value with Healthspan's source rule: the latest `run-vo2-max` within 90 days, otherwise the latest `daily-vo2-max`. |
| `age` | years | Fractional is fine. |
| `sex` | `"male"` or `"female"` | FRIEND publishes only these two. |

FRIEND is **measured** VO2max from treadmill CPX tests, with RER ≥ 1.0. Fitbit's values are estimates, from runs or from resting HR, so the percentile is an estimate against a lab standard.

## Table

This is Kaminsky et al. 2015, Table 2, "Men/Women from FRIEND": 7,783 maximal treadmill tests, 2014–2015, eight US labs, adults without cardiovascular disease. The code holds the full 14 rows × 7 columns, men and women, ages 20–79, in `FRIEND_TREADMILL`.

| Men | 5th | 10th | 25th | 50th | 75th | 90th | 95th |
|---|---|---|---|---|---|---|---|
| 20–29 | 29.0 | 32.1 | 40.1 | 48.0 | 55.2 | 61.8 | 66.3 |
| 30–39 | 27.2 | 30.2 | 35.9 | 42.4 | 49.2 | 56.5 | 59.8 |
| 40–49 | 24.2 | 26.8 | 31.9 | 37.8 | 45.0 | 52.1 | 55.6 |
| 50–59 | 20.9 | 22.8 | 27.1 | 32.6 | 39.7 | 45.6 | 50.7 |
| 60–69 | 17.4 | 19.8 | 23.7 | 28.2 | 34.5 | 40.3 | 43.0 |
| 70–79 | 16.3 | 17.1 | 20.4 | 24.4 | 30.4 | 36.6 | 39.7 |

| Women | 5th | 10th | 25th | 50th | 75th | 90th | 95th |
|---|---|---|---|---|---|---|---|
| 20–29 | 21.7 | 23.9 | 30.5 | 37.6 | 44.7 | 51.3 | 56.0 |
| 30–39 | 19.0 | 20.9 | 25.3 | 30.2 | 36.1 | 41.4 | 45.8 |
| 40–49 | 17.0 | 18.8 | 22.1 | 26.7 | 32.4 | 38.4 | 41.7 |
| 50–59 | 16.0 | 17.3 | 19.9 | 23.4 | 27.6 | 32.0 | 35.9 |
| 60–69 | 13.4 | 14.6 | 17.2 | 20.0 | 23.8 | 27.0 | 29.4 |
| 70–79 | 13.1 | 13.6 | 15.6 | 18.3 | 20.8 | 23.1 | 24.1 |

**The 2022 update** (Kaminsky et al. 2022) adds 80–89 and more labs, with 16,278 treadmill tests from 1968 to 2021. Its full text was not reachable while this was written: the publisher returned 403, and the paper is not in PubMed Central. Its abstract reports that the updated treadmill standards are 1.5–4.6 mL·kg⁻¹·min⁻¹ lower than the 2015 ones. Because of that, a given VO2max scores a little lower against the 2015 table than it would against the 2022 table. To switch, replace the `FRIEND_TREADMILL` rows and add an 80–89 row.

## Constants

| Constant | Value | Kind |
|---|---|---|
| `FRIEND_TREADMILL`, `FRIEND_PERCENTILES` | Table 2 | cited: Kaminsky 2015 |
| `fitnessLevelConfig.categoryFloors` | 20 / 40 / 60 / 80 | *tunable* (spec) |
| `fitnessLevelConfig.referencePercentile` | 75 | *tunable* (spec); must be one of the table's columns |

## Worked examples

1. **A man of 35 with VO2max 45.** The 30–39 row has 42.4 at the 50th and 49.2 at the 75th, so the percentile is 50 + 25 × (45 − 42.4) / (49.2 − 42.4) = **59.6**, which is Good.
2. **A woman of 52 with VO2max 30.** The 50–59 row has 27.6 at the 75th and 32.0 at the 90th, so the percentile is 75 + 15 × 2.4 / 4.4 = **83.2**, which is Superior.
3. **A woman of 45 with VO2max 16.** This is below the 5th column (17.0), so the percentile is **5** (clamped), which is Poor.
4. **The Healthspan reference for a man of 38** is 49.2 + (45.0 − 49.2) × 3 / 10 = **47.9**. At exactly 35 it is 49.2.

## Sources

- Kaminsky LA, Arena R, Myers J. Reference standards for cardiorespiratory fitness measured with cardiopulmonary exercise testing: data from the Fitness Registry and the Importance of Exercise National Database. *Mayo Clin Proc* 2015;90(11):1515–1523. doi:10.1016/j.mayocp.2015.07.026. Table 2. Free full text: PMC4919021.
- Kaminsky LA, Arena R, Myers J, et al. Updated reference standards for cardiorespiratory fitness measured with cardiopulmonary exercise testing: data from the Fitness Registry and the Importance of Exercise National Database (FRIEND). *Mayo Clin Proc* 2022;97(2):285–293. doi:10.1016/j.mayocp.2021.08.020. Abstract only; not used for values.
