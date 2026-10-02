// Ports DaytimeStress.kt and DaytimeBaselines.kt on the HR-only path (no R-R, so RMSSD is always absent):
// hourly waking-hour mean HR z-scored against the day's calm quartile or a personal daytime-HR baseline,
// squashed onto 0–3. Not ported: the RMSSD term, the gravity motion gate and the half-step display timeline.
import { daytimeHRCfg, foldHistory, isUsable } from "./baselines";
import type { BaselineState, HrSample } from "./types";

/** HR samples an hour needs before its mean HR is trusted (~5 min at 1 Hz). */
export const minHourHrSamples = 300;
export const bucketSeconds = 3_600;
export const highBandFloor = 2.0;
export const sustainedHours = 3;
/** Waking window 06:00–22:00, local. */
export const wakingStartHour = 6;
export const wakingEndHour = 22;
/** Personal daytime-HR elevation that lands exactly on highBandFloor in baseline-relative mode. */
export const baselineRelativeHighMarginBPM = 15.0;
/** P10 of the day's waking-hour mean HRs: the calm floor folded into the daytime-HR baseline. */
export const daytimeHRAggregatePercentile = 0.1;

/** dayRelative: the day's own calm quartile. baselineRelative: a folded personal daytime-HR baseline. */
export type ScoringMode = { kind: "dayRelative" } | { kind: "baselineRelative"; hr: BaselineState };

export interface HourPoint {
  /** Local hour of day, 0–23. */
  hour: number;
  /** Wall-clock unix seconds at the bucket start. */
  startTs: number;
  /** 0–3, or null when the hour had fewer than minHourHrSamples. */
  level: number | null;
  meanHr: number | null;
}

export interface DaytimeStressResult {
  /** Waking hours that had any HR, earliest first. */
  hours: HourPoint[];
  /** The latest sustainedHours scored hours are all ≥ highBandFloor. */
  sustainedHigh: boolean;
  sustainedRun: number;
  dayMean: number | null;
  peak: HourPoint | null;
  /** Scored hours ≥ highBandFloor × 60. */
  highStressMinutes: number;
}

const EMPTY: DaytimeStressResult = { hours: [], sustainedHigh: false, sustainedRun: 0, dayMean: null, peak: null, highStressMinutes: 0 };

const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Population SD; 0 with no spread. */
function std(xs: number[], m: number | null): number {
  if (m == null || xs.length <= 1) return 0.0;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length);
}

/** 3 / (1 + e^(−raw)), clamped to [0, 3]. Baseline (raw 0) → 1.5. */
export const squash = (raw: number): number => Math.min(3.0, Math.max(0.0, 3.0 / (1.0 + Math.exp(-raw))));

/** The z spread at which a raw elevation of `marginBPM` squashes to exactly `band`. */
export function marginToSigma(marginBPM: number, band: number): number {
  const ratio = 3.0 / band - 1.0;
  if (ratio <= 0.0 || marginBPM <= 0.0) return Math.max(marginBPM, 1e-9);
  return marginBPM / -Math.log(ratio);
}

/** Linear-interpolated quantile of a sorted list. */
export function quantile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0.0;
  if (n === 1) return sorted[0];
  const pos = q * (n - 1);
  const lo = Math.trunc(pos);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
}

export const isWakingHourOfDay = (hourOfDay: number): boolean => hourOfDay >= wakingStartHour && hourOfDay < wakingEndHour;

/** `bucket` is a local bucket start. JS % keeps the dividend's sign, as Kotlin's does. */
export const isWakingHour = (bucket: number): boolean => isWakingHourOfDay(Math.floor(bucket / bucketSeconds) % 24);

/** Local-hour bucket start → HR values, keys ascending. */
function hrBuckets(hr: HrSample[], tzOffsetSeconds: number): [number, number[]][] {
  const m = new Map<number, number[]>();
  for (const s of hr) {
    const b = Math.floor((s.ts + tzOffsetSeconds) / bucketSeconds) * bucketSeconds;
    const list = m.get(b);
    if (list) list.push(s.bpm);
    else m.set(b, [s.bpm]);
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

const gatedMean = (hrs: number[]): number | null => (hrs.length >= minHourHrSamples ? mean(hrs) : null);

/** Lower quartile (calm HR is low); plain mean below 4 values. */
function calmReference(xs: number[]): number | null {
  if (xs.length === 0) return null;
  if (xs.length < 4) return mean(xs);
  return quantile([...xs].sort((a, b) => a - b), 0.25);
}

/**
 * The hourly 0–3 stress timeline for one day of HR. `tzOffsetSeconds` is seconds east of UTC, so waking
 * hours and labels are local.
 */
export function analyze(hr: HrSample[], tzOffsetSeconds = 0, mode: ScoringMode = { kind: "dayRelative" }): DaytimeStressResult {
  if (hr.length === 0) return EMPTY;
  const aggs = hrBuckets(hr, tzOffsetSeconds).map(([bucket, hrs]) => ({ bucket, meanHr: gatedMean(hrs) }));

  let refHr: number | null;
  let sdHr: number;
  if (mode.kind === "dayRelative") {
    const hrMeans = aggs.filter((a) => isWakingHour(a.bucket)).flatMap((a) => (a.meanHr == null ? [] : [a.meanHr]));
    refHr = calmReference(hrMeans);
    sdHr = std(hrMeans, mean(hrMeans));
  } else {
    refHr = mode.hr.baseline;
    sdHr = marginToSigma(baselineRelativeHighMarginBPM, highBandFloor);
  }

  const points: HourPoint[] = [];
  for (const a of aggs) {
    if (!isWakingHour(a.bucket)) continue;
    const z = a.meanHr != null && refHr != null && sdHr > 0.0001 ? (a.meanHr - refHr) / sdHr : 0.0;
    points.push({
      hour: Math.floor(a.bucket / bucketSeconds) % 24,
      startTs: a.bucket - tzOffsetSeconds,
      level: a.meanHr != null ? squash(z) : null,
      meanHr: a.meanHr,
    });
  }

  const scored = points.filter((p): p is HourPoint & { level: number } => p.level != null);
  if (scored.length === 0) return points.length === 0 ? EMPTY : { ...EMPTY, hours: points };

  let run = 0;
  for (let i = scored.length - 1; i >= 0 && scored[i].level >= highBandFloor; i--) run++;
  let peak = scored[0];
  for (const p of scored) if (p.level > peak.level) peak = p;
  return {
    hours: points,
    sustainedHigh: run >= sustainedHours,
    sustainedRun: run,
    dayMean: mean(scored.map((p) => p.level)),
    peak,
    highStressMinutes: scored.filter((p) => p.level >= highBandFloor).length * (bucketSeconds / 60),
  };
}

// ── DaytimeBaselines ───────────────────────────────────────────────────────

/** One day's daytime-HR aggregate: P10 of its gated waking-hour mean HRs, or null. */
export function dayDaytimeAggregate(hr: HrSample[], tzOffsetSeconds = 0): number | null {
  const wakingMeans = hrBuckets(hr, tzOffsetSeconds).flatMap(([bucket, hrs]) => {
    const m = isWakingHour(bucket) ? gatedMean(hrs) : null;
    return m == null ? [] : [m];
  });
  if (wakingMeans.length === 0) return null;
  return quantile(wakingMeans.sort((a, b) => a - b), daytimeHRAggregatePercentile);
}

/** Fold per-day aggregates (oldest first, today excluded) through the daytime_hr baseline. */
export const foldDaytimeBaseline = (aggregates: (number | null)[]): BaselineState => foldHistory(aggregates, daytimeHRCfg);

/** baselineRelative once the folded daytime-HR baseline is usable (≥ 4 days), else dayRelative. */
export function scoringMode(aggregates: (number | null)[]): ScoringMode {
  const hr = foldDaytimeBaseline(aggregates);
  return isUsable(hr) ? { kind: "baselineRelative", hr } : { kind: "dayRelative" };
}
