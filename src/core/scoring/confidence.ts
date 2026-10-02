// Ports ScoreConfidence.kt (calibrating / building / solid per score) and HypnogramCoverage.fraction.
// Not ported: the gravitySparse (motion-staging) downgrade, since pulse stages no motion.
import { isTrusted, isUsable } from "./baselines";
import type { BaselineState, ScoreConfidence } from "./types";

export const buildingNightsThreshold = 7;
/** HR samples below which Effort is only "building". */
export const solidHrSamples = 3600;
export const restorativeLowConfidenceShare = 0.1;
export const highEfficiencyThreshold = 0.85;
/** Stage coverage at or above which a timeline describes its whole span. */
export const minCoverage = 0.95;

export function forCharge(score: number | null, hrvBaseline: BaselineState | null): ScoreConfidence {
  if (score == null || hrvBaseline == null || !isUsable(hrvBaseline)) return "calibrating";
  return hrvBaseline.nValid < buildingNightsThreshold || !isTrusted(hrvBaseline) ? "building" : "solid";
}

export function readiness(hasRead: boolean, baselineNights: number, fullWindow: number): ScoreConfidence {
  if (!hasRead) return "calibrating";
  return baselineNights >= fullWindow ? "solid" : "building";
}

export function forEffort(score: number | null, hrSampleCount: number): ScoreConfidence {
  if (score == null) return "calibrating";
  return hrSampleCount < solidHrSamples ? "building" : "solid";
}

export interface RestNight {
  asleepSeconds: number;
  restorativeSeconds: number;
  efficiency: number;
  /** From coverageFraction; null = unknown, fails open. */
  stageCoverage?: number | null;
}

/** Base tier from session and staging presence; with `night`, a SOLID tier is downgraded on a holed or suspect timeline. */
export function forRest(hasSession: boolean, hasStagedSleep: boolean, night?: RestNight): ScoreConfidence {
  const base: ScoreConfidence = !hasSession ? "calibrating" : hasStagedSleep ? "solid" : "building";
  if (!night || base !== "solid") return base;
  if (night.stageCoverage != null && night.stageCoverage < minCoverage) return "building";
  if (night.asleepSeconds <= 0.0) return base;
  const restorativeShare = night.restorativeSeconds / night.asleepSeconds;
  return night.efficiency >= highEfficiencyThreshold && restorativeShare < restorativeLowConfidenceShare ? "building" : base;
}

/** Covered share of a session span, or null when there is nothing to measure. Clamped at 1. */
export function coverageFraction(coveredSeconds: number, spanSeconds: number): number | null {
  if (spanSeconds <= 0.0 || coveredSeconds <= 0.0) return null;
  return Math.min(1.0, coveredSeconds / spanSeconds);
}
