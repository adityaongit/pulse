// Ports RecoveryDrivers.kt: the "What shaped it" rows under the Charge score. Each row's deltaPoints is
// the score minus the score with that term held at its baseline (z = 0): a marginal effect, so the rows
// are not additive far from baseline.
import { isUsable } from "./baselines";
import { parasympatheticSaturation, recoveryFromStates, sleepPerfCenter, zScore } from "./recovery";
import type { BaselineState } from "./types";

export type ChargeDriverLabel =
  | "HEART_RATE_VARIABILITY"
  | "RESTING_HEART_RATE"
  | "SLEEP_QUALITY"
  | "RESPIRATORY_RATE"
  | "SKIN_TEMPERATURE";

export type ChargeDriverUnit = "MILLISECONDS" | "BEATS_PER_MINUTE" | "PERCENT" | "BREATHS_PER_MINUTE" | "CELSIUS_DEVIATION";

export type ChargeDriverVerdict =
  | "ABOVE_BASELINE_SUPPORTING"
  | "BELOW_BASELINE_SUPPORTING"
  | "ABOVE_BASELINE_LIMITING"
  | "BELOW_BASELINE_LIMITING"
  | "SLIGHTLY_ABOVE_BASELINE_SUPPORTING"
  | "SLIGHTLY_BELOW_BASELINE_SUPPORTING"
  | "SLIGHTLY_ABOVE_BASELINE_LIMITING"
  | "SLIGHTLY_BELOW_BASELINE_LIMITING"
  | "ABOVE_BASELINE_TOO_SMALL"
  | "BELOW_BASELINE_TOO_SMALL"
  | "AT_BASELINE"
  | "HRV_SATURATION_LIMITING"
  | "STRONG_NIGHT_SUPPORTING"
  | "BELOW_GOOD_NIGHT_LIMITING"
  | "TYPICAL_NIGHT"
  | "NEAR_BASELINE"
  | "WARMER_THAN_BASELINE_LIMITING"
  | "COOLER_THAN_BASELINE_LIMITING";

export interface ChargeDriver {
  label: ChargeDriverLabel;
  /** Signed points versus this signal sitting at its baseline. */
  deltaPoints: number;
  value: number;
  /** null for skin temp (already relative) and sleep quality (fixed centre). */
  baseline: number | null;
  unit: ChargeDriverUnit;
  verdict: ChargeDriverVerdict;
}

export interface ChargeDriverArgs {
  hrv: number;
  rhr: number | null;
  resp?: number | null;
  hrvBaseline: BaselineState;
  rhrBaseline?: BaselineState | null;
  respBaseline?: BaselineState | null;
  /** In [0, 1]. */
  sleepPerf?: number | null;
  skinTempDev?: number | null;
}

/** Driver rows sorted biggest mover first; empty when the score itself cannot compute. */
export function chargeDrivers(a: ChargeDriverArgs): ChargeDriver[] {
  const rhrB = a.rhrBaseline && isUsable(a.rhrBaseline) ? a.rhrBaseline : null;
  const args = { ...a, rhrBaseline: rhrB };
  const full = recoveryFromStates(args);
  if (full == null) return [];

  const points = (neutralised: number | null): number => {
    const delta = full - (neutralised ?? full);
    // Nearest integer, half-ties away from zero.
    const n = delta < 0.0 ? -Math.round(-delta) : Math.round(delta);
    return n === 0 ? 0 : n; // no -0: Kotlin Int has none
  };

  const hrvZFull = zScore(a.hrv, a.hrvBaseline.baseline, a.hrvBaseline.spread);
  const rhrZFull = rhrB && a.rhr != null ? zScore(rhrB.baseline, a.rhr, rhrB.spread) : null;
  const saturationDetected = parasympatheticSaturation(hrvZFull, rhrZFull).active;

  const drivers: ChargeDriver[] = [];

  const hrvPoints = points(recoveryFromStates({ ...args, hrv: a.hrvBaseline.baseline }));
  drivers.push({
    label: "HEART_RATE_VARIABILITY",
    deltaPoints: hrvPoints,
    value: a.hrv,
    baseline: a.hrvBaseline.baseline,
    unit: "MILLISECONDS",
    verdict: hrvVerdict(a.hrv, a.hrvBaseline.baseline, hrvPoints, saturationDetected),
  });

  if (rhrB && a.rhr != null) {
    const rhrPoints = points(recoveryFromStates({ ...args, rhr: rhrB.baseline }));
    drivers.push({
      label: "RESTING_HEART_RATE",
      deltaPoints: rhrPoints,
      value: a.rhr,
      baseline: rhrB.baseline,
      unit: "BEATS_PER_MINUTE",
      verdict: baselineVerdict(a.rhr, rhrB.baseline, rhrPoints, 0),
    });
  }

  if (a.sleepPerf != null) {
    drivers.push({
      label: "SLEEP_QUALITY",
      deltaPoints: points(recoveryFromStates({ ...args, sleepPerf: sleepPerfCenter })),
      value: a.sleepPerf * 100.0,
      baseline: null,
      unit: "PERCENT",
      verdict: sleepVerdict(a.sleepPerf),
    });
  }

  if (a.resp != null && a.respBaseline) {
    const respPoints = points(recoveryFromStates({ ...args, resp: a.respBaseline.baseline }));
    drivers.push({
      label: "RESPIRATORY_RATE",
      deltaPoints: respPoints,
      value: a.resp,
      baseline: a.respBaseline.baseline,
      unit: "BREATHS_PER_MINUTE",
      verdict: baselineVerdict(a.resp, a.respBaseline.baseline, respPoints, 1),
    });
  }

  if (a.skinTempDev != null) {
    const skinPoints = points(recoveryFromStates({ ...args, skinTempDev: 0.0 }));
    drivers.push({
      label: "SKIN_TEMPERATURE",
      deltaPoints: skinPoints,
      value: a.skinTempDev,
      baseline: null,
      unit: "CELSIUS_DEVIATION",
      verdict: skinTempVerdict(a.skinTempDev, skinPoints),
    });
  }

  // Stable sort keeps the append order on ties.
  return drivers.sort((x, y) => Math.abs(y.deltaPoints) - Math.abs(x.deltaPoints));
}

function hrvVerdict(value: number, baseline: number, deltaPoints: number, saturationDetected: boolean): ChargeDriverVerdict {
  const verdict = baselineVerdict(value, baseline, deltaPoints, 0);
  return saturationDetected && verdict === "BELOW_BASELINE_LIMITING" ? "HRV_SATURATION_LIMITING" : verdict;
}

/** The value as a row shows it, rounded half away from zero. */
export function displayRounded(value: number, fractionDigits: number): number {
  const scale = fractionDigits === 0 ? 1.0 : fractionDigits === 1 ? 10.0 : 10.0 ** fractionDigits;
  const scaled = value * scale;
  const rounded = scaled < 0.0 ? -Math.round(-scaled) : Math.round(scaled);
  return rounded / scale;
}

/** Direction follows the displayed precision; effect follows the rounded deltaPoints. */
export function baselineVerdict(
  value: number,
  baseline: number,
  deltaPoints: number,
  fractionDigits: number,
): ChargeDriverVerdict {
  const displayedValue = displayRounded(value, fractionDigits);
  const displayedBaseline = displayRounded(baseline, fractionDigits);
  if (displayedValue === displayedBaseline) {
    if (deltaPoints === 0 || value === baseline) return "AT_BASELINE";
    if (value > baseline) return deltaPoints > 0 ? "SLIGHTLY_ABOVE_BASELINE_SUPPORTING" : "SLIGHTLY_ABOVE_BASELINE_LIMITING";
    return deltaPoints > 0 ? "SLIGHTLY_BELOW_BASELINE_SUPPORTING" : "SLIGHTLY_BELOW_BASELINE_LIMITING";
  }
  const above = displayedValue > displayedBaseline;
  if (deltaPoints === 0) return above ? "ABOVE_BASELINE_TOO_SMALL" : "BELOW_BASELINE_TOO_SMALL";
  if (above) return deltaPoints > 0 ? "ABOVE_BASELINE_SUPPORTING" : "ABOVE_BASELINE_LIMITING";
  return deltaPoints > 0 ? "BELOW_BASELINE_SUPPORTING" : "BELOW_BASELINE_LIMITING";
}

function sleepVerdict(sleepPerf: number): ChargeDriverVerdict {
  if (sleepPerf > sleepPerfCenter) return "STRONG_NIGHT_SUPPORTING";
  if (sleepPerf < sleepPerfCenter) return "BELOW_GOOD_NIGHT_LIMITING";
  return "TYPICAL_NIGHT";
}

export function skinTempVerdict(dev: number, deltaPoints: number): ChargeDriverVerdict {
  if (deltaPoints === 0) return "NEAR_BASELINE";
  return dev > 0.0 ? "WARMER_THAN_BASELINE_LIMITING" : "COOLER_THAN_BASELINE_LIMITING";
}
