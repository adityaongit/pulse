// Ports Baselines.kt: Winsorized EWMA personal baselines, plus the BaselineState.usable / trusted getters
// from AnalyticsModels.kt. Not ported: the manual-recalibration epoch fold and the device-era boundary.
import type { BaselineState, BaselineStatus, Deviation, MetricCfg } from "./types";

export const winsorK = 3.0;
export const hardOutlierK = 5.0;
export const minNightsSeed = 4;
export const minNightsTrust = 14;
export const staleDays = 14;
/** Days a nightly vital may be carried forward and still shown as "latest". */
export const vitalCarryDays = 7;

// Young regime: below earlyAdaptNights valid nights the centre adapts fast and the hard gate is off.
export const earlyAdaptNights = 8;
export const earlyHalfLifeB = 3.0;
export const earlySpreadInflate = 2.5;

const cfg = (minVal: number, maxVal: number, floorSpread: number): MetricCfg => ({
  minVal,
  maxVal,
  floorSpread,
  halfLifeB: 14.0,
  halfLifeS: 21.0,
});

export const metricCfg = {
  hrv: cfg(5.0, 250.0, 5.0),
  resting_hr: cfg(30.0, 120.0, 2.0),
  resp: cfg(4.0, 40.0, 0.5),
  skin_temp: cfg(20.0, 42.0, 0.3),
  /** Daily Effort on its 0–100 axis. */
  strain: cfg(0.0, 100.0, 5.0),
  /** ln(ms), folded with hard-outlier rejection off (Readiness). */
  readiness_hrv_ln: cfg(2.079, 5.521, 0.08),
  daytime_hr: cfg(35.0, 160.0, 3.0),
  daytime_rmssd: cfg(5.0, 250.0, 7.0),
} satisfies Record<string, MetricCfg>;

export const hrvCfg = metricCfg.hrv;
export const restingHRCfg = metricCfg.resting_hr;
export const respCfg = metricCfg.resp;
export const skinTempCfg = metricCfg.skin_temp;
export const strainCfg = metricCfg.strain;
export const readinessHRVLnCfg = metricCfg.readiness_hrv_ln;
export const daytimeHRCfg = metricCfg.daytime_hr;
export const daytimeRMSSDCfg = metricCfg.daytime_rmssd;

export const isTrusted = (s: BaselineState): boolean => s.status === "trusted";
/** At least provisionally usable (nValid ≥ minNightsSeed and not stale). */
export const isUsable = (s: BaselineState): boolean => s.status === "provisional" || s.status === "trusted";

/** Half-life in nights → EWMA smoothing factor. */
export const lambda = (halfLife: number): number => 1.0 - 0.5 ** (1.0 / halfLife);

export function computeStatus(nValid: number, nightsSinceUpdate: number): BaselineStatus {
  if (nightsSinceUpdate > staleDays && nValid >= minNightsSeed) return "stale";
  if (nValid < minNightsSeed) return "calibrating";
  if (nValid < minNightsTrust) return "provisional";
  return "trusted";
}

const state = (baseline: number, spread: number, nValid: number, nightsSinceUpdate: number): BaselineState => ({
  baseline,
  spread,
  nValid,
  nightsSinceUpdate,
  status: computeStatus(nValid, nightsSinceUpdate),
});

const inRange = (v: number | null, cfg: MetricCfg): v is number => v != null && cfg.minVal <= v && v <= cfg.maxVal;

/**
 * Fold one nightly value. null or out-of-range skips and holds; a hard outlier (once settled) is seen but
 * not folded; otherwise a Winsorized EWMA centre and an EWMA-abs-dev spread.
 * `rejectHardOutliers = false` is the trailing-window re-fold mode (Readiness).
 */
export function update(
  prev: BaselineState | null,
  value: number | null,
  cfg: MetricCfg,
  rejectHardOutliers = true,
): BaselineState {
  const lb = lambda(cfg.halfLifeB);
  const ls = lambda(cfg.halfLifeS);

  if (prev == null) {
    if (inRange(value, cfg)) return { baseline: value, spread: cfg.floorSpread, nValid: 1, nightsSinceUpdate: 0, status: "calibrating" };
    const seed = (cfg.minVal + cfg.maxVal) / 2.0;
    return { baseline: seed, spread: cfg.floorSpread, nValid: 0, nightsSinceUpdate: 1, status: "calibrating" };
  }

  if (!inRange(value, cfg)) return state(prev.baseline, prev.spread, prev.nValid, prev.nightsSinceUpdate + 1);

  const isYoung = prev.nValid < earlyAdaptNights;

  if (rejectHardOutliers && prev.nValid >= minNightsSeed && !isYoung) {
    if (Math.abs(value - prev.baseline) > hardOutlierK * prev.spread) {
      return state(prev.baseline, prev.spread, prev.nValid, 0);
    }
  }

  // First real value after a placeholder seed.
  if (prev.nValid === 0) {
    return { baseline: value, spread: cfg.floorSpread, nValid: 1, nightsSinceUpdate: 0, status: "calibrating" };
  }

  const effSpread = isYoung ? prev.spread * earlySpreadInflate : prev.spread;
  const effLb = isYoung ? lambda(earlyHalfLifeB) : lb;
  const lo = prev.baseline - winsorK * effSpread;
  const hi = prev.baseline + winsorK * effSpread;
  const clamped = Math.max(lo, Math.min(hi, value));
  const newBaseline = effLb * clamped + (1.0 - effLb) * prev.baseline;

  // Spread tracks the UNCLAMPED value.
  const absDev = Math.abs(value - newBaseline);
  const newSpread = Math.max(cfg.floorSpread, ls * absDev + (1.0 - ls) * prev.spread);
  return state(newBaseline, newSpread, prev.nValid + 1, 0);
}

/** Replay nightly values oldest first; null is a missing night. */
export function foldHistory(values: (number | null)[], cfg: MetricCfg, rejectHardOutliers = true): BaselineState {
  let s: BaselineState | null = null;
  for (const v of values) s = update(s, v, cfg, rejectHardOutliers);
  if (s) return s;
  const seed = (cfg.minVal + cfg.maxVal) / 2.0;
  return { baseline: seed, spread: cfg.floorSpread, nValid: 0, nightsSinceUpdate: 0, status: "calibrating" };
}

/** Gaussian σ from the abs-dev spread: 1.253 × spread, floored away from zero. */
export const sigma = (s: BaselineState): number => Math.max(1.253 * s.spread, 1e-9);

export function deviation(value: number, s: BaselineState): Deviation {
  const z = (value - s.baseline) / sigma(s);
  const ratio = s.baseline !== 0 ? value / s.baseline - 1.0 : 0.0;
  return { z, delta: value - s.baseline, ratio, inNormalRange: Math.abs(z) <= 1.0 };
}

/** Plain trailing mean and sample SD over the last `window` valid nights; spread stored as SD / 1.253. */
export function rollingMeanSD(values: (number | null)[], cfg: MetricCfg, window = 30): BaselineState {
  const valid = values.filter((v): v is number => inRange(v, cfg));
  if (valid.length === 0) {
    const seed = (cfg.minVal + cfg.maxVal) / 2.0;
    return { baseline: seed, spread: cfg.floorSpread, nValid: 0, nightsSinceUpdate: 0, status: "calibrating" };
  }
  const trailing = valid.slice(-window);
  const n = trailing.length;
  const mean = trailing.reduce((a, b) => a + b, 0) / n;
  let sd: number;
  if (n >= 2) {
    let ss = 0;
    for (const v of trailing) ss += (v - mean) * (v - mean);
    sd = Math.sqrt(ss / (n - 1));
  } else {
    sd = cfg.floorSpread * 1.253;
  }
  return state(mean, Math.max(cfg.floorSpread, sd) / 1.253, n, 0);
}

// ── Civil-day arithmetic (replaces java.time) ──────────────────────────────

const parseInt32 = (s: string): number | null => (/^[+-]?\d+$/.test(s) ? Number(s) : null);

/** Days from 1970-01-01 for an ISO `yyyy-MM-dd`, or null if unparseable (Howard Hinnant's algorithm). */
export function isoEpochDay(iso: string): number | null {
  const p = iso.split("-");
  if (p.length !== 3) return null;
  const y = parseInt32(p[0]);
  const m = parseInt32(p[1]);
  const d = parseInt32(p[2]);
  if (y == null || m == null || d == null) return null;
  if (m < 1 || m > 12) return null;
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of isoEpochDay. */
const epochDayToIso = (day: number): string => new Date(day * 86_400_000).toISOString().slice(0, 10);

/** The oldest `yyyy-MM-dd` a carried vital may bear; an unparseable key fails closed to itself. */
export function cutoffKey(todayKey: string, carryDays = vitalCarryDays): string {
  const t = isoEpochDay(todayKey);
  return t == null ? todayKey : epochDayToIso(t - carryDays);
}

/** The newest point if it is still fresh enough to present as "latest". `points` sorted oldest first. */
export function freshestCarried<T>(
  points: [string, T][],
  todayKey: string,
  carryDays = vitalCarryDays,
): [string, T] | null {
  const newest = points.at(-1);
  if (!newest) return null;
  return newest[0] >= cutoffKey(todayKey, carryDays) ? newest : null;
}

/** Calendar days since the newest night with a usable HRV, or null. `dayKeys` and `nightlyHrv` are parallel. */
export function nightsSinceNewestValidNight(
  dayKeys: string[],
  nightlyHrv: (number | null)[],
  today: string,
): number | null {
  let newest: string | null = null;
  for (let i = 0; i < Math.min(dayKeys.length, nightlyHrv.length); i++) {
    if (nightlyHrv[i] == null) continue;
    if (newest == null || dayKeys[i] > newest) newest = dayKeys[i];
  }
  if (newest == null) return null;
  const a = isoEpochDay(newest);
  const b = isoEpochDay(today);
  if (a == null || b == null) return null;
  return b - a >= 0 ? b - a : null;
}

/** Nights observed in the trailing window, and how many of them carried no HRV. */
export function recentHrvCoverage(
  dayKeys: string[],
  nightlyHrv: (number | null)[],
  today: string,
  window = staleDays,
): { observed: number; missing: number } {
  const t = isoEpochDay(today);
  if (t == null) return { observed: 0, missing: 0 };
  let observed = 0;
  let missing = 0;
  for (let i = 0; i < Math.min(dayKeys.length, nightlyHrv.length); i++) {
    const d = isoEpochDay(dayKeys[i]);
    if (d == null || t - d < 0 || t - d >= window) continue;
    observed++;
    if (nightlyHrv[i] == null) missing++;
  }
  return { observed, missing };
}
