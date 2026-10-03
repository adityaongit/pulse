// View models returned by server/queries, one per screen (spec §7). Shapes mirror the U12 kit props
// (src/lib/reasons.ts Metric, ZoneBars' ZoneRow, DriverList's DriverItem…), importing only types from the kit.
// Conventions: instants are epoch **milliseconds** (as the kit's charts and cards take them), days are
// local `YYYY-MM-DD`, Strain is on WHOOP's 0–21 scale, and no number is ever NaN or ±Infinity.

import type { ChipTone, GoodDirection, RecoveryBand as Band, StressLevel } from "@/lib/bands";
import type { Metric, MetricTag, ReasonCode } from "@/lib/reasons";

// Type-only: shared with the kit, erased at build, so no UI code reaches the server bundle.
export type { Band, ChipTone, GoodDirection, Metric, MetricTag, ReasonCode, StressLevel };
export type SleepStatus = "poor" | "sufficient" | "optimal";
export type ActivityKind = "run" | "ride" | "walk" | "strength" | "workout";

export type DayPoint = { day: string; value: number | null; provisional?: boolean };
/** 182 days ending on the selected day (the chart slices W / M / 6M). */
export type Trend = {
  points: DayPoint[];
  /** Personal normal range (mean ± 1 σ), when the chart shades one. */
  baseline?: { mean: number; sd: number } | null;
  /** Strain trend: today's Strain Target band. */
  target?: [number, number] | null;
};
export type TimePoint = { t: number; v: number | null };
export type Span = { kind: "workout" | "sleep" | "nap"; label: string; start: number; end: number };

/** A key-statistics row or tile (KeyStatRow). */
export type KeyStat = {
  key: string;
  label: string;
  metric: Metric<number>;
  unit?: string;
  /** Mean over the 30 days before the selected day (or the comparison period). */
  average: number | null;
  sd?: number;
  direction: GoodDirection | "none";
  status?: SleepStatus;
  chip?: { tone: ChipTone; text: string };
  caption?: string;
  /** Detail route without `?d=`; U13 adds the day. */
  href?: string;
};

export type ZoneRow = { zone: number; min: number; max: number | null; seconds: number };
export type StackedSegment = { key: string; label: string; count: number; color: string };

/** DriverList item. `delta` is in the list's unit; lists are sorted by |delta| descending. */
export type DriverItem = {
  key: string;
  label: string;
  delta: number;
  effect?: "positive" | "negative" | "none";
  yes?: number;
  no?: number;
  ci?: [number, number];
};

export type TimelineItem =
  | { kind: "sleep" | "nap"; id: string; day: string; minutes: number; start: number; end: number }
  | { kind: "activity"; id: string; day: string; name: string; activityKind: ActivityKind; strain: Metric<number>; start: number; end: number };

export type SleepPlanVM = {
  needMin: number;
  parts: { baselineMin: number; strainMin: number; debtMin: number; napMin: number };
  /** Tomorrow's typical wake, epoch ms. */
  wakeAt: number;
  weekend: boolean;
  plans: { key: "peak" | "perform" | "get_by"; label: "Peak" | "Perform" | "Get by"; share: number; sleepMin: number; bedtimeAt: number }[];
};

export type EnergyBankVM = {
  current: number;
  startLevel: number;
  /** Wake, epoch ms. */
  startAt: number;
  until: number;
  charged: number;
  /** Negative. */
  drained: number;
  /** Every 5 minutes from wake. */
  curve: TimePoint[];
  drains: { label: string; kind: "workout" | "activity" | "stress"; start: number; amount: number }[];
  naps: { start: number; end: number }[];
};

// ── Home ─────────────────────────────────────────────────────────────────────

export type HomeVM = {
  day: string;
  today: string;
  isToday: boolean;
  /** 30 days ending today (extended back to include `day`). */
  strip: { day: string; recovery: number | null }[];
  dials: {
    sleep: Metric<number>;
    recovery: Metric<number>;
    /** 0–21. */
    strain: Metric<number>;
    strainTarget: [number, number] | null;
    soFar: boolean;
    /** The one reason line under the dials: Recovery's, else Sleep's, else Strain's. */
    reason: { reason: ReasonCode; nightsLeft?: number } | null;
  };
  monitorAlert: { kind: "flagged" | "illness"; count: number; names: string[] } | null;
  monitor: Metric<{ inRange: number; total: number; flagged: number }>;
  stress: Metric<{ value: number; level: StressLevel; at: number | null; dayAverage: boolean }>;
  activities: { title: "Today's activities" | "Activities"; items: TimelineItem[] };
  energyBank: Metric<EnergyBankVM>;
  tonight: Metric<SleepPlanVM>;
  keyStats: KeyStat[];
  weeklyTeaser: { period: string; start: string; end: string } | null;
  /** Morning outlook before 17:00 today, day in review after it and on past days (inferred I15); null with no data. */
  outlook: { kind: "outlook" | "review"; title: string; body: string } | null;
  /** Today's coach cards (Strain Coach, Recovery, Sleep), in order; empty on past days. */
  insights: { key: "strain" | "recovery" | "sleep"; title: string; body: string; href: string }[];
  /** The 7 days ending on `day`: was a check-in logged. */
  journalWeek: { day: string; done: boolean }[];
  /** The 7 days ending on `day`, oldest first: Strain 0-21 and Recovery %. */
  strainRecovery: { day: string; strain: number | null; recovery: number | null }[];
};

// ── Recovery ─────────────────────────────────────────────────────────────────

export type Contributor = {
  key: "hrv" | "rhr" | "resp" | "sleep" | "skinTemp";
  label: string;
  unit: string;
  metric: Metric<number>;
  baseline: { mean: number; sd: number } | null;
  /** Points this input moved today's Recovery (marginal; rows do not sum to the score). */
  points: number | null;
  direction: GoodDirection;
};

export type RecoveryVM = {
  day: string;
  isToday: boolean;
  recovery: Metric<number>;
  band: Band | null;
  contributors: Contributor[];
  insight: string | null;
  trend: Trend;
  drivers: Metric<DriverItem[]>;
  forecast: Metric<{ value: number; low: number; high: number; band: Band }>;
};

// ── Strain and Activity ──────────────────────────────────────────────────────

export type HrChart = { points: TimePoint[]; zones: ZoneRow[]; spans: Span[]; now: number | null };

export type ActivityItem = Extract<TimelineItem, { kind: "activity" }>;

export type StrainVM = {
  day: string;
  isToday: boolean;
  strain: Metric<number>;
  soFar: boolean;
  target: Metric<{ low: number; high: number; estimate: boolean; acwrRule: "capped" | "lifted" | null }>;
  summary: KeyStat[];
  coach: string | null;
  hr: Metric<HrChart>;
  zones: Metric<ZoneRow[]>;
  maxHr: number;
  activities: ActivityItem[];
  trend: Trend;
};

export type ActivityVM = {
  id: string;
  day: string;
  name: string;
  kind: ActivityKind;
  start: number;
  end: number;
  strain: Metric<number>;
  dayStrain: number | null;
  stats: KeyStat[];
  insight: string | null;
  hr: Metric<HrChart>;
  zones: Metric<ZoneRow[]>;
  maxHr: number;
  hrr: Metric<{ value: number; tone: ChipTone; label: "Good" | "Typical" | "Low" }>;
};

// ── Sleep ────────────────────────────────────────────────────────────────────

export type SleepVM = {
  day: string;
  isToday: boolean;
  performance: Metric<number>;
  summary: KeyStat[];
  insight: string | null;
  /** null: a session without stages (Hypnogram empty copy). */
  stages: Metric<{
    bed: number;
    wake: number;
    segments: { stage: "awake" | "rem" | "light" | "deep"; start: number; end: number }[];
    rows: { stage: "awake" | "rem" | "light" | "deep"; label: string; pct: number; minutes: number; typical: [number, number] }[];
  }> | null;
  hoursVsNeed: Metric<{
    asleepMin: number;
    needMin: number;
    parts: { baselineMin: number; strainMin: number; debtMin: number; napMin: number };
    calibrating: boolean;
  }>;
  details: KeyStat[];
  debtTrend: Trend;
  planner: Metric<SleepPlanVM & { weekdayWake: boolean }>;
};

// ── Health ───────────────────────────────────────────────────────────────────

export type VitalKey = "resp" | "spo2" | "restingHr" | "hrv" | "skinTempDev";
export type Vital = {
  key: VitalKey;
  label: string;
  short: string;
  unit: string;
  metric: Metric<number>;
  range: { low: number; high: number } | null;
  status: "in_range" | "high" | "low" | "no_data";
  chip: { tone: ChipTone; text: string } | null;
  /** 30 days ending on the day, for the vital sheet. */
  trend: Trend;
};

export type HealthHubVM = {
  day: string;
  /** `paceDelta`: this week's Pace of Aging minus last week's; null without both. */
  healthspan: Metric<{ whoopAge: number; deltaYears: number; pace: number; paceDelta: number | null }>;
  monitor: Metric<{ vitals: { key: VitalKey; short: string; status: Vital["status"] }[]; inRange: number; total: number }>;
  stress: Metric<{ highMin: number; typicalHighMin: number | null; weekday: string; spark: TimePoint[] }>;
  fitness: Metric<{ vo2max: number; category: string; percentile: number; acwr: number | null; acwrTone: ChipTone | null }>;
};

export type HealthspanContributor = {
  key: string;
  group: "sleep" | "strain" | "fitness";
  label: string;
  unit: string;
  metric: Metric<number>;
  target: number;
  years: number | null;
  domain: [number, number];
  higherIsBetter: boolean;
  caption?: string;
  explanation: string;
  source: string;
};

export type HealthspanVM = {
  day: string;
  weekStart: string;
  weekEnd: string;
  /** The stored day the result comes from (the shown week's Sunday, or the latest day). */
  asOf: string;
  nextUpdateInDays: number;
  age: number;
  result: Metric<{ whoopAge: number; deltaYears: number; pace: number; paceProvisional: boolean; vo2maxSource: "run" | "daily" | null }>;
  insight: { title: string; body: string } | null;
  /** WHOOP Age at each week end. */
  history: DayPoint[];
  contributors: HealthspanContributor[];
};

export type MonitorVM = {
  day: string;
  isToday: boolean;
  count: Metric<{ inRange: number; total: number; status: "within" | "out" | "illness"; outOfRange: number }>;
  illness: { level: string; score: number } | null;
  vitals: Vital[];
};

export type StressVM = {
  day: string;
  isToday: boolean;
  gauge: Metric<{ value: number; level: StressLevel; at: number | null; dayAverage: boolean }>;
  insight: string | null;
  chart: Metric<{ points: TimePoint[]; spans: Span[]; now: number | null }>;
  levels: Metric<{
    lowMin: number;
    mediumMin: number;
    highMin: number;
    typicalDeltaMin: number | null;
    weekday: string;
    /** Mean minutes per level over the same weekday in the last 4 weeks; null without one. */
    typical: { lowMin: number; mediumMin: number; highMin: number } | null;
  }>;
  trend: Trend;
};

export type FitnessVM = {
  vo2: Metric<{ value: number; source: "run" | "daily"; sourceDay: string; percentile: number; category: string; ageBand: string; sex: "male" | "female" }>;
  trend: Trend;
  trainingLoad: Metric<{ acwr: number; status: "detraining" | "optimal" | "pushing" | "high_risk"; tone: ChipTone }>;
  /** 90 days of CTL ("Fitness"), ATL ("Fatigue") and TSB ("Form"). */
  load: { day: string; ctl: number | null; atl: number | null; tsb: number | null }[];
  loadReason: { reason: ReasonCode; nightsLeft?: number } | null;
};

// ── Journal ──────────────────────────────────────────────────────────────────

export type JournalTag = { tag: string; label: string; group: "evening" | "recovery" | "context" | "custom"; isDefault: boolean; hidden: boolean };

/** More › Behaviours: every tag in check-in order, hidden ones included, with its answered-day count. */
export type BehavioursVM = { tags: (JournalTag & { answers: number })[] };

export type JournalVM = {
  day: string;
  today: string;
  strip: { day: string; done: boolean }[];
  tags: JournalTag[];
  checkIn: { done: boolean; entries: Record<string, number>; yes: { tag: string; label: string }[] };
  teaser: { text: string; ready: boolean };
  history: { day: string; yes: string[] }[];
};

export type ImpactMetricKey = "recovery" | "hrv" | "sleep";
export type JournalInsightsVM = {
  metric: ImpactMetricKey;
  unit: "%" | "SD";
  items: (DriverItem & { avgWith: number | null; avgWithout: number | null })[];
  needsMore: { key: string; label: string; yes: number; no: number }[];
};

// ── Reports ──────────────────────────────────────────────────────────────────

export type ReportVM = {
  period: string;
  kind: "week" | "month";
  start: string;
  end: string;
  partial: boolean;
  prev: string | null;
  next: string | null;
  latestWeek: string | null;
  latestMonth: string | null;
  dials: { key: "sleep" | "recovery" | "strain"; label: string; metric: Metric<number>; delta: number | null }[];
  insight: string | null;
  bands: Metric<StackedSegment[]>;
  averages: KeyStat[];
  trainingBalance: Metric<{ status: "balanced" | "overreaching" | "undertrained"; word: string; acwr: number; line: string }>;
  topImpacts: DriverItem[];
  bestWorst: { label: "Best day" | "Worst day"; day: string; recovery: number; strain: number | null }[] | null;
};

// ── More and Settings ────────────────────────────────────────────────────────

/** Matches the U12 ShellStatus context. */
export type ShellStatusVM = {
  mode: "demo" | "google";
  sync: { state: "ok" | "syncing" | "stale" | "error"; lastSuccessAt: number | null };
  connection: "connected" | "not_connected" | "not_linked" | "importing" | "auth_revoked" | "stale";
  importProgress?: { done: number; total: number };
  today: string;
  firstDay?: string;
  timeZone?: string;
  /** Consecutive worn days ending `asOf` (today, or yesterday early in the day); null at 0. */
  streak: { days: number; asOf: string } | null;
};

export type SettingsVM = {
  mode: "demo" | "google";
  source: { label: "Demo data" | "Google Health"; status: "demo" | "not_connected" | "not_linked" | "connected" | "revoked" };
  import: { done: number; total: number } | null;
  sync: { key: string; label: string; lastSuccessAt: number | null; status: "ok" | "stale" | "error" | "never"; error: string | null }[];
  profile: { birthDate: string; age: number; sex: "male" | "female"; maxHr: number; maxHrSource: "set" | "estimated"; timeZone: string; heightCm: number | null };
  version: string;
  scoringVersion: number;
};

export type MoreVM = {
  latestWeek: { period: string; start: string; end: string } | null;
  latestMonth: { period: string; start: string; end: string } | null;
  /** Periods with data, for the archive row's caption. */
  reportCount: number;
  /** Behaviours on the check-in sheet, and all of them. */
  behaviours: { shown: number; total: number };
  mode: "demo" | "google";
  version: string;
  scoringVersion: number;
};

/** Your data `/more/data`. */
export type YourDataVM = {
  /** First day with scores; null before any data. */
  first: string | null;
  /** Days in the daily-scores export. */
  days: number;
  /** Rows in the journal export. */
  answers: number;
  mode: "demo" | "google";
};

// ── Calendar (DateSwitcher month panel) ─────────────────────────────────────

/** One day's three headline scores; null when the day has none. Strain is on the 0–21 scale. */
export type CalendarDayVM = { day: string; recovery: number | null; strain: number | null; sleep: number | null };
/** Every day of `month` ("YYYY-MM"), first to last. */
export type CalendarMonthVM = { month: string; days: CalendarDayVM[] };
