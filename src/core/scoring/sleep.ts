// Ports SleepStager.hypnogramMetrics (SleepStager.kt), RestScorer (AnalyticsEngine.kt L1505–1739: sleep
// performance and need), SleepDebt.kt, and VitalityEngine.sleepConsistency (1 − CV). Rest's consistency input
// is a plain [0, 1] number so U7 can pass SRI / 100 in its place.
import type { HypnogramMetrics, SleepSession, Stage, StageSegment } from "./types";

// ── Hypnogram ──────────────────────────────────────────────────────────────

const isWake = (stage: Stage): boolean => {
  const s = stage.trim().toLowerCase();
  return s === "wake" || s === "awake";
};

/** AASM-style aggregates from a session's stage segments. */
export function hypnogramMetrics(session: SleepSession): HypnogramMetrics {
  const segs = [...session.stages].sort((a, b) => a.start - b.start);
  const tib = Math.max(0.0, session.end - session.start);
  const dur = (s: StageSegment) => s.end - s.start;
  const sum = (stage: Stage) => segs.filter((s) => s.stage === stage).reduce((a, s) => a + dur(s), 0);
  const sleepSegs = segs.filter((s) => s.stage === "light" || s.stage === "deep" || s.stage === "rem");
  const tst = sleepSegs.reduce((a, s) => a + dur(s), 0);
  const deepS = sum("deep");
  const remS = sum("rem");
  const lightS = sum("light");

  const first = sleepSegs[0];
  const last = sleepSegs.at(-1);
  const onset = first && last ? first.start : session.end;
  const sptEnd = first && last ? last.end : session.end;
  const sol = first && last ? Math.max(0.0, onset - session.start) : tib;

  const firstRem = segs.find((s) => s.stage === "rem");
  const remLatency = firstRem ? firstRem.start - onset : null;

  let waso = 0.0;
  let disturbances = 0;
  for (const s of segs) {
    if (!isWake(s.stage)) continue;
    const w0 = Math.max(s.start, onset);
    const w1 = Math.min(s.end, sptEnd);
    if (w1 > w0) {
      waso += w1 - w0;
      disturbances += 1;
    }
  }

  const pct = (x: number) => (tst > 0 ? (x / tst) * 100.0 : 0.0);
  return {
    tibS: tib,
    tstS: tst,
    sptS: Math.max(0.0, sptEnd - onset),
    solS: sol,
    remLatencyS: remLatency,
    wasoS: waso,
    efficiency: Math.min(1.0, tib > 0 ? tst / tib : 0.0),
    disturbances,
    deepMin: deepS / 60.0,
    remMin: remS / 60.0,
    lightMin: lightS / 60.0,
    deepPct: pct(deepS),
    remPct: pct(remS),
    lightPct: pct(lightS),
  };
}

// ── Rest (sleep performance) ───────────────────────────────────────────────

export const wDuration = 0.5;
export const wEfficiency = 0.2;
export const wRestorative = 0.2;
export const wConsistency = 0.1;
export const defaultSleepNeedHours = 8.0;
/** Fewer scorable nights than this → the population default need. */
export const minNeedNights = 7;
export const maxNeedHours = 9.5;
export const restorativeTargetShare = 0.5;
export const deepShareTarget = 0.13;
export const deepFloorFactor = 0.5;
/** Used when no consistency signal is supplied (noop adds a neutral term, it does not renormalize). */
export const NEUTRAL_CONSISTENCY = 0.5;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Population target need for an age, used as a floor. */
export function populationNeedFloorHours(age: number | null): number {
  if (age == null || age <= 0) return 8.0;
  return age < 18 ? 9.0 : 8.0;
}

/** Upper-quartile nightly hours, floored at the population target and capped at maxNeedHours. */
export function personalizedNeedHours(nightlyHours: number[], age: number | null): number {
  const floor = populationNeedFloorHours(age);
  const xs = nightlyHours.filter((h) => h > 0.0).sort((a, b) => a - b);
  if (xs.length < minNeedNights) return Math.min(Math.max(defaultSleepNeedHours, floor), maxNeedHours);
  const pos = 0.75 * (xs.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, xs.length - 1);
  const q = xs[lo] + (pos - lo) * (xs[hi] - xs[lo]);
  return Math.min(Math.max(q, floor), maxNeedHours);
}

/**
 * Rest composite in [0, 100] (2 dp), or null with no asleep time.
 * @param efficiency asleep / in-bed in [0, 1].
 * @param consistency sleep regularity in [0, 1]; null → NEUTRAL_CONSISTENCY.
 */
export function rest(
  asleepSeconds: number,
  efficiency: number,
  deepSeconds: number,
  remSeconds: number,
  sleepNeedHours: number | null = null,
  consistency: number | null = null,
): number | null {
  if (asleepSeconds <= 0.0) return null;
  const asleepHours = asleepSeconds / 3600.0;
  const needHours = Math.max(sleepNeedHours ?? defaultSleepNeedHours, 0.1);
  const durationScore = Math.min(100.0, (asleepHours / needHours) * 100.0);
  const efficiencyScore = clamp(efficiency * 100.0, 0.0, 100.0);
  const restorativeShare = (deepSeconds + remSeconds) / asleepSeconds;
  const deepAdequacy = clamp(deepSeconds / asleepSeconds / deepShareTarget, 0.0, 1.0);
  const deepFactor = deepFloorFactor + (1.0 - deepFloorFactor) * deepAdequacy;
  const restorativeScore = Math.min(100.0, (restorativeShare / restorativeTargetShare) * 100.0) * deepFactor;
  const consistencyScore = clamp((consistency ?? NEUTRAL_CONSISTENCY) * 100.0, 0.0, 100.0);
  const weighted =
    wDuration * durationScore + wEfficiency * efficiencyScore + wRestorative * restorativeScore + wConsistency * consistencyScore;
  return Math.round(weighted * 100.0) / 100.0;
}

/** Rest from a night's stored totals (noop's restFromDaily, at the default need). */
export function restFromTotals(
  night: { totalSleepMin: number | null; efficiency: number | null; deepMin: number | null; remMin: number | null },
  consistency: number | null = null,
): number | null {
  const { totalSleepMin, efficiency } = night;
  if (totalSleepMin == null || efficiency == null || totalSleepMin <= 0.0) return null;
  return rest(totalSleepMin * 60.0, efficiency, (night.deepMin ?? 0.0) * 60.0, (night.remMin ?? 0.0) * 60.0, null, consistency);
}

/**
 * 1 − coefficient of variation of nightly sleep hours, clamped to [0, 1]; null under 3 nights.
 * noop passes the trailing 28 nights.
 */
export function sleepConsistency(nightlyHours: number[]): number | null {
  const xs = nightlyHours.filter((h) => h > 0);
  if (xs.length < 3) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return null;
  const variance = xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / xs.length;
  return clamp(1 - Math.sqrt(variance) / mean, 0.0, 1.0);
}

// ── Sleep debt ─────────────────────────────────────────────────────────────

export const DEFAULT_WINDOW_NIGHTS = 14;
/** Calculated debt below this clears; exactly 10 remains. */
export const ON_TARGET_BAND_MIN = 10.0;
export const DEBT_CARRY = 0.55;

export interface SleepDebtNight {
  day: string;
  sleptMin: number;
  /** sleptMin − needMin; positive = surplus. */
  deltaMin: number;
}

export interface SleepDebtLedger {
  /** Never positive. */
  balanceMin: number;
  /** Oldest → newest; skipped nights absent. */
  nights: SleepDebtNight[];
  needMin: number;
  nightCount: number;
  isDebt: boolean;
  magnitudeMin: number;
}

/** Main-night minutes plus nap credit; null without a usable main sleep. */
export function creditedSleepMin(mainSleepMin: number | null, napSleepMin = 0.0): number | null {
  if (mainSleepMin == null || !(mainSleepMin > 0.0)) return null;
  return mainSleepMin + Math.max(napSleepMin, 0.0);
}

/** Half-away-from-zero to 1 dp. */
export function round1(v: number): number {
  const scaled = v * 10.0;
  return (scaled < 0.0 ? Math.ceil(scaled - 0.5) : Math.floor(scaled + 0.5)) / 10.0;
}

const nextDebt = (needMin: number, currentDebt: number, sleptMin: number): number => {
  const calculated = DEBT_CARRY * Math.max(needMin + currentDebt - sleptMin, 0.0);
  return calculated < ON_TARGET_BAND_MIN ? 0.0 : calculated;
};

/**
 * Ledger over the most recent `window` nights with usable sleep, from chronological `[day, totalSleepMin]`
 * rows. Each night: debt = 0.55 × max(0, need + debt − slept).
 */
export function ledger(
  series: [string, number | null][],
  needHours = defaultSleepNeedHours,
  window = DEFAULT_WINDOW_NIGHTS,
): SleepDebtLedger {
  const needMin = Math.max(needHours, 0.0) * 60.0;
  const cap = Math.max(window, 1);
  const windowed = series.filter(([, slept]) => (slept ?? 0.0) > 0.0).slice(-cap);
  const nights: SleepDebtNight[] = [];
  let debt = 0.0;
  for (const [day, slept] of windowed) {
    const sleptMin = slept ?? 0.0;
    debt = nextDebt(needMin, debt, sleptMin);
    nights.push({ day, sleptMin, deltaMin: sleptMin - needMin });
  }
  const balanceMin = -round1(debt);
  return { balanceMin, nights, needMin, nightCount: nights.length, isDebt: balanceMin < 0.0, magnitudeMin: Math.abs(balanceMin) };
}

/** Per-day debt magnitude, oldest → newest; an imported value wins verbatim for its own day. */
export function debtSeries(
  series: [string, number | null][],
  needHours = defaultSleepNeedHours,
  importedDebtMin: Map<string, number> = new Map(),
  window = DEFAULT_WINDOW_NIGHTS,
): [string, number][] {
  const cap = Math.max(window, 1);
  const usable: [string, number | null][] = [];
  const result: [string, number][] = [];
  for (const [day, slept] of series) {
    const imported = importedDebtMin.get(day);
    const sleptMin = slept != null && slept > 0.0 ? slept : null;
    if (sleptMin != null) {
      usable.push([day, sleptMin]);
      if (usable.length > cap) usable.shift();
    }
    if (imported != null) result.push([day, imported]);
    else if (sleptMin != null) result.push([day, ledger(usable, needHours, cap).magnitudeMin]);
  }
  return result;
}
