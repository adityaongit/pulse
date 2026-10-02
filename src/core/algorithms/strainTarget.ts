// Own algorithm (docs/algorithms/strain-target.md): today's Day Strain range on WHOOP's 0–21 scale, from the
// 28-day mean strain scaled by the Recovery band, capped or lifted by the acute:chronic workload ratio.
import { band, type RecoveryBand } from "../scoring/recovery";
import { toWhoopStrain } from "../scoring/strain";

export const strainTargetConfig = {
  /** Days of history behind the base (spec). */
  windowDays: 28,
  /** Fewer days with strain than this → the cold-start defaults (spec). */
  minDays: 14,
  /** Multipliers on the base by Recovery band (*tunable*). */
  multipliers: { green: [1.0, 1.25], yellow: [0.8, 1.0], red: [0.5, 0.75] } as Record<RecoveryBand, readonly [number, number]>,
  /** Cold-start ranges by band, 0–21 (*tunable*). */
  coldStart: { green: [14, 18], yellow: [10, 14], red: [6, 10] } as Record<RecoveryBand, readonly [number, number]>,
  /** ACWR above this caps the upper bound at the base (spec; readiness' "building fast" edge). */
  acwrCapAbove: 1.3,
  /** ACWR below this lifts both bounds by `lift` (spec; readiness' "ramping down" edge). */
  acwrLiftBelow: 0.8,
  lift: 0.1,
  /** Bounds, 0–21 (*tunable*). */
  min: 4,
  max: 19,
  minWidth: 2,
};

export interface StrainTarget {
  /** 0–21. */
  low: number;
  high: number;
  /** Mean daily strain over the window, 0–21; null on a cold start. */
  base: number | null;
  band: RecoveryBand;
  coldStart: boolean;
  acwrRule: "capped" | "lifted" | null;
}

/**
 * @param priorEffort daily Effort (0–100) for the days before today, oldest first; null is a day without strain.
 * @param recovery today's Recovery, 0–100.
 * @param acwr readiness' ACWR over the same days, or null.
 */
export function strainTarget(priorEffort: (number | null)[], recovery: number, acwr: number | null): StrainTarget {
  const c = strainTargetConfig;
  const b = band(recovery);
  const days = priorEffort.slice(-c.windowDays).filter((v): v is number => v != null).map(toWhoopStrain);
  if (days.length < c.minDays) {
    const [low, high] = c.coldStart[b];
    return { low, high, base: null, band: b, coldStart: true, acwrRule: null };
  }

  const base = days.reduce((a, v) => a + v, 0) / days.length;
  let [low, high] = c.multipliers[b].map((k) => k * base);
  let acwrRule: StrainTarget["acwrRule"] = null;
  if (acwr != null && acwr > c.acwrCapAbove) {
    high = Math.min(high, base);
    acwrRule = "capped";
  } else if (acwr != null && acwr < c.acwrLiftBelow) {
    low *= 1 + c.lift;
    high *= 1 + c.lift;
    acwrRule = "lifted";
  }
  low = Math.min(c.max, Math.max(c.min, low));
  high = Math.min(c.max, Math.max(c.min, high));
  // Widen downwards, so a cap on the upper bound holds.
  if (high - low < c.minWidth) {
    low = Math.max(c.min, high - c.minWidth);
    high = low + c.minWidth;
  }
  return { low, high, base, band: b, coldStart: false, acwrRule };
}
