// Own algorithm (docs/algorithms/health-monitor.md): last night's five vitals against personal ranges
// (baseline mean ± 2σ from the Winsorized EWMA baselines, SpO2 also floored at 95 %), plus noop's
// illness signal as the combined flag.
import { foldHistory, hrvCfg, isUsable, respCfg, restingHRCfg, sigma, skinTempCfg } from "../scoring/baselines";
import { illnessFromDays, type IllnessContext, type IllnessDay, type IllnessResult } from "../scoring/illness";
import type { MetricCfg } from "../scoring/types";

export const healthMonitorConfig = {
  /** Range half-width in σ (spec). */
  rangeSigmas: 2,
  /** SpO2 below this is low whatever the personal range (spec). */
  spo2FloorPct: 95,
  /** SpO2 baseline (*tunable*): plausible 70–100 %, floor spread 0.5 points. */
  spo2Cfg: { minVal: 70, maxVal: 100, floorSpread: 0.5, halfLifeB: 14, halfLifeS: 21 } as MetricCfg,
  /** Skin-temperature deviation baseline, °C (*tunable*): ±5 °C plausible, skin_temp's floor spread. */
  skinTempDevCfg: { ...skinTempCfg, minVal: -5, maxVal: 5 } as MetricCfg,
};

export type VitalKey = "restingHr" | "hrv" | "resp" | "spo2" | "skinTempDev";
export type VitalStatus = "in_range" | "high" | "low" | "no_data";

/** One night, oldest first; the last row is the night being shown. */
export interface HealthMonitorDay extends IllnessDay {
  /** Nightly SpO2, %. */
  spo2?: number | null;
}

export interface VitalReading {
  key: VitalKey;
  value: number | null;
  /** null while the baseline is not usable. */
  range: { low: number; high: number } | null;
  /** no_data when the value or a usable baseline is missing. */
  status: VitalStatus;
}

export interface HealthMonitorResult {
  vitals: VitalReading[];
  /** "N of 5 in range". */
  inRange: number;
  /** Vitals that are high or low. */
  flagged: number;
  illness: IllnessResult & { baselineTrusted: boolean };
}

const vitals: [VitalKey, (d: HealthMonitorDay) => number | null | undefined, MetricCfg][] = [
  ["restingHr", (d) => d.rhr, restingHRCfg],
  ["hrv", (d) => d.hrv, hrvCfg],
  ["resp", (d) => d.resp, respCfg],
  ["spo2", (d) => d.spo2, healthMonitorConfig.spo2Cfg],
  ["skinTempDev", (d) => d.skinTempDev, healthMonitorConfig.skinTempDevCfg],
];

/**
 * @param days nightly rows oldest first; the newest is shown, the rest are its history. Use the same causal
 *   `skinTempDev` (°C from the skin-temperature baseline) that Recovery uses.
 * @param journal same-day confounders for the illness signal.
 */
export function healthMonitor(days: HealthMonitorDay[], journal: Omit<IllnessContext, "baselineTrusted"> = {}): HealthMonitorResult {
  const c = healthMonitorConfig;
  const latest = days.at(-1);
  const prior = days.slice(0, -1);
  const readings = vitals.map(([key, pick, cfg]): VitalReading => {
    const value = latest ? (pick(latest) ?? null) : null;
    const state = foldHistory(prior.map((d) => pick(d) ?? null), cfg);
    if (!isUsable(state)) return { key, value, range: null, status: "no_data" };
    let low = state.baseline - c.rangeSigmas * sigma(state);
    let high = state.baseline + c.rangeSigmas * sigma(state);
    // SpO2 is one-sided: never high, and low below the floor even inside the personal range.
    if (key === "spo2") [low, high] = [Math.max(low, c.spo2FloorPct), 100];
    const status: VitalStatus = value == null ? "no_data" : value < low ? "low" : value > high ? "high" : "in_range";
    return { key, value, range: { low, high }, status };
  });
  return {
    vitals: readings,
    inRange: readings.filter((r) => r.status === "in_range").length,
    flagged: readings.filter((r) => r.status === "high" || r.status === "low").length,
    illness: illnessFromDays(days, journal),
  };
}
