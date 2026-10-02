// Ports RecoveryScorer.kt (Charge: z-scores against personal baselines through a logistic) and the
// daily-aggregate gate from WatchRecovery.kt. Fitbit nightly HRV is a daily aggregate, so Recovery waits
// for minBaselineNights accepted prior nights.
import { foldHistory, hrvCfg, isUsable, restingHRCfg } from "./baselines";
import { forCharge } from "./confidence";
import type { BaselineState, ScoreConfidence } from "./types";

export const wHRV = 0.55;
export const wRHR = 0.2;
export const wResp = 0.05;
export const wSleep = 0.15;
export const wSkinTemp = 0.05;
/** °C of |skin-temp deviation| per z-unit. */
export const skinTempDevScale = 1.0;
export const wRecoveryIndex = 0.05;
export const recoveryIndexScaleBpmPerHr = 2.0;
export const wActivityBalance = 0.05;
export const logisticK = 1.6;
/** Z = 0 maps to ~58%. */
export const logisticZ0 = -0.2;
export const populationMean = 58.0;
export const bandRedMax = 34.0;
export const bandYellowMax = 67.0;
export const sleepPerfCenter = 0.85;
export const sleepPerfScale = 0.12;

// Parasympathetic-saturation guard: detected and reported, deliberately NOT applied to the score.
export const satEnterZ = 0.5;
export const satFullZ = 1.5;
export const satMaxDampFraction = 0.5;

/** Accepted (nValid) prior nights before a daily-aggregate HRV source is scored. */
export const minBaselineNights = 7;

export interface ParasympatheticSaturation {
  /** The HRV z the easing WOULD use. Never fed to the score. */
  easedHrvZ: number;
  active: boolean;
  dampFraction: number;
}

/** `hrvZ` and `rhrZ` as recovery() builds them: higher is better for both. */
export function parasympatheticSaturation(hrvZ: number, rhrZ: number | null): ParasympatheticSaturation {
  const inactive = { easedHrvZ: hrvZ, active: false, dampFraction: 0.0 };
  if (rhrZ == null) return inactive;
  const hrvLow = -hrvZ;
  const rhrLow = rhrZ;
  if (hrvLow < satEnterZ || rhrLow < satEnterZ) return inactive;
  const couplingStrength = Math.min(hrvLow, rhrLow);
  const s = Math.max(0.0, Math.min(1.0, (couplingStrength - satEnterZ) / (satFullZ - satEnterZ)));
  const dampFraction = satMaxDampFraction * s;
  return { easedHrvZ: hrvZ * (1.0 - dampFraction), active: dampFraction > 0.0, dampFraction };
}

export type RecoveryBand = "red" | "yellow" | "green";

export function band(score: number): RecoveryBand {
  if (score < bandRedMax) return "red";
  if (score < bandYellowMax) return "yellow";
  return "green";
}

/** Mean and spread in abs-dev units, as in BaselineState. */
export interface DriverBaseline {
  mean: number;
  spread: number;
}

export const driverBaseline = (s: BaselineState): DriverBaseline => ({ mean: s.baseline, spread: s.spread });

/** (value − mean) / (1.253 × spread). */
export function zScore(value: number, mean: number, spread: number): number {
  return (value - mean) / Math.max(1.253 * spread, 1e-9);
}

export interface RecoveryArgs {
  /** RMSSD-like nightly HRV, ms. */
  hrv: number;
  /** Resting HR, bpm. null drops the term (noop takes a non-null value; the term also needs a baseline). */
  rhr: number | null;
  resp?: number | null;
  /** Required: null returns null. */
  hrvBaseline: DriverBaseline | null;
  rhrBaseline?: DriverBaseline | null;
  respBaseline?: DriverBaseline | null;
  /** Rest composite / 100, or efficiency, in [0, 1]. */
  sleepPerf?: number | null;
  /** Raw ±°C from the personal skin-temp baseline; a symmetric penalty. */
  skinTempDev?: number | null;
  hrvBaselineUsable?: boolean;
  /** Overnight resting-HR slope, bpm/hour (negative = declining = good). */
  recoveryIndexSlope?: number | null;
  effortBaseline?: DriverBaseline | null;
  /** Yesterday's Effort, 0–100. */
  priorDayEffort?: number | null;
}

/** Charge in [0, 100], or null on cold start or a missing HRV baseline. Missing terms drop and renormalize. */
export function recovery(a: RecoveryArgs): number | null {
  if (!(a.hrvBaselineUsable ?? true)) return null;
  const hrvB = a.hrvBaseline;
  if (!hrvB) return null;

  const terms: [z: number, w: number][] = [];
  // Raw HRV z: the saturation easing is not applied here (instrument-first).
  terms.push([zScore(a.hrv, hrvB.mean, hrvB.spread), wHRV]);
  if (a.rhrBaseline && a.rhr != null) terms.push([zScore(a.rhrBaseline.mean, a.rhr, a.rhrBaseline.spread), wRHR]);
  if (a.resp != null && a.respBaseline) terms.push([zScore(a.respBaseline.mean, a.resp, a.respBaseline.spread), wResp]);
  if (a.sleepPerf != null) terms.push([(a.sleepPerf - sleepPerfCenter) / sleepPerfScale, wSleep]);
  if (a.skinTempDev != null) terms.push([-Math.abs(a.skinTempDev) / skinTempDevScale, wSkinTemp]);
  if (a.recoveryIndexSlope != null) terms.push([-a.recoveryIndexSlope / recoveryIndexScaleBpmPerHr, wRecoveryIndex]);
  if (a.priorDayEffort != null && a.effortBaseline) {
    terms.push([zScore(a.effortBaseline.mean, a.priorDayEffort, a.effortBaseline.spread), wActivityBalance]);
  }

  const totalWeight = terms.reduce((s, [, w]) => s + w, 0);
  if (totalWeight <= 0.0) return null;
  const z = terms.reduce((s, [t, w]) => s + t * w, 0) / totalWeight;
  return logisticScore(z);
}

export function logisticScore(compositeZ: number): number {
  const score = 100.0 / (1.0 + Math.exp(-logisticK * (compositeZ - logisticZ0)));
  return Math.max(0.0, Math.min(100.0, score));
}

export interface RecoveryStateArgs
  extends Omit<RecoveryArgs, "hrvBaseline" | "rhrBaseline" | "respBaseline" | "effortBaseline" | "hrvBaselineUsable"> {
  hrvBaseline: BaselineState;
  rhrBaseline?: BaselineState | null;
  respBaseline?: BaselineState | null;
  effortBaseline?: BaselineState | null;
}

/** The BaselineState overload: gates on hrvBaseline usable, and treats an unusable RHR baseline as absent. */
export function recoveryFromStates(a: RecoveryStateArgs): number | null {
  return recovery({
    ...a,
    hrvBaseline: driverBaseline(a.hrvBaseline),
    rhrBaseline: a.rhrBaseline && isUsable(a.rhrBaseline) ? driverBaseline(a.rhrBaseline) : null,
    respBaseline: a.respBaseline ? driverBaseline(a.respBaseline) : null,
    effortBaseline: a.effortBaseline ? driverBaseline(a.effortBaseline) : null,
    hrvBaselineUsable: isUsable(a.hrvBaseline),
  });
}

export interface GatedRecoveryArgs extends Omit<RecoveryStateArgs, "hrv"> {
  hrv: number | null;
}

/**
 * WatchRecovery's honesty gate over the full term set: null + calibrating unless tonight's HRV exists, the
 * HRV baseline is usable, and it has accepted at least minBaselineNights nights.
 */
export function gatedRecovery(a: GatedRecoveryArgs): { recovery: number | null; confidence: ScoreConfidence } {
  const calibrating = { recovery: null, confidence: "calibrating" as const };
  const { hrv, hrvBaseline } = a;
  if (hrv == null || !isUsable(hrvBaseline) || hrvBaseline.nValid < minBaselineNights) return calibrating;
  const score = recoveryFromStates({ ...a, hrv });
  if (score == null) return calibrating;
  return { recovery: score, confidence: forCharge(hrv, hrvBaseline) };
}

/** WatchRecovery.compute: HRV + RHR only, baselines folded from raw histories (oldest first). */
export function watchRecovery(
  todayHrv: number | null,
  todayRhr: number | null,
  hrvHistory: number[],
  rhrHistory: number[],
): { recovery: number | null; confidence: ScoreConfidence } {
  return gatedRecovery({
    hrv: todayHrv,
    rhr: todayRhr,
    hrvBaseline: foldHistory(hrvHistory, hrvCfg),
    rhrBaseline: foldHistory(rhrHistory, restingHRCfg),
  });
}
