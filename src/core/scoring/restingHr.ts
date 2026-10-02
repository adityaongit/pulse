// Ports SleepStager.sessionRestingHR (SleepStager.kt L3242): the lowest gated 5-minute mean HR inside a
// sleep. Recovery's RHR term and its 2 bpm floor were tuned on this construct.
import type { HrSample } from "./types";

/** A bin must hold at least this many samples to win the floor. */
export const rhrMinBinSamples = 5;
/** A bin mean below this is a dropout artefact and cannot win. */
export const rhrMinPlausibleBpm = 25.0;
/** pulse addition, not noop: minutes with at least one HR sample needed before the night has a resting HR. */
export const minHrMinutes = 30;

/**
 * Resting HR (bpm, integer) for a sleep window [start, end], or null. Bins are [t, t + 300) except the
 * final one, which closes on `end`. If no bin passes the gates, falls back to the lowest bin mean.
 */
export function sessionRestingHR(start: number, end: number, hr: HrSample[], minMinutes = minHrMinutes): number | null {
  const seg = hr.filter((s) => s.ts >= start && s.ts <= end);
  if (seg.length === 0) return null;
  if (new Set(seg.map((s) => Math.floor(s.ts / 60))).size < minMinutes) return null;

  const windowS = 5 * 60;
  const gatedMeans: number[] = [];
  const allMeans: number[] = [];
  let t = start;
  do {
    const isFinal = t + windowS >= end;
    const win = seg.filter((s) => s.ts >= t && (isFinal || s.ts < t + windowS));
    if (win.length > 0) {
      const mean = win.reduce((a, s) => a + s.bpm, 0) / win.length;
      allMeans.push(mean);
      if (win.length >= rhrMinBinSamples && mean >= rhrMinPlausibleBpm) gatedMeans.push(mean);
    }
    t += windowS;
  } while (t < end);

  if (gatedMeans.length > 0) return Math.round(Math.min(...gatedMeans));
  if (allMeans.length > 0) return Math.round(Math.min(...allMeans));
  return Math.round(seg.reduce((a, s) => a + s.bpm, 0) / seg.length);
}
