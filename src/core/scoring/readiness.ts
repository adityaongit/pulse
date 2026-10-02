// Ports ReadinessEngine.kt (HRV / RHR / resp z-signals, ACWR, Foster monotony → a level) and the
// evaluateWithTrainingLoad wrapper from ReadinessTrainingLoad.kt. Not ported: the memo cache and copy ids.
import { foldHistory, isUsable, readinessHRVLnCfg, restingHRCfg } from "./baselines";
import { readiness as readinessConfidence } from "./confidence";
import { evaluate as evaluateTrainingLoad, standardConfig, type TrainingLoadConfig, type TrainingLoadResult } from "./trainingLoad";
import type { MetricCfg, ScoreConfidence } from "./types";

/** One DailyMetric row's readiness fields. `effort` is daily Effort 0–100. */
export interface ReadinessDay {
  day: string;
  hrv?: number | null;
  rhr?: number | null;
  resp?: number | null;
  effort?: number | null;
}

export type ReadinessLevel = "primed" | "balanced" | "strained" | "rundown" | "insufficient";
export type ReadinessFlag = "good" | "neutral" | "watch" | "bad";
export type ReadinessSignalKey = "hrv" | "rhr" | "respRate" | "acwr" | "monotony";
export type ReadinessDetail =
  | "HRV_GOOD" | "HRV_WATCH" | "HRV_BAD"
  | "RHR_GOOD" | "RHR_WATCH" | "RHR_BAD"
  | "RESP_WATCH" | "RESP_BAD"
  | "NORMAL_RANGE"
  | "LOAD_RAMPING_DOWN" | "LOAD_SWEET_SPOT" | "LOAD_BUILDING_FAST" | "LOAD_SPIKING"
  | "MONOTONY_WATCH";

export type ReadinessEvidence =
  | { kind: "metricVsBaseline"; value: number; baseline: number; decimals: number; unit: "ms" | "bpm" | "rpm" }
  | { kind: "monotony"; value: number }
  | { kind: "trainingLoad"; acute: number; chronic: number };

export interface ReadinessSignal {
  key: ReadinessSignalKey;
  flag: ReadinessFlag;
  detail: ReadinessDetail;
  evidence: ReadinessEvidence | null;
}

export interface Readiness {
  level: ReadinessLevel;
  signals: ReadinessSignal[];
  /** Acute:chronic workload ratio, or null without enough Effort history. */
  acwr: number | null;
  /** Foster monotony over the last week, or null. */
  monotony: number | null;
  confidence: ScoreConfidence;
}

export const baselineWindow = 30;
export const minBaseline = 7;
export const acuteWindow = 7;
export const chronicWindow = 28;
export const minChronic = 14;
export const respZWatch = 1.5;
export const respZBad = 2.0;
/** SleepStager.respPlausibleRangeBpm, inclusive. */
export const respPlausibleRange = { min: 8.0, max: 25.0 };
export const monotonyWatch = 2.0;

const inResp = (v: number) => v >= respPlausibleRange.min && v <= respPlausibleRange.max;

export const mean = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** Sample SD (n − 1); null for fewer than 2 points. */
export function sampleSD(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) as number;
  return Math.sqrt(xs.reduce((acc, x) => acc + (x - m) * (x - m), 0) / (xs.length - 1));
}

const pick = (rows: ReadinessDay[], f: (d: ReadinessDay) => number | null | undefined): number[] =>
  rows.map(f).filter((v): v is number => v != null);

function zSignal(
  value: number | null | undefined,
  baseline: number[],
  key: "hrv" | "rhr",
  unit: "ms" | "bpm",
  higherIsBetter: boolean,
  cfg: MetricCfg,
  logDomain: boolean,
): ReadinessSignal | null {
  if (value == null || baseline.length < minBaseline) return null;
  // HRV is z-scored on lnRMSSD; the trailing window re-folds with hard-outlier rejection off.
  const tv = logDomain ? Math.log(Math.max(value, 1.0)) : value;
  const tb = logDomain ? baseline.map((b) => Math.log(Math.max(b, 1.0))) : baseline;
  const state = foldHistory(tb, cfg, false);
  if (!isUsable(state)) return null;
  const sigma = Math.max(1.253 * state.spread, 1e-9);
  if (sigma <= 0) return null;
  const m = state.baseline;
  const z = (higherIsBetter ? tv - m : m - tv) / sigma;
  const prefix = key === "hrv" ? "HRV" : "RHR";
  let flag: ReadinessFlag;
  let detail: ReadinessDetail;
  if (z >= 0.5) [flag, detail] = ["good", `${prefix}_GOOD`];
  else if (z >= -0.5) [flag, detail] = ["neutral", "NORMAL_RANGE"];
  else if (z >= -1.0) [flag, detail] = ["watch", `${prefix}_WATCH`];
  else [flag, detail] = ["bad", `${prefix}_BAD`];
  const evidence: ReadinessEvidence = { kind: "metricVsBaseline", value, baseline: logDomain ? Math.exp(m) : m, decimals: 0, unit };
  return { key, flag, detail, evidence };
}

/** ACWR band: < 0.8 ramping down (watch), < 1.3 sweet spot (good), < 1.5 building fast (watch), else spiking (bad). */
export function acwrSignal(ratio: number, acute: number, chronic: number): ReadinessSignal {
  const evidence: ReadinessEvidence = { kind: "trainingLoad", acute, chronic };
  if (ratio < 0.8) return { key: "acwr", flag: "watch", detail: "LOAD_RAMPING_DOWN", evidence };
  if (ratio < 1.3) return { key: "acwr", flag: "good", detail: "LOAD_SWEET_SPOT", evidence };
  if (ratio < 1.5) return { key: "acwr", flag: "watch", detail: "LOAD_BUILDING_FAST", evidence };
  return { key: "acwr", flag: "bad", detail: "LOAD_SPIKING", evidence };
}

function synthesize(signals: ReadinessSignal[], hasHistory: boolean): ReadinessLevel {
  if (!hasHistory || signals.length === 0) return "insufficient";
  const bad = signals.filter((s) => s.flag === "bad").length;
  const watch = signals.filter((s) => s.flag === "watch").length;
  const good = signals.filter((s) => s.flag === "good").length;
  const recoveryDown = signals.some((s) => (s.key === "hrv" || s.key === "rhr" || s.key === "respRate") && s.flag === "bad");
  const loadHigh = signals.some((s) => s.key === "acwr" && s.flag === "bad");
  if (bad >= 2 || (recoveryDown && loadHigh)) return "rundown";
  if (recoveryDown || loadHigh || bad >= 1) return "strained";
  if (good >= 2 && watch === 0) return "primed";
  return "balanced";
}

/**
 * Readiness from daily rows in any order. "Today" is the row for `today` when given (none → insufficient),
 * else the newest row. As in noop, the Effort series for ACWR / monotony spans every row, even after `today`.
 */
export function evaluate(days: ReadinessDay[], today: string | null = null): Readiness {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const latest = today != null ? sorted.find((d) => d.day === today) : sorted.at(-1);
  if (!latest) return { level: "insufficient", signals: [], acwr: null, monotony: null, confidence: "calibrating" };
  const history = sorted.filter((d) => d.day < latest.day);
  const recent = history.slice(-baselineWindow);
  const signals: ReadinessSignal[] = [];

  const hrv = zSignal(latest.hrv, pick(recent, (d) => d.hrv), "hrv", "ms", true, readinessHRVLnCfg, true);
  if (hrv) signals.push(hrv);
  const rhr = zSignal(latest.rhr, pick(recent, (d) => d.rhr), "rhr", "bpm", false, restingHRCfg, false);
  if (rhr) signals.push(rhr);

  const rr = latest.resp;
  if (rr != null && inResp(rr)) {
    const base = pick(recent, (d) => d.resp);
    const m = mean(base);
    const sd = sampleSD(base);
    if (base.length >= minBaseline && m != null && inResp(m) && sd != null && sd > 0) {
      const z = (rr - m) / sd;
      const evidence: ReadinessEvidence = { kind: "metricVsBaseline", value: rr, baseline: m, decimals: 1, unit: "rpm" };
      if (z >= respZBad) signals.push({ key: "respRate", flag: "bad", detail: "RESP_BAD", evidence });
      else if (z >= respZWatch) signals.push({ key: "respRate", flag: "watch", detail: "RESP_WATCH", evidence });
    }
  }

  const effort = pick(sorted, (d) => d.effort);
  let acwr: number | null = null;
  let monotony: number | null = null;
  if (effort.length >= minChronic) {
    const acute = mean(effort.slice(-acuteWindow)) as number;
    const chronic = mean(effort.slice(-chronicWindow)) as number;
    if (chronic > 0) {
      acwr = acute / chronic;
      signals.push(acwrSignal(acwr, acute, chronic));
    }
    const week = effort.slice(-acuteWindow);
    const sd = sampleSD(week);
    const m = mean(week);
    if (week.length >= 4 && sd != null && sd > 0 && m != null) {
      monotony = m / sd;
      if (monotony >= monotonyWatch) {
        signals.push({ key: "monotony", flag: "watch", detail: "MONOTONY_WATCH", evidence: { kind: "monotony", value: monotony } });
      }
    }
  }

  const level = synthesize(signals, history.length > 0 || acwr != null);
  const confidence = readinessConfidence(level !== "insufficient", pick(recent, (d) => d.hrv).length, baselineWindow);
  return { level, signals, acwr, monotony, confidence };
}

/** Readiness plus CTL/ATL/TSB over the same rows; training load never feeds the readiness level. */
export function evaluateWithTrainingLoad(
  days: ReadinessDay[],
  today: string | null = null,
  config: TrainingLoadConfig = standardConfig,
): { readiness: Readiness; trainingLoad: TrainingLoadResult } {
  return {
    readiness: evaluate(days, today),
    trainingLoad: evaluateTrainingLoad(
      days.map((d) => ({ day: d.day, load: d.effort ?? null })),
      today,
      config,
    ),
  };
}
