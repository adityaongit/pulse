// Ports RecoveryForecast.kt: an evening estimate of tomorrow-morning Recovery from the recent Recovery mean
// plus three signed nudges (strain debt, sleep adequacy, mean reversion), with a ± band. APPROXIMATE.
import { defaultSleepNeedHours } from "./sleep";
import type { ScoreConfidence } from "./types";

export const baselineWindow = 14;
export const minBaselineNights = 5;
export const effortWindow = 14;
export const strainWeight = 9.0;
export const effortSpread = 12.0;
export const strainAdjCap = 12.0;
export const sleepWeight = 14.0;
export const sleepOverCap = 0.25;
export const reversionWeight = 1.0;
export const reversionAdjCap = 8.0;
export const minBandPoints = 8.0;
export const thinBandPoints = 6.0;
export const trustedNights = 10;
export const solidNeedNights = 7;
export const defaultNeedHours = defaultSleepNeedHours;

export interface RecoveryForecast {
  /** Tomorrow-morning Recovery, 0–100, whole number. */
  charge: number;
  /** Symmetric ± band, whole points. */
  band: number;
  /** max(0, charge − band) */
  low: number;
  /** min(100, charge + band) */
  high: number;
  /** Recent Recovery mean the projection is anchored to. */
  baseline: number;
  plannedSleepHours: number;
  needHours: number;
  nights: number;
  confidence: ScoreConfidence;
}

export interface ForecastArgs {
  /** Daily Recovery 0–100, oldest first. */
  recentCharge: number[];
  /** Daily Effort 0–100, oldest first; empty drops the strain term. */
  recentEffort?: number[];
  /** Today's Effort 0–100; null drops the strain term. */
  todayEffort: number | null;
  /** Negative is treated as 0. */
  plannedSleepHours: number;
  /** null → defaultNeedHours. */
  needHours?: number | null;
  /** Nights that informed needHours (0 = still the default). */
  needNights?: number;
}

/** null until there are minBaselineNights of recent Recovery. */
export function forecast(a: ForecastArgs): RecoveryForecast | null {
  const recentEffort = a.recentEffort ?? [];
  const chargeWindow = a.recentCharge.slice(-baselineWindow);
  const nights = chargeWindow.length;
  if (nights < minBaselineNights) return null;

  const center = mean(chargeWindow);
  const sd = sampleSD(chargeWindow);
  const slope = leastSquaresSlope(chargeWindow);

  let strainAdj = 0.0;
  if (a.todayEffort != null && recentEffort.length > 0) {
    const excess = (a.todayEffort - mean(recentEffort.slice(-effortWindow))) / effortSpread;
    strainAdj = clamp(-strainWeight * excess, -strainAdjCap, strainAdjCap);
  }

  const need = Math.max(a.needHours ?? defaultNeedHours, 0.1);
  const sleep = Math.max(a.plannedSleepHours, 0.0);
  const sleepAdj = sleepWeight * clamp(sleep / need - 1.0, -1.0, sleepOverCap);
  const reversionAdj = clamp(-reversionWeight * slope, -reversionAdjCap, reversionAdjCap);

  const charge = Math.round(clamp(center + strainAdj + sleepAdj + reversionAdj, 0.0, 100.0));
  let band = Math.max(sd, minBandPoints);
  if (nights < trustedNights) band += thinBandPoints;
  band = Math.round(band);

  return {
    charge,
    band,
    low: Math.max(0.0, charge - band),
    high: Math.min(100.0, charge + band),
    baseline: center,
    plannedSleepHours: sleep,
    needHours: need,
    nights,
    confidence: nights >= trustedNights && (a.needNights ?? 0) >= solidNeedNights ? "solid" : "building",
  };
}

/** 0 for an empty list. */
export const mean = (values: number[]): number => (values.length === 0 ? 0.0 : values.reduce((s, v) => s + v, 0) / values.length);

/** Sample SD (ddof = 1); 0 for fewer than 2 values. */
export function sampleSD(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0.0;
  const m = mean(values);
  let ss = 0.0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (n - 1));
}

/** OLS slope against the 0-based index; 0 for fewer than 2 points. */
export function leastSquaresSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0.0;
  const meanX = (n - 1) / 2.0;
  const meanY = mean(values);
  let num = 0.0;
  let den = 0.0;
  values.forEach((v, i) => {
    num += (i - meanX) * (v - meanY);
    den += (i - meanX) * (i - meanX);
  });
  return den === 0.0 ? 0.0 : num / den;
}

/** Returns x itself at an inclusive bound, preserving its signed zero. */
export function clamp(x: number, lo: number, hi: number): number {
  if (x < lo) return lo;
  if (x > hi) return hi;
  return x;
}
