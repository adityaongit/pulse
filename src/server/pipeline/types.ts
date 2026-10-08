// Stored shapes: the daily_scores JSON columns the queries read, and the options both stages take.
import type { ReasonCode } from "@/lib/reasons";
import type { ChargeDriver } from "@/core/scoring/drivers";
import type { RecoveryForecast } from "@/core/scoring/forecast";
import type { HrRecoveryResult } from "@/core/scoring/hrRecovery";
import type { BaselineState } from "@/core/scoring/types";
import type { Drain } from "@/core/algorithms/energyBank";
import type { FitnessCategory } from "@/core/algorithms/fitnessLevel";
import type { HealthMonitorResult } from "@/core/algorithms/healthMonitor";
import type { HealthspanResult } from "@/core/algorithms/healthspan";
import type { TagImpact } from "@/core/algorithms/journalImpact";
import type { SleepPlan } from "@/core/algorithms/sleepPlanner";
import type { Interval } from "@/core/algorithms/stress";
import type { StrainTarget } from "@/core/algorithms/strainTarget";

/**
 * Bump on any scoring change; a mismatch at startup reruns both stages for every day.
 * 1: U5 scorers. 2: SRI consistency in sleep performance (U7), U10 pipeline. 3: one age helper
 * (healthspan and fitness age agree with whole years on birthdays). 4: local days open at the right instant
 * where DST starts at midnight (Santiago, Havana, Azores...), so the 23-hour day is the right one. 5: Pulse Age's
 * stored key is `pulseAge` (was a brand name), so stored healthspan rows rescore. 6: Google's inputs first (its daily
 * zones, resting HR, time in zones, skin-temperature baseline and personal ranges), four named zones. 7: five
 * display zones on heart-rate reserve (Strain's and WHOOP's 50/60/70/80/90%) in place of Google's four. 8: max HR
 * no longer from Google's PEAK zone (a flat 220), so zones and Strain use the person's own or Tanaka's.
 * 10: each Healthspan factor keeps its 30-day mean beside the 6-month one (health-03's two markers).
 */
export const SCORING_VERSION = 10;

export type PipelineOptions = {
  /** Whose data: every read and write is scoped to this user. */
  userId: number;
  timeZone: string;
  profile: { birthDate: string; sex: "male" | "female"; maxHr: number; heightCm?: number | null };
};

export type BaselineSummary = { mean: number; sd: number; status: BaselineState["status"]; nValid: number } | null;

/** Stage 1, `daily_scores.strain`. */
export type Stage1Day = {
  /** Hash of the non-sample inputs; a change reruns stage 1 for the day. */
  key: string;
  hrCount: number;
  /** Minutes with HR before and after local noon (SRI coverage). */
  hrMinutesAm: number;
  hrMinutesPm: number;
  lastHrTs: number | null;
  restingHr: number;
  /** Google's daily resting HR first, then Pulse's sleep-session estimate. */
  restingHrSource: "daily" | "session" | "default";
  maxHr: number;
  /** Effort 0–100, or null with too little HR. */
  effort: number | null;
  /** Zones 1–5 on heart-rate reserve: lower bounds (bpm) and seconds. */
  zoneLower: number[];
  zoneSeconds: number[];
  /** Seconds below Zone 1 ("Zone 0"); absent on days stored before version 9. */
  zoneBelowSeconds?: number;
  /** Stress Monitor's resting daytime HR for the day (independent of the baseline). */
  dayAggregate: number | null;
  stillMinutes: number;
};

/** Stage 1, `daily_scores.activities`. */
export type Stage1Activity = {
  id: string;
  effort: number | null;
  hrCount: number;
  avgHr: number | null;
  maxHr: number | null;
  zoneSeconds: number[];
  zoneBelowSeconds?: number;
  hrr: HrRecoveryResult | null;
};

export type RecoveryRow = {
  value: number | null;
  reason: ReasonCode | null;
  nightsLeft?: number;
  provisional: boolean;
  /** Inputs whose baseline is stale today. */
  stale: string[];
  /** Terms the score used. */
  terms: string[];
  /** The score gained a term after it was first shown. */
  updated: boolean;
  inputs: { hrv: number | null; rhr: number | null; resp: number | null; sleepPerf: number | null; skinTempDev: number | null };
  baselines: { hrv: BaselineSummary; rhr: BaselineSummary; resp: BaselineSummary; skinTemp: BaselineSummary };
  hrvZ: number | null;
  drivers: ChargeDriver[];
  forecast: RecoveryForecast | null;
  forecastNightsLeft: number;
};

export type SleepRow = {
  reason: ReasonCode | null;
  main: {
    id: string;
    start: number;
    end: number;
    processed: boolean;
    staged: boolean;
    inBedMin: number;
    asleepMin: number;
    awakeMin: number;
    deepMin: number | null;
    remMin: number | null;
    lightMin: number | null;
    efficiency: number;
    wakeEvents: number | null;
  } | null;
  naps: { id: string; start: number; end: number; asleepMin: number }[];
  /** 0–100 */
  performance: number | null;
  needHours: number;
  needNights: number;
  /** Main sleep plus yesterday's naps, the debt ledger's night. */
  creditedMin: number | null;
  debtMin: number;
  /** Raw SRI on [−100, 100] over the 7 nights ending on D. */
  sri: number | null;
  /** 0–100 display value. */
  consistency: number | null;
};

export type StressRow = {
  provisional: boolean;
  average: number | null;
  lowMin: number;
  mediumMin: number;
  highMin: number;
  latest: { ts: number; value: number } | null;
  longestHigh: { start: number; minutes: number } | null;
  referenceHr: number | null;
};

export type EnergyBankRow =
  | { value: null; reason: ReasonCode; provisional: boolean }
  | {
      value: number;
      reason: null;
      provisional: boolean;
      startLevel: number;
      wake: number;
      until: number;
      charged: number;
      drained: number;
      topDrains: Drain[];
      naps: Interval[];
    };

export type TrainingLoadRow = {
  acwr: number | null;
  /** ACWR over the days before D (what Strain Target uses). */
  acwrPrior: number | null;
  monotony: number | null;
  level: string;
  state: string;
  contiguousDays: number;
  ctl: number | null;
  atl: number | null;
  tsb: number | null;
};

export type StrainTargetRow = ({ reason: null } & StrainTarget) | { reason: ReasonCode; nightsLeft?: number };

export type SleepPlannerRow =
  | ({ reason: null; wakeDay: string; nights: number } & SleepPlan)
  | { reason: ReasonCode; nightsLeft?: number; needMin: number };

export type HealthMonitorRow = (HealthMonitorResult & { reason: null; stale: string[] }) | { reason: ReasonCode };

export type HealthspanRow = (HealthspanResult & { reason: null; age: number }) | { reason: ReasonCode; dataDays: number };

export type FitnessRow =
  | { reason: null; vo2max: number; source: "run" | "daily"; sourceDay: string; percentile: number; category: FitnessCategory; age: number }
  | { reason: ReasonCode };

export type JournalImpactRow = { key: string; impacts: TagImpact[] };

/** One day's stage-2 columns, keyed by their daily_scores column name. */
export type Stage2Row = {
  recovery: RecoveryRow;
  sleep: SleepRow;
  training_load: TrainingLoadRow;
  strain_target: StrainTargetRow;
  sleep_planner: SleepPlannerRow;
  energy_bank: EnergyBankRow;
  stress: StressRow;
  health_monitor: HealthMonitorRow;
  healthspan: HealthspanRow;
  fitness: FitnessRow;
  journal_impact: JournalImpactRow;
};

/** Every Stage2Row key, once: `satisfies` fails the build when a column is added to one and not the other. */
export const STAGE2_COLUMNS = Object.keys({
  recovery: 1,
  sleep: 1,
  training_load: 1,
  strain_target: 1,
  sleep_planner: 1,
  energy_bank: 1,
  stress: 1,
  health_monitor: 1,
  healthspan: 1,
  fitness: 1,
  journal_impact: 1,
} satisfies Record<keyof Stage2Row, 1>) as (keyof Stage2Row)[];
