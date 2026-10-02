// Ports TrainingLoadEngine.kt: CTL/ATL/TSB as EWMAs of daily Effort (same units as the load, not TRIMP),
// over the longest gap-free suffix ending on the target day. Seeded from the mean of the first primeDays.
import { isoEpochDay } from "./baselines";

export interface TrainingLoadConfig {
  chronicTimeConstantDays: number;
  acuteTimeConstantDays: number;
  primeDays: number;
  minimumDays: number;
  establishedDays: number;
}

export const standardConfig: TrainingLoadConfig = {
  chronicTimeConstantDays: 42.0,
  acuteTimeConstantDays: 7.0,
  primeDays: 7,
  minimumDays: 14,
  establishedDays: 42,
};

const isValidConfig = (c: TrainingLoadConfig): boolean =>
  Number.isFinite(c.chronicTimeConstantDays) &&
  c.chronicTimeConstantDays > 0.0 &&
  Number.isFinite(c.acuteTimeConstantDays) &&
  c.acuteTimeConstantDays > 0.0 &&
  c.primeDays > 0 &&
  c.minimumDays >= c.primeDays &&
  c.establishedDays >= c.minimumDays;

/** `load == null` is no usable observation; `load == 0` is a measured rest day. */
export interface DailyLoad {
  day: string;
  load: number | null;
}

export type TrainingLoadState = "unavailable" | "building" | "established";

export type TrainingLoadUnavailableReason =
  | "NO_DATA"
  | "MISSING_TARGET_DAY"
  | "NOT_ENOUGH_CONTIGUOUS_DAYS"
  | "INVALID_CONFIGURATION"
  | "INVALID_DAY"
  | "DUPLICATE_DAY"
  | "INVALID_LOAD";

export interface TrainingLoadPoint {
  day: string;
  load: number;
  ctl: number;
  atl: number;
  /** ctl − atl */
  tsb: number;
}

export interface TrainingLoadResult {
  state: TrainingLoadState;
  unavailableReason: TrainingLoadUnavailableReason | null;
  contiguousDays: number;
  startDay: string | null;
  endDay: string | null;
  points: TrainingLoadPoint[];
  /** The last point's values; null when unavailable. */
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
}

const unavailable = (
  reason: TrainingLoadUnavailableReason,
  contiguousDays: number,
  startDay: string | null = null,
  endDay: string | null = null,
): TrainingLoadResult => ({
  state: "unavailable",
  unavailableReason: reason,
  contiguousDays,
  startDay,
  endDay,
  points: [],
  ctl: null,
  atl: null,
  tsb: null,
});

const isoFromOrdinal = (ordinal: number): string => new Date(ordinal * 86_400_000).toISOString().slice(0, 10);

/** Strict `yyyy-MM-dd` → epoch day; rejects impossible dates (2026-02-30) and years below 1. */
function dayOrdinal(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) < 1) return null;
  const ordinal = isoEpochDay(value);
  return ordinal != null && isoFromOrdinal(ordinal) === value ? ordinal : null;
}

/** Evaluate the latest input day, or `through`. Inputs may be in any order. */
export function evaluate(
  days: DailyLoad[],
  through: string | null = null,
  config: TrainingLoadConfig = standardConfig,
): TrainingLoadResult {
  if (!isValidConfig(config)) return unavailable("INVALID_CONFIGURATION", 0);
  if (days.length === 0) return unavailable("NO_DATA", 0);

  const parsed: { day: string; ordinal: number; load: number | null }[] = [];
  const seen = new Set<number>();
  for (const item of days) {
    const ordinal = dayOrdinal(item.day);
    if (ordinal == null) return unavailable("INVALID_DAY", 0);
    if (seen.has(ordinal)) return unavailable("DUPLICATE_DAY", 0);
    seen.add(ordinal);
    if (item.load != null && (!Number.isFinite(item.load) || item.load < 0.0)) return unavailable("INVALID_LOAD", 0);
    parsed.push({ day: item.day, ordinal, load: item.load });
  }
  parsed.sort((a, b) => a.ordinal - b.ordinal);

  let targetOrdinal: number;
  if (through != null) {
    const t = dayOrdinal(through);
    if (t == null) return unavailable("INVALID_DAY", 0);
    targetOrdinal = t;
  } else {
    targetOrdinal = parsed[parsed.length - 1].ordinal;
  }
  const targetIndex = parsed.findIndex((p) => p.ordinal === targetOrdinal);
  if (targetIndex < 0) return unavailable("MISSING_TARGET_DAY", 0);

  // Walk back until the first calendar gap or unobserved load.
  const ordered: { day: string; load: number }[] = [];
  let expected = targetOrdinal;
  for (let i = targetIndex; i >= 0; i--) {
    const item = parsed[i];
    if (item.ordinal !== expected || item.load == null) break;
    ordered.push({ day: item.day, load: item.load });
    expected -= 1;
  }
  ordered.reverse();
  const contiguousDays = ordered.length;
  if (contiguousDays < config.minimumDays) {
    return unavailable("NOT_ENOUGH_CONTIGUOUS_DAYS", contiguousDays, ordered[0]?.day ?? null, ordered.at(-1)?.day ?? null);
  }

  const seed = ordered.slice(0, config.primeDays).reduce((s, d) => s + d.load, 0) / config.primeDays;
  const alphaChronic = 1.0 - Math.exp(-1.0 / config.chronicTimeConstantDays);
  const alphaAcute = 1.0 - Math.exp(-1.0 / config.acuteTimeConstantDays);
  let chronic = seed;
  let acute = seed;
  const seedDay = ordered[config.primeDays - 1];
  const points: TrainingLoadPoint[] = [{ day: seedDay.day, load: seedDay.load, ctl: chronic, atl: acute, tsb: chronic - acute }];
  for (const item of ordered.slice(config.primeDays)) {
    chronic += alphaChronic * (item.load - chronic);
    acute += alphaAcute * (item.load - acute);
    points.push({ day: item.day, load: item.load, ctl: chronic, atl: acute, tsb: chronic - acute });
  }
  const last = points[points.length - 1];
  return {
    state: contiguousDays >= config.establishedDays ? "established" : "building",
    unavailableReason: null,
    contiguousDays,
    startDay: ordered[0].day,
    endDay: ordered[ordered.length - 1].day,
    points,
    ctl: last.ctl,
    atl: last.atl,
    tsb: last.tsb,
  };
}

/** Dense load array with synthetic day labels from 2000-01-01; maths identical to evaluate. */
export function evaluateDense(loads: number[], config: TrainingLoadConfig = standardConfig): TrainingLoadResult {
  const base = isoEpochDay("2000-01-01") as number;
  return evaluate(
    loads.map((load, i) => ({ day: isoFromOrdinal(base + i), load })),
    null,
    config,
  );
}
