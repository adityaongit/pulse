// Ports HeartRateRecovery.kt: HR drop 1, 2 and 5 minutes after a sufficiently intense workout. Missing
// post-workout coverage stays null; nothing is interpolated across a gap.
import type { HrSample } from "./types";

export const eligibilityFractionOfMaxHr = 0.7;
export const minimumHighIntensitySeconds = 120;
export const eligibilityLookbackSeconds = 300;
export const cessationWindowSeconds = 30;
/** A reading uses samples within ± this of end + N minutes. */
export const measurementToleranceSeconds = 15;
export const minimumSamplesPerReading = 3;
export const maximumContinuousGapSeconds = 10;

export interface HrRecoveryResult {
  /** Peak bpm in the last 30 s of the workout. */
  endHr: number;
  /** endHr − median bpm around +60 s (HRR60); negative if HR rose. */
  after1Minute: number | null;
  after2Minutes: number | null;
  after5Minutes: number | null;
}

/**
 * null unless HR held ≥ 70% maxHr for 120 s continuously (gaps ≤ 10 s) in the workout's last 5 minutes,
 * the last 30 s hold ≥ 3 samples, and at least one of the 1/2/5-minute readings has ≥ 3 samples.
 */
export function hrRecovery(samples: HrSample[], workoutStart: number, workoutEnd: number, maxHr: number): HrRecoveryResult | null {
  if (workoutStart <= 0 || workoutEnd <= workoutStart || maxHr <= 0.0) return null;
  const lowerBound = Math.max(workoutStart, workoutEnd - eligibilityLookbackSeconds);
  const upperBound = workoutEnd + 5 * 60 + measurementToleranceSeconds;
  const sorted = samples
    .filter((s) => s.ts >= lowerBound && s.ts <= upperBound && s.bpm >= 30 && s.bpm <= 250)
    .sort((a, b) => a.ts - b.ts || a.bpm - b.bpm);
  if (sorted.length < minimumSamplesPerReading) return null;

  const beforeEnd = sorted.filter((s) => s.ts <= workoutEnd);
  if (sustainedSeconds(maxHr * eligibilityFractionOfMaxHr, beforeEnd) < minimumHighIntensitySeconds) return null;

  const cessation = beforeEnd.filter((s) => s.ts >= workoutEnd - cessationWindowSeconds).map((s) => s.bpm);
  if (cessation.length < minimumSamplesPerReading) return null;
  const endHr = Math.max(...cessation);

  const reading = (minutes: number): number | null => {
    const target = workoutEnd + minutes * 60;
    const values = sorted.filter((s) => Math.abs(s.ts - target) <= measurementToleranceSeconds).map((s) => s.bpm);
    return values.length < minimumSamplesPerReading ? null : endHr - median(values);
  };

  const result = { endHr, after1Minute: reading(1), after2Minutes: reading(2), after5Minutes: reading(5) };
  return result.after1Minute != null || result.after2Minutes != null || result.after5Minutes != null ? result : null;
}

/** Longest run of intervals whose left sample is ≥ threshold, reset by a gap > 10 s. */
function sustainedSeconds(threshold: number, samples: HrSample[]): number {
  let current = 0;
  let longest = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const gap = samples[i + 1].ts - samples[i].ts;
    if (gap <= 0) continue;
    if (gap > maximumContinuousGapSeconds || samples[i].bpm < threshold) {
      current = 0;
      continue;
    }
    current += gap;
    longest = Math.max(longest, current);
  }
  return longest;
}

/** Even counts average the middle pair, rounded half up. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? Math.round((s[mid - 1] + s[mid]) / 2.0) : s[mid];
}
