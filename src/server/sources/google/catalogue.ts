// Google Health API v4 data types Pulse reads. Copied from Hælan's catalogue.ts (AGPL-3.0) and its
// probe findings (field-map.md, rollup-methods.md); see docs/data-notes.md. Unconfirmed on the Fitbit Air.
//
// One type wears three casings: kebab in the URL path (the key here), snake in the filter
// (`daily_resting_heart_rate.date`), camel in the response body (`dailyRestingHeartRate`).

/** The filterable member differs per type, and Google does not document it. A wrong member is a 400. */
export type FilterMember =
  | "date" // civil date in TZ
  | "sample_time.physical_time"
  | "interval.start_time"
  | "interval.end_time"
  | "interval.civil_start_time"; // civil datetime in TZ, no offset

export type DataType = {
  /** Member that `:list` filters on; null when the type answers only rollups. */
  member: FilterMember | null;
  /** Longest window one request may cover, in local days (list window or dailyRollUp range). */
  maxDays: number;
  /** `pageSize` sent on `:list`. The API may cap a page lower (Hælan saw 5,000 for heart-rate). */
  pageSize: number;
  /** Answers `:dailyRollUp` (POST, civil range, no pagination). */
  dailyRollUp: boolean;
};

const PAGE = 10_000;
const daily = { member: "date", maxDays: 90, pageSize: PAGE, dailyRollUp: false } as const;
const sample = { member: "sample_time.physical_time", maxDays: 90, pageSize: PAGE, dailyRollUp: false } as const;

export const DATA_TYPES = {
  "daily-heart-rate-variability": daily,
  "daily-resting-heart-rate": daily,
  "daily-respiratory-rate": daily,
  "daily-sleep-temperature-derivations": daily,
  "daily-oxygen-saturation": daily,
  "daily-vo2-max": daily,
  "run-vo2-max": sample,
  "vo2-max": sample, // listed so the probe can say which VO2max types the band populates
  weight: sample,
  "body-fat": sample,
  // A night is windowed by when it ends: a window on bed time drops the night that crosses it.
  sleep: { member: "interval.end_time", maxDays: 90, pageSize: 25, dailyRollUp: false },
  exercise: { member: "interval.civil_start_time", maxDays: 90, pageSize: 25, dailyRollUp: false },
  "heart-rate": { ...sample, maxDays: 14 },
  // dailyRollUp gives Google's merged, worn-only daily total; list gives per-minute counts for movement gating.
  steps: { member: "interval.start_time", maxDays: 14, pageSize: PAGE, dailyRollUp: true },
  "total-calories": { member: null, maxDays: 14, pageSize: PAGE, dailyRollUp: true },
} as const satisfies Record<string, DataType>;

export type DataTypeId = keyof typeof DATA_TYPES;

export const DATA_TYPE_IDS = Object.keys(DATA_TYPES) as DataTypeId[];
