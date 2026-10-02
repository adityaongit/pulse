// Ports the AnalyticsModels.kt subset (MetricCfg, BaselineState, Deviation, UserProfile, HypnogramMetrics)
// plus the HR and sleep-stage shapes the scorers read. All times are unix seconds.

export interface HrSample {
  ts: number;
  bpm: number;
}

/** noop's lowercase stage vocabulary; "awake" is the alternate wake spelling it also accepts. */
export type Stage = "wake" | "awake" | "light" | "deep" | "rem";

export interface StageSegment {
  start: number;
  end: number;
  stage: Stage;
}

/** The DetectedSleep subset hypnogramMetrics reads: the in-bed span and its stage segments. */
export interface SleepSession {
  start: number;
  end: number;
  stages: StageSegment[];
}

export interface HypnogramMetrics {
  tibS: number;
  tstS: number;
  sptS: number;
  solS: number;
  /** null when the night has no REM (noop uses NaN). */
  remLatencyS: number | null;
  wasoS: number;
  efficiency: number;
  disturbances: number;
  deepMin: number;
  remMin: number;
  lightMin: number;
  deepPct: number;
  remPct: number;
  lightPct: number;
}

export interface UserProfile {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: "male" | "female" | "nonbinary";
}

export interface MetricCfg {
  /** Hard reject below. */
  minVal: number;
  /** Hard reject above. */
  maxVal: number;
  floorSpread: number;
  /** Centre half-life, nights. */
  halfLifeB: number;
  /** Spread half-life, nights. */
  halfLifeS: number;
}

export type BaselineStatus = "calibrating" | "provisional" | "trusted" | "stale";

export interface BaselineState {
  /** Robust EWMA centre. */
  baseline: number;
  /** EWMA of absolute deviations, floored at cfg.floorSpread. σ ≈ 1.253 × spread. */
  spread: number;
  nValid: number;
  nightsSinceUpdate: number;
  status: BaselineStatus;
}

export interface Deviation {
  z: number;
  delta: number;
  ratio: number;
  inNormalRange: boolean;
}

export type ScoreConfidence = "calibrating" | "building" | "solid";
