// Own algorithm (docs/algorithms/fitness-level.md): VO2max percentile for age decade and sex from the FRIEND
// treadmill reference standards, a category from the percentile, and the 75th-percentile reference that
// Healthspan scores VO2max against.

export type Sex = "male" | "female";

/** [x, y] points with ascending x. */
export type Knots = readonly (readonly [number, number])[];

/** Linear between knots, flat beyond the first and last. */
export function piecewiseLinear(knots: Knots, x: number): number {
  if (x <= knots[0][0]) return knots[0][1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i];
    if (x <= x1) {
      const [x0, y0] = knots[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return knots[knots.length - 1][1];
}

/** Column percentiles of the FRIEND table. */
export const FRIEND_PERCENTILES: readonly number[] = [5, 10, 25, 50, 75, 90, 95];

/**
 * Measured treadmill VO2max (mL O2·kg⁻¹·min⁻¹), rows 20–29 … 70–79. Kaminsky et al. 2015, Mayo Clin Proc
 * 90(11):1515–1523, Table 2 ("Men/Women from FRIEND"; 7,783 tests, RER ≥ 1.0, no CVD).
 */
export const FRIEND_TREADMILL: Record<Sex, readonly (readonly number[])[]> = {
  male: [
    [29.0, 32.1, 40.1, 48.0, 55.2, 61.8, 66.3],
    [27.2, 30.2, 35.9, 42.4, 49.2, 56.5, 59.8],
    [24.2, 26.8, 31.9, 37.8, 45.0, 52.1, 55.6],
    [20.9, 22.8, 27.1, 32.6, 39.7, 45.6, 50.7],
    [17.4, 19.8, 23.7, 28.2, 34.5, 40.3, 43.0],
    [16.3, 17.1, 20.4, 24.4, 30.4, 36.6, 39.7],
  ],
  female: [
    [21.7, 23.9, 30.5, 37.6, 44.7, 51.3, 56.0],
    [19.0, 20.9, 25.3, 30.2, 36.1, 41.4, 45.8],
    [17.0, 18.8, 22.1, 26.7, 32.4, 38.4, 41.7],
    [16.0, 17.3, 19.9, 23.4, 27.6, 32.0, 35.9],
    [13.4, 14.6, 17.2, 20.0, 23.8, 27.0, 29.4],
    [13.1, 13.6, 15.6, 18.3, 20.8, 23.1, 24.1],
  ],
};

export const fitnessLevelConfig = {
  /** Lowest percentile of each category (*tunable*); below `fair` is poor. */
  categoryFloors: { fair: 20, good: 40, excellent: 60, superior: 80 },
  /** Healthspan's VO2max reference (*tunable*); must be one of FRIEND_PERCENTILES. */
  referencePercentile: 75,
};

export type FitnessCategory = "poor" | "fair" | "good" | "excellent" | "superior";

/** Under 20 uses the 20–29 row; 80 and over uses 70–79. */
const decadeRow = (age: number, sex: Sex) =>
  FRIEND_TREADMILL[sex][Math.min(5, Math.max(0, Math.floor(age / 10) - 2))];

/** Percentile for a VO2max, linear between the published columns and clamped to [5, 95]. */
export function vo2maxPercentile(vo2max: number, age: number, sex: Sex): number {
  return piecewiseLinear(
    decadeRow(age, sex).map((v, i) => [v, FRIEND_PERCENTILES[i]] as const),
    vo2max,
  );
}

export function fitnessCategory(percentile: number): FitnessCategory {
  const f = fitnessLevelConfig.categoryFloors;
  if (percentile >= f.superior) return "superior";
  if (percentile >= f.excellent) return "excellent";
  if (percentile >= f.good) return "good";
  if (percentile >= f.fair) return "fair";
  return "poor";
}

export function fitnessLevel(vo2max: number, age: number, sex: Sex): { percentile: number; category: FitnessCategory } {
  const percentile = vo2maxPercentile(vo2max, age, sex);
  return { percentile, category: fitnessCategory(percentile) };
}

/**
 * The reference-percentile VO2max for an age, linear between decade midpoints (25, 35 … 75) so that
 * Healthspan's WHOOP Age does not jump on a decade birthday.
 */
export function referenceVo2max(age: number, sex: Sex): number {
  const col = FRIEND_PERCENTILES.indexOf(fitnessLevelConfig.referencePercentile);
  return piecewiseLinear(
    FRIEND_TREADMILL[sex].map((row, i) => [25 + 10 * i, row[col]] as const),
    age,
  );
}
