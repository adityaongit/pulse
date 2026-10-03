// The two-stage recompute (KTD6). Stage 1 reads the heavy per-sample tables for the days whose inputs
// changed and caches per-day results; stage 2 folds every day, oldest first, over daily rows and those
// cached results. Every value for day D depends only on D and earlier days, except where a feature is
// defined over the evening that follows (Energy Bank stops at tonight's bedtime, Stress leaves out
// tonight's sleep), so adding a later night never changes an earlier day's scores.
//
// Determinism: the same database gives byte-identical daily_scores, and writes only touch rows whose
// JSON differs, so an unchanged recompute writes nothing.
import type { ReasonCode } from "@/lib/reasons";
import { createHash } from "node:crypto";
import { getConfig } from "./config";
import { type Db, getDb } from "./db";
import { daysBetween, addDays, fractionalYears, localDay, localMidnight, localMinutes, wholeYears } from "./time";
import {
  deviation,
  hrvCfg,
  isTrusted,
  isUsable,
  respCfg,
  restingHRCfg,
  sigma,
  skinTempCfg,
  update,
} from "@/core/scoring/baselines";
import { chargeDrivers, type ChargeDriver } from "@/core/scoring/drivers";
import { forecast as recoveryForecast, type RecoveryForecast } from "@/core/scoring/forecast";
import { hrRecovery, type HrRecoveryResult } from "@/core/scoring/hrRecovery";
import { evaluateWithTrainingLoad, type ReadinessDay } from "@/core/scoring/readiness";
import { gatedRecovery, minBaselineNights } from "@/core/scoring/recovery";
import { sessionRestingHR } from "@/core/scoring/restingHr";
import { creditedSleepMin, hypnogramMetrics, ledger, minNeedNights, personalizedNeedHours, rest } from "@/core/scoring/sleep";
import { defaultRestingHR, strain } from "@/core/scoring/strain";
import { foldDaytimeBaseline } from "@/core/scoring/stressBase";
import type { BaselineState, HrSample } from "@/core/scoring/types";
import { timeInZone, zones as hrZones } from "@/core/scoring/zones";
import { energyBank, energyBankConfig, minuteLoad, type Drain } from "@/core/algorithms/energyBank";
import { fitnessLevel, type FitnessCategory } from "@/core/algorithms/fitnessLevel";
import { healthMonitor, type HealthMonitorDay, type HealthMonitorResult } from "@/core/algorithms/healthMonitor";
import { healthspan, type HealthspanDay, type HealthspanResult } from "@/core/algorithms/healthspan";
import { journalImpact, type JournalDay, type OutcomeDay, type TagImpact } from "@/core/algorithms/journalImpact";
import { buildReport, periodBounds, reportPeriods, type ReportDay } from "@/core/algorithms/reports";
import { sleepPlan, type SleepPlan } from "@/core/algorithms/sleepPlanner";
import { sleepRegularityIndex, sriConsistency, sriDisplay } from "@/core/algorithms/sleepRegularity";
import { strainTarget, type StrainTarget } from "@/core/algorithms/strainTarget";
import { minuteMeanHr, stress, type Interval } from "@/core/algorithms/stress";

/**
 * Bump on any scoring change; a mismatch at startup reruns both stages for every day.
 * 1: U5 scorers. 2: SRI consistency in sleep performance (U7), U10 pipeline. 3: one age helper
 * (healthspan and fitness age agree with whole years on birthdays).
 */
export const SCORING_VERSION = 3;

export type PipelineOptions = {
  timeZone: string;
  profile: { birthDate: string; sex: "male" | "female"; maxHr: number; heightCm?: number | null };
};

/** What the last run did, for tests and logs. */
export const lastRun = { stage1Days: [] as string[], ms: 0, stage1Ms: 0, stage2Ms: 0 };

// ---------------------------------------------------------------------------------------------
// Stored shapes (daily_scores JSON columns). Queries read these.

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
  restingHrSource: "session" | "daily" | "default";
  maxHr: number;
  /** Effort 0–100, or null with too little HR. */
  effort: number | null;
  /** %HRmax zones 1–5: lower bounds (bpm) and seconds. */
  zoneLower: number[];
  zoneSeconds: number[];
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

// ---------------------------------------------------------------------------------------------
// Entry points

/** The worker's hook: recompute when a source changed something, a day is dirty, or the version moved. */
export async function recomputeIfNeeded(changed: boolean): Promise<void> {
  const db = getDb();
  if (!changed && !needsRecompute(db)) return;
  const cfg = getConfig();
  recompute(db, { timeZone: cfg.timeZone, profile: cfg.profile });
  console.info(`[pipeline] recomputed in ${lastRun.ms} ms (stage 1: ${lastRun.stage1Days.length} days)`);
}

export function needsRecompute(db: Db): boolean {
  const c = db.$client;
  if (c.prepare("select 1 from intraday_dirty limit 1").get()) return true;
  if (c.prepare("select 1 from daily_scores where scoring_version != ? limit 1").get(SCORING_VERSION)) return true;
  const last = c.prepare("select max(day) from daily_metrics").pluck().get() as string | null;
  return last != null && !c.prepare("select 1 from daily_scores where day = ?").get(last);
}

/** Runs both stages. Synchronous: better-sqlite3 is, and the worker never overlaps runs. */
export function recompute(db: Db, opts: PipelineOptions) {
  const t0 = performance.now();
  const data = load(db, opts);
  if (!data) {
    Object.assign(lastRun, { stage1Days: [], ms: Math.round(performance.now() - t0), stage1Ms: 0, stage2Ms: 0 });
    return lastRun;
  }
  const t1 = performance.now();
  lastRun.stage1Days = stage1(db, data, opts);
  const t2 = performance.now();
  stage2(db, data, opts);
  const t3 = performance.now();
  Object.assign(lastRun, { stage1Ms: Math.round(t2 - t1), stage2Ms: Math.round(t3 - t2), ms: Math.round(t3 - t0) });
  return lastRun;
}

// ---------------------------------------------------------------------------------------------
// Loading

type Session = {
  id: string;
  day: string;
  startTs: number;
  endTs: number;
  isMain: boolean;
  processed: boolean;
  stagesStatus: string | null;
  asleepMin: number | null;
  awakeMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
};
type Exercise = { id: string; day: string; startTs: number; endTs: number; type: string; name: string | null; calories: number | null };
type Metrics = {
  day: string;
  hrvMs: number | null;
  rhrBpm: number | null;
  respBpm: number | null;
  nightlyTempC: number | null;
  spo2Pct: number | null;
  vo2maxDaily: number | null;
  vo2maxRun: number | null;
  steps: number | null;
  calories: number | null;
  weightKg: number | null;
  bodyFatPct: number | null;
};
type Segment = { sessionId: string; startTs: number; endTs: number; stage: "awake" | "light" | "deep" | "rem" };

type Data = ReturnType<typeof load> & {};

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

function load(db: Db, { timeZone: tz }: PipelineOptions) {
  const c = db.$client;
  const all = <T>(q: string) => c.prepare(q).all() as T[];
  const metrics = all<Metrics>(
    `select day, hrv_ms hrvMs, rhr_bpm rhrBpm, resp_bpm respBpm, nightly_temp_c nightlyTempC, spo2_pct spo2Pct,
       vo2max_daily vo2maxDaily, vo2max_run vo2maxRun, steps, calories, weight_kg weightKg, body_fat_pct bodyFatPct
     from daily_metrics order by day`,
  );
  const sessions = all<Session>(
    `select id, day, start_ts startTs, end_ts endTs, is_main isMain, processed, stages_status stagesStatus,
       asleep_min asleepMin, awake_min awakeMin, deep_min deepMin, light_min lightMin, rem_min remMin
     from sleep_sessions order by start_ts, id`,
  ).map((s) => ({ ...s, isMain: !!s.isMain, processed: !!s.processed }));
  const exercises = all<Exercise>(
    "select id, day, start_ts startTs, end_ts endTs, type, name, calories from exercises order by start_ts, id",
  );
  const hrSpan = c.prepare("select min(ts) lo, max(ts) hi from hr_samples").get() as { lo: number | null; hi: number | null };

  const candidates = [
    ...metrics.map((m) => m.day),
    ...sessions.map((s) => s.day),
    ...exercises.map((e) => e.day),
    ...(hrSpan.lo != null ? [localDay(hrSpan.lo, tz), localDay(hrSpan.hi!, tz)] : []),
  ].sort();
  if (!candidates.length) return null;
  const first = candidates[0];
  const last = candidates[candidates.length - 1];
  const days = Array.from({ length: daysBetween(first, last) + 1 }, (_, i) => addDays(first, i));
  const start = new Map(days.map((d) => [d, localMidnight(d, tz)]));
  start.set(addDays(last, 1), localMidnight(addDays(last, 1), tz));

  const sessionsByDay = groupBy(sessions, (s) => s.day);
  const mainOf = new Map<string, Session>();
  for (const [day, list] of sessionsByDay) {
    const mains = list.filter((s) => s.isMain).sort((a, b) => b.endTs - b.startTs - (a.endTs - a.startTs) || a.id.localeCompare(b.id));
    if (mains.length) mainOf.set(day, mains[0]);
  }
  return {
    days,
    first,
    last,
    dayStart: (d: string) => start.get(d) ?? localMidnight(d, tz),
    metrics: new Map(metrics.map((m) => [m.day, m])),
    sessions,
    sessionsByDay,
    mainOf,
    exercises,
    exercisesByDay: groupBy(exercises, (e) => e.day),
  };
}

/** Sessions and exercises that overlap [lo, hi). */
const touching = <T extends { startTs: number; endTs: number }>(xs: T[], lo: number, hi: number) =>
  xs.filter((x) => x.endTs > lo && x.startTs < hi);

// ---------------------------------------------------------------------------------------------
// Stage 1: per-sample work for dirty days

/** A baseline whose centre is set, so stress() scores every still minute; only the still mask is kept. */
const MASK_BASELINE: BaselineState = { baseline: 0, spread: 1, nValid: 1, nightsSinceUpdate: 0, status: "calibrating" };

const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
const r1 = (x: number | null) => (x == null ? null : round(x, 1));

function stage1Key(data: Data, day: string, opts: PipelineOptions) {
  const lo = data.dayStart(day);
  const hi = data.dayStart(addDays(day, 1));
  const main = data.mainOf.get(day);
  return sha(
    JSON.stringify([
      SCORING_VERSION,
      opts.profile.maxHr,
      data.metrics.get(day)?.rhrBpm ?? null,
      main ? [main.id, main.startTs, main.endTs] : null,
      touching(data.sessions, lo, hi).map((s) => [s.id, s.startTs, s.endTs, s.isMain]),
      touching(data.exercises, lo, hi + 330).map((e) => [e.id, e.startTs, e.endTs, e.type, e.day]),
    ]),
  );
}

function stage1(db: Db, data: Data, opts: PipelineOptions): string[] {
  const c = db.$client;
  // A row written under another scoring version is stale whatever its key says.
  const stored = new Map(
    (c.prepare("select day, scoring_version v, strain from daily_scores").all() as { day: string; v: number; strain: string | null }[]).map((r) => [
      r.day,
      r.strain && r.v === SCORING_VERSION ? (JSON.parse(r.strain) as Stage1Day).key : null,
    ]),
  );
  const dirty = new Set(c.prepare("select day from intraday_dirty").pluck().all() as string[]);
  // A night that starts before midnight reads the previous day's HR for its resting HR.
  for (const d of [...dirty]) {
    const main = data.mainOf.get(addDays(d, 1));
    if (main && main.startTs < data.dayStart(addDays(d, 1))) dirty.add(addDays(d, 1));
  }
  const keys = new Map(data.days.map((d) => [d, stage1Key(data, d, opts)]));
  const todo = data.days.filter((d) => dirty.has(d) || stored.get(d) !== keys.get(d));

  const readHr = c.prepare("select ts, bpm from hr_samples where ts >= ? and ts < ? order by ts");
  const readSteps = c.prepare("select ts, steps from steps_minutes where ts >= ? and ts < ?");
  const upsert = c.prepare(
    `insert into daily_scores (day, scoring_version, strain, activities, session_rhr_bpm) values (?, ?, ?, ?, ?)
     on conflict(day) do update set scoring_version = excluded.scoring_version, strain = excluded.strain,
       activities = excluded.activities, session_rhr_bpm = excluded.session_rhr_bpm`,
  );
  const series = c.prepare(
    `insert into intraday_series (day, kind, data) values (?, ?, ?)
     on conflict(day, kind) do update set data = excluded.data where data is not excluded.data`,
  );

  const results = todo.map((day) => {
    const start = data.dayStart(day);
    const end = data.dayStart(addDays(day, 1));
    const main = data.mainOf.get(day);
    const exs = data.exercisesByDay.get(day) ?? [];
    const lo = Math.min(start, main?.startTs ?? start);
    const hi = Math.max(end, ...exs.map((e) => e.endTs + 330));
    const hr = readHr.all(lo, hi) as HrSample[];
    const steps = readSteps.all(start, end) as { ts: number; steps: number }[];
    return { day, ...stage1Day(data, day, start, end, main, exs, hr, steps, keys.get(day)!, opts) };
  });

  c.transaction(() => {
    for (const r of results) {
      upsert.run(r.day, SCORING_VERSION, JSON.stringify(r.s1), JSON.stringify(r.activities), r.sessionRhr);
      series.run(r.day, "hr", JSON.stringify(r.hrSeries));
      series.run(r.day, "still_hr", JSON.stringify(r.still));
      series.run(r.day, "load", JSON.stringify(r.load));
    }
    c.prepare("delete from intraday_dirty").run();
  })();
  return todo;
}

function stage1Day(
  data: Data,
  day: string,
  start: number,
  end: number,
  main: Session | undefined,
  exs: Exercise[],
  hr: HrSample[],
  stepRows: { ts: number; steps: number }[],
  key: string,
  opts: PipelineOptions,
) {
  const maxHr = opts.profile.maxHr;
  const dayHr = hr.filter((s) => s.ts >= start && s.ts < end);
  const sessionRhr = main ? sessionRestingHR(main.startTs, main.endTs, hr) : null;
  const dailyRhr = data.metrics.get(day)?.rhrBpm ?? null;
  const restingHr = sessionRhr ?? dailyRhr ?? defaultRestingHR;
  const zoneSet = hrZones(maxHr, "manual");
  const tiz = (xs: HrSample[]) => timeInZone(xs, zoneSet).seconds;

  const means = minuteMeanHr(dayHr, start, end);
  const n = means.length;
  const steps = new Array<number>(n).fill(0);
  for (const s of stepRows) steps[Math.floor((s.ts - start) / 60)] = s.steps;
  const excluded = [...touching(data.sessions, start, end), ...touching(data.exercises, start, end)].map((x) => ({
    start: x.startTs,
    end: x.endTs,
  }));
  const probe = stress({ start, end, hr: dayHr, steps, excluded, baseline: MASK_BASELINE });
  const still = probe.minutes.map((v, m) => (v == null ? null : means[m]));
  const noon = Math.min(n, 720);
  const withHr = (from: number, to: number) => means.slice(from, to).filter((v) => v != null).length;

  const s1: Stage1Day = {
    key,
    hrCount: dayHr.length,
    hrMinutesAm: withHr(0, noon),
    hrMinutesPm: withHr(noon, n),
    lastHrTs: dayHr.at(-1)?.ts ?? null,
    restingHr,
    restingHrSource: sessionRhr != null ? "session" : dailyRhr != null ? "daily" : "default",
    maxHr,
    effort: strain(dayHr, maxHr, restingHr),
    zoneLower: zoneSet.zones.map((z) => round(z.lower, 1)),
    zoneSeconds: tiz(dayHr),
    dayAggregate: probe.dayAggregate,
    stillMinutes: still.filter((v) => v != null).length,
  };
  const activities: Stage1Activity[] = exs.map((e) => {
    const xs = hr.filter((s) => s.ts >= e.startTs && s.ts <= e.endTs);
    return {
      id: e.id,
      effort: strain(xs, maxHr, restingHr),
      hrCount: xs.length,
      avgHr: xs.length ? round(xs.reduce((a, s) => a + s.bpm, 0) / xs.length, 1) : null,
      maxHr: xs.length ? Math.max(...xs.map((s) => s.bpm)) : null,
      zoneSeconds: tiz(xs),
      hrr: hrRecovery(hr, e.startTs, e.endTs, maxHr),
    };
  });
  return {
    s1,
    activities,
    sessionRhr,
    hrSeries: means.map(r1),
    still,
    load: minuteLoad(means, restingHr, maxHr),
  };
}

// ---------------------------------------------------------------------------------------------
// Stage 2: folds over every day

type Cached = { s1: Stage1Day; activities: Stage1Activity[]; sessionRhr: number | null; recovery: RecoveryRow | null };

const summarize = (s: BaselineState | null): BaselineSummary =>
  s && { mean: s.baseline, sd: sigma(s), status: s.status, nValid: s.nValid };

const STRENGTH = /STRENGTH|WEIGHT|CROSSFIT|CALISTHENICS/;
const meanOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function nightOf(main: Session, segments: Segment[] | undefined): NonNullable<SleepRow["main"]> {
  const staged = main.stagesStatus === "SUCCEEDED" && !!segments?.length;
  const inBedS = Math.max(0, main.endTs - main.startTs);
  if (staged) {
    const h = hypnogramMetrics({
      start: main.startTs,
      end: main.endTs,
      stages: segments!.map((g) => ({ start: g.startTs, end: g.endTs, stage: g.stage })),
    });
    return {
      id: main.id,
      start: main.startTs,
      end: main.endTs,
      processed: main.processed,
      staged,
      inBedMin: h.tibS / 60,
      asleepMin: h.tstS / 60,
      awakeMin: (h.tibS - h.tstS) / 60,
      deepMin: h.deepMin,
      remMin: h.remMin,
      lightMin: h.lightMin,
      efficiency: h.efficiency,
      wakeEvents: h.disturbances,
    };
  }
  const asleepMin = main.asleepMin ?? 0;
  return {
    id: main.id,
    start: main.startTs,
    end: main.endTs,
    processed: main.processed,
    staged,
    inBedMin: inBedS / 60,
    asleepMin,
    awakeMin: main.awakeMin ?? Math.max(0, inBedS / 60 - asleepMin),
    deepMin: main.deepMin,
    remMin: main.remMin,
    lightMin: main.lightMin,
    efficiency: inBedS > 0 ? Math.min(1, (asleepMin * 60) / inBedS) : 0,
    wakeEvents: null,
  };
}

function stage2(db: Db, data: Data, opts: PipelineOptions) {
  const c = db.$client;
  const tz = opts.timeZone;
  const { days } = data;

  const cached = new Map(
    (
      c.prepare("select day, strain, activities, session_rhr_bpm, recovery from daily_scores").all() as {
        day: string;
        strain: string | null;
        activities: string | null;
        session_rhr_bpm: number | null;
        recovery: string | null;
      }[]
    ).map((r): [string, Cached] => [
      r.day,
      {
        s1: JSON.parse(r.strain!),
        activities: JSON.parse(r.activities ?? "[]"),
        sessionRhr: r.session_rhr_bpm,
        recovery: r.recovery ? JSON.parse(r.recovery) : null,
      },
    ]),
  );
  const seriesOf = (kind: string) =>
    new Map(
      (c.prepare("select day, data from intraday_series where kind = ?").all(kind) as { day: string; data: string }[]).map((r) => [
        r.day,
        JSON.parse(r.data) as (number | null)[],
      ]),
    );
  const stillHr = seriesOf("still_hr");
  const loadSeries = seriesOf("load");
  const segments = groupBy(
    c.prepare("select session_id sessionId, start_ts startTs, end_ts endTs, stage from sleep_segments order by start_ts").all() as Segment[],
    (s) => s.sessionId,
  );
  const journal = groupBy(
    c.prepare("select day, tag, value from journal_entries order by day, tag").all() as { day: string; tag: string; value: number }[],
    (e) => e.day,
  );
  const tagOn = (day: string, tag: string) => (journal.get(day) ?? []).some((e) => e.tag === tag && e.value > 0);

  // Folded baselines (state before the current day).
  let hrvB: BaselineState | null = null;
  let rhrB: BaselineState | null = null;
  let respB: BaselineState | null = null;
  let skinB: BaselineState | null = null;

  const out = new Map<string, Record<string, unknown>>();
  const stressSeries = new Map<string, (number | null)[]>();
  const energySeries = new Map<string, (number | null)[]>();
  const nights: { day: string; hours: number }[] = [];
  const ledgerSeries: [string, number | null][] = [];
  const readinessRows: ReadinessDay[] = [];
  const monitorRows: HealthMonitorDay[] = [];
  const hsRows: HealthspanDay[] = [];
  const outcomes: OutcomeDay[] = [];
  const efforts: (number | null)[] = [];
  const recoveries: number[] = [];
  const aggregates: (number | null)[] = [];
  const reportRows: ReportDay[] = [];
  const wakeNights: { day: string; wakeMin: number; efficiency: number | null }[] = [];
  let prevAcwr: number | null = null;

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const start = data.dayStart(day);
    const end = data.dayStart(addDays(day, 1));
    const dm = data.metrics.get(day);
    const cache = cached.get(day)!;
    const s1 = cache.s1;
    const worn = s1.hrCount > 0;
    const mainSession = data.mainOf.get(day);
    const napSessions = (data.sessionsByDay.get(day) ?? []).filter((s) => s !== mainSession && !s.isMain);
    // noop truncates to whole years for sleep need; healthspan and fitness take the fraction.
    const age = { whole: wholeYears(opts.profile.birthDate, day), years: fractionalYears(opts.profile.birthDate, day) };

    // ── Sleep ────────────────────────────────────────────────────────────────
    const main = mainSession ? nightOf(mainSession, segments.get(mainSession.id)) : null;
    const naps = napSessions.map((s) => ({ id: s.id, start: s.startTs, end: s.endTs, asleepMin: s.asleepMin ?? 0 }));
    const recentNights = nights.slice(-28).map((n) => n.hours);
    const needHours = personalizedNeedHours(recentNights, age.whole);
    const sri = sleepRegularity(data, cached, day, tz);
    const consistency = sriConsistency(sri);
    const performance =
      main && main.asleepMin > 0
        ? rest(main.asleepMin * 60, main.efficiency, (main.deepMin ?? 0) * 60, (main.remMin ?? 0) * 60, needHours, consistency)
        : null;
    const yesterdayNaps = (data.sessionsByDay.get(addDays(day, -1)) ?? []).filter((s) => !s.isMain);
    const creditedMin = creditedSleepMin(main?.asleepMin ?? null, yesterdayNaps.reduce((a, s) => a + (s.asleepMin ?? 0), 0));
    ledgerSeries.push([day, creditedMin]);
    const debtMin = ledger(ledgerSeries, needHours).magnitudeMin;
    const sleepReason: ReasonCode | null = !mainSession
      ? "band_not_worn"
      : !mainSession.processed
        ? "awaiting_sleep_sync"
        : performance == null
          ? "no_data"
          : null;
    const sleepRow: SleepRow = {
      reason: sleepReason,
      main,
      naps,
      performance,
      needHours,
      needNights: Math.min(recentNights.length, 28),
      creditedMin,
      debtMin,
      sri,
      consistency: sri == null ? null : sriDisplay(sri),
    };

    // ── Recovery ─────────────────────────────────────────────────────────────
    const hrv = dm?.hrvMs ?? null;
    const sessionRhr = cache.sessionRhr;
    const resp = dm?.respBpm ?? null;
    const skinTempDev = dm?.nightlyTempC != null && skinB && isUsable(skinB) ? dm.nightlyTempC - skinB.baseline : null;
    const sleepPerf = performance != null ? performance / 100 : main ? main.efficiency : null;
    const stale = (
      [
        ["hrv", hrvB],
        ["rhr", rhrB],
        ["resp", respB],
        ["skinTemp", skinB],
      ] as const
    )
      .filter(([, b]) => b?.status === "stale")
      .map(([k]) => k);
    const rhrUsable = rhrB && isUsable(rhrB) ? rhrB : null;
    const respUsable = respB && isUsable(respB) ? respB : null;
    let recReason: ReasonCode | null = null;
    let nightsLeft: number | undefined;
    let value: number | null = null;
    let drivers: ChargeDriver[] = [];
    if (!mainSession) recReason = "band_not_worn";
    else if (!mainSession.processed) recReason = "awaiting_sleep_sync";
    else if (mainSession.stagesStatus !== "SUCCEEDED" || hrv == null) recReason = "no_hrv_last_night";
    else {
      const g = hrvB
        ? gatedRecovery({ hrv, rhr: sessionRhr, resp, hrvBaseline: hrvB, rhrBaseline: rhrUsable, respBaseline: respUsable, sleepPerf, skinTempDev })
        : { recovery: null };
      if (g.recovery == null) {
        recReason = "calibrating";
        nightsLeft = Math.max(1, minBaselineNights - (hrvB?.nValid ?? 0));
      } else {
        value = g.recovery;
        drivers = chargeDrivers({ hrv, rhr: sessionRhr, resp, hrvBaseline: hrvB!, rhrBaseline: rhrUsable, respBaseline: respUsable, sleepPerf, skinTempDev });
      }
    }
    const terms =
      value == null
        ? []
        : [
            "hrv",
            ...(rhrUsable && sessionRhr != null ? ["rhr"] : []),
            ...(respUsable && resp != null ? ["resp"] : []),
            ...(sleepPerf != null ? ["sleep"] : []),
            ...(skinTempDev != null ? ["skinTemp"] : []),
          ];
    const prev = cache.recovery;
    const updated =
      value != null && prev?.value != null && (prev.updated || terms.some((t) => !prev.terms.includes(t)));
    const hrvZ = hrv != null && hrvB && isUsable(hrvB) ? deviation(hrv, hrvB).z : null;
    if (value != null) recoveries.push(value);

    // ── Training load and readiness (today's strain counts toward today's ACWR) ──
    const effort = s1.effort;
    const load = effort ?? (worn ? 0 : null);
    readinessRows.push({ day, hrv, rhr: sessionRhr, resp, effort: load });
    const { readiness, trainingLoad } = evaluateWithTrainingLoad(readinessRows, day);
    const tlRow: TrainingLoadRow = {
      acwr: readiness.acwr,
      acwrPrior: prevAcwr,
      monotony: readiness.monotony,
      level: readiness.level,
      state: trainingLoad.state,
      contiguousDays: trainingLoad.contiguousDays,
      ctl: trainingLoad.ctl,
      atl: trainingLoad.atl,
      tsb: trainingLoad.tsb,
    };

    // ── Strain Target: prior days' Effort and ACWR ───────────────────────────
    const targetRow: StrainTargetRow =
      value == null
        ? { reason: recReason!, ...(nightsLeft !== undefined && { nightsLeft }) }
        : { reason: null, ...strainTarget(efforts.slice(), value, prevAcwr) };

    // ── Sleep Planner (tonight) ──────────────────────────────────────────────
    if (main) {
      wakeNights.push({ day, wakeMin: localMinutes(main.end, tz), efficiency: main.efficiency });
      nights.push({ day, hours: main.asleepMin / 60 });
    }
    const tonightNeed = personalizedNeedHours(nights.slice(-28).map((n) => n.hours), age.whole);
    const prior28 = efforts.slice(-28);
    const plan = sleepPlan({
      baselineNeedHours: tonightNeed,
      effort,
      meanEffort28: meanOf(prior28),
      debtMin,
      napMin: naps.reduce((a, n) => a + n.asleepMin, 0),
      nights: wakeNights,
      wakeDay: addDays(day, 1),
    });
    const plannerRow: SleepPlannerRow =
      wakeNights.length < minNeedNights
        ? { reason: "calibrating", nightsLeft: minNeedNights - wakeNights.length, needMin: plan.needMin }
        : { reason: null, wakeDay: addDays(day, 1), nights: Math.min(wakeNights.length, 14), ...plan };

    // ── Forecast (needs 14 scored days) ──────────────────────────────────────
    const forecast =
      value != null && recoveries.length >= 14
        ? recoveryForecast({
            recentCharge: recoveries,
            recentEffort: efforts.filter((e): e is number => e != null).slice(-14),
            todayEffort: effort,
            plannedSleepHours: plan.needMin / 60,
            needHours: tonightNeed,
            needNights: nights.length,
          })
        : null;

    const recoveryRow: RecoveryRow = {
      value,
      reason: recReason,
      ...(nightsLeft !== undefined && { nightsLeft }),
      provisional: value != null && !isTrusted(hrvB!),
      stale,
      terms,
      updated,
      inputs: { hrv, rhr: sessionRhr, resp, sleepPerf, skinTempDev },
      baselines: { hrv: summarize(hrvB), rhr: summarize(rhrB), resp: summarize(respB), skinTemp: summarize(skinB) },
      hrvZ,
      drivers,
      forecast,
      forecastNightsLeft: Math.max(0, 14 - recoveries.length),
    };

    // ── Stress (baseline from earlier days' aggregates) ──────────────────────
    const baseline = foldDaytimeBaseline(aggregates);
    aggregates.push(s1.dayAggregate);
    const still = stillHr.get(day) ?? [];
    const st = stress({
      start,
      end,
      hr: still.flatMap((bpm, m) => (bpm == null ? [] : [{ ts: start + m * 60, bpm }])),
      steps: [],
      excluded: [],
      baseline,
    });
    stressSeries.set(day, st.minutes.map((v) => (v == null ? null : round(v, 2))));
    const lastStress = st.minutes.findLastIndex((v) => v != null);
    const stressRow: StressRow = {
      provisional: st.provisional,
      average: st.average,
      lowMin: st.lowMin,
      mediumMin: st.mediumMin,
      highMin: st.highMin,
      latest: lastStress < 0 ? null : { ts: start + lastStress * 60, value: st.minutes[lastStress]! },
      longestHigh: longestRun(st.minutes, (v) => v != null && v >= 2, start),
      referenceHr: st.referenceHr,
    };

    // ── Energy Bank ──────────────────────────────────────────────────────────
    let energyRow: EnergyBankRow;
    if (value == null || !main) {
      energyRow = { value: null, reason: recReason ?? "no_data", provisional: false };
    } else {
      const tonight = data.mainOf.get(addDays(day, 1));
      const until =
        tonight && tonight.startTs < end ? tonight.startTs : s1.lastHrTs != null ? Math.min(end, s1.lastHrTs + 60) : end;
      const napIntervals = naps.filter((n) => n.start >= main.end).map((n) => ({ start: n.start, end: n.end }));
      const eb = energyBank({
        start,
        wake: main.end,
        until,
        recovery: value,
        sleepPerformance: performance ?? main.efficiency * 100,
        load: loadSeries.get(day) ?? [],
        stress: st.minutes,
        naps: napIntervals,
        workouts: (data.exercisesByDay.get(day) ?? []).map((e) => ({ start: e.startTs, end: e.endTs, label: e.name ?? "Workout" })),
      });
      // Recharge earned (calm still minutes at k3, nap minutes at k4); everything else is drain.
      // ponytail: nominal amounts, before the engine's 0–100 clamp; exact unless the bank hits a bound.
      let charged = 0;
      for (let m = 0; m < eb.curve.length; m++) {
        if (eb.curve[m] == null) continue;
        const ts = start + m * 60;
        if (napIntervals.some((n) => ts < n.end && ts + 60 > n.start)) charged += energyBankConfig.k4;
        else if (st.minutes[m] != null && st.minutes[m]! < 1) charged += energyBankConfig.k3;
      }
      const drained = eb.current - eb.startLevel - charged;
      energySeries.set(day, eb.curve.map(r1));
      energyRow = {
        value: eb.current,
        reason: null,
        provisional: recoveryRow.provisional,
        startLevel: eb.startLevel,
        wake: main.end,
        until,
        charged,
        drained,
        topDrains: eb.topDrains,
        naps: napIntervals,
      };
    }

    // ── Health Monitor (nightly rows, oldest first) ──────────────────────────
    monitorRows.push({ day, rhr: sessionRhr, hrv, resp, spo2: dm?.spo2Pct ?? null, skinTempDev });
    const hasVitals = sessionRhr != null || hrv != null || resp != null || dm?.spo2Pct != null || skinTempDev != null;
    const yesterday = addDays(day, -1);
    const monitorRow: HealthMonitorRow = !hasVitals
      ? { reason: mainSession ? "no_data" : "band_not_worn" }
      : {
          reason: null,
          stale,
          ...healthMonitor(monitorRows, {
            alcohol: tagOn(yesterday, "alcohol"),
            sauna: tagOn(yesterday, "sauna"),
            travelPhaseJump: tagOn(yesterday, "travel"),
            alreadyUnwell: tagOn(yesterday, "illness"),
          }),
        };

    // ── Healthspan ───────────────────────────────────────────────────────────
    const strengthMin = (data.exercisesByDay.get(day) ?? [])
      .filter((e) => STRENGTH.test(e.type))
      .reduce((a, e) => a + (e.endTs - e.startTs) / 60, 0);
    hsRows.push({
      day,
      sleepHours: main ? main.asleepMin / 60 : null,
      sri,
      zone13Min: worn ? (s1.zoneSeconds[0] + s1.zoneSeconds[1] + s1.zoneSeconds[2]) / 60 : null,
      zone45Min: worn ? (s1.zoneSeconds[3] + s1.zoneSeconds[4]) / 60 : null,
      strengthMin: worn ? strengthMin : null,
      steps: dm?.steps ?? null,
      vo2maxRun: dm?.vo2maxRun ?? null,
      vo2maxDaily: dm?.vo2maxDaily ?? null,
      restingHr: dm?.rhrBpm ?? null,
      weightKg: dm?.weightKg ?? null,
      bodyFatPct: dm?.bodyFatPct ?? null,
    });
    const hs = healthspan(hsRows, { age: age.years, sex: opts.profile.sex, heightCm: opts.profile.heightCm ?? null }, day);
    const healthspanRow: HealthspanRow = hs
      ? { reason: null, age: age.years, ...hs }
      : { reason: "calibrating", dataDays: hsRows.filter((r) => Object.entries(r).some(([k, v]) => k !== "day" && v != null)).length };

    // ── Fitness level: latest run VO2max in 90 days, else the latest daily value ──
    const fitnessRow = fitnessOf(hsRows, day, age.years, opts.profile.sex);

    // ── Journal impact outcomes ──────────────────────────────────────────────
    outcomes.push({ day, recovery: value, hrvZ, sleepPerf: performance });

    reportRows.push({
      day,
      recovery: value,
      strain: effort == null ? null : (effort * 21) / 100,
      sleepPerf: performance,
      sleepHours: main ? (main.asleepMin + naps.reduce((a, n) => a + n.asleepMin, 0)) / 60 : null,
      hrv,
      rhr: sessionRhr ?? dm?.rhrBpm ?? null,
      acwr: readiness.acwr,
      sleepConsistency: sleepRow.consistency,
    });

    out.set(day, {
      recovery: recoveryRow,
      sleep: sleepRow,
      training_load: tlRow,
      strain_target: targetRow,
      sleep_planner: plannerRow,
      energy_bank: energyRow,
      stress: stressRow,
      health_monitor: monitorRow,
      healthspan: healthspanRow,
      fitness: fitnessRow,
    });

    // ── Fold today's nightly values into the baselines (after scoring today) ─
    hrvB = update(hrvB, hrv, hrvCfg);
    rhrB = update(rhrB, sessionRhr, restingHRCfg);
    respB = update(respB, resp, respCfg);
    skinB = update(skinB, dm?.nightlyTempC ?? null, skinTempCfg);
    efforts.push(effort);
    prevAcwr = readiness.acwr;
  }

  // ── Journal impact: as of each day, memoised on its inputs ────────────────
  const entries: JournalDay[] = [...journal].map(([day, es]) => ({ day, tags: Object.fromEntries(es.map((e) => [e.tag, e.value])) }));
  const storedImpact = new Map(
    (c.prepare("select day, journal_impact from daily_scores").all() as { day: string; journal_impact: string | null }[]).map((r) => [
      r.day,
      r.journal_impact ? (JSON.parse(r.journal_impact) as JournalImpactRow) : null,
    ]),
  );
  const impactsAsOf = new Map<string, TagImpact[]>();
  for (const day of days) {
    const from = addDays(day, -90);
    const inWindow = entries.filter((e) => e.day >= from && e.day < day);
    const outWindow = outcomes.filter((o) => o.day > from && o.day <= day);
    const key = sha(JSON.stringify([inWindow, outWindow]));
    const prior = storedImpact.get(day);
    const impacts = prior?.key === key ? prior.impacts : journalImpact(inWindow, outWindow, day);
    impactsAsOf.set(day, impacts);
    out.get(day)!.journal_impact = { key, impacts } satisfies JournalImpactRow;
  }

  // ── Writes ────────────────────────────────────────────────────────────────
  const cols = ["recovery", "sleep", "training_load", "strain_target", "sleep_planner", "energy_bank", "stress", "health_monitor", "healthspan", "fitness", "journal_impact"];
  const write = c.prepare(
    `update daily_scores set scoring_version = ?, ${cols.map((k) => `${k} = ?`).join(", ")}
     where day = ? and (scoring_version, ${cols.join(", ")}) is not (?, ${cols.map(() => "?").join(", ")})`,
  );
  const series = c.prepare(
    `insert into intraday_series (day, kind, data) values (?, ?, ?)
     on conflict(day, kind) do update set data = excluded.data where data is not excluded.data`,
  );
  const dropEnergy = c.prepare("delete from intraday_series where day = ? and kind = 'energy_bank'");
  const report = c.prepare(
    "insert into reports (period, data) values (?, ?) on conflict(period) do update set data = excluded.data where data is not excluded.data",
  );
  const periods = reportPeriods(reportRows);
  c.transaction(() => {
    for (const day of days) {
      const values = cols.map((k) => JSON.stringify(out.get(day)![k]));
      write.run(SCORING_VERSION, ...values, day, SCORING_VERSION, ...values);
      series.run(day, "stress", JSON.stringify(stressSeries.get(day)));
      const eb = energySeries.get(day);
      if (eb) series.run(day, "energy_bank", JSON.stringify(eb));
      else dropEnergy.run(day);
    }
    for (const period of periods) {
      const { end } = periodBounds(period);
      const asOf = end < data.last ? end : data.last;
      report.run(period, JSON.stringify(buildReport(period, reportRows, impactsAsOf.get(asOf) ?? [])));
    }
    c.prepare(`delete from reports where period not in (${periods.map(() => "?").join(", ") || "''"})`).run(...periods);
    c.prepare("delete from daily_scores where day < ? or day > ?").run(data.first, data.last);
    c.prepare("delete from intraday_series where day < ? or day > ?").run(data.first, data.last);
  })();
}

/** SRI over the 7 nights ending on D: noon-to-noon periods, so tonight's sleep never counts toward today. */
function sleepRegularity(data: Data, cached: Map<string, Cached>, day: string, tz: string): number | null {
  const noon = (d: string) => localMidnight(d, tz) + 12 * 3600;
  const windowStart = noon(addDays(day, -7));
  const sessions = [];
  for (let k = -7; k <= 0; k++) {
    for (const s of data.sessionsByDay.get(addDays(day, k)) ?? []) sessions.push({ start: s.startTs, end: s.endTs });
  }
  // A period is covered when the band was worn for at least half of it.
  const covered = Array.from({ length: 7 }, (_, k) => {
    const pm = cached.get(addDays(day, k - 7))?.s1.hrMinutesPm ?? 0;
    const am = cached.get(addDays(day, k - 6))?.s1.hrMinutesAm ?? 0;
    return pm + am >= 720;
  });
  return sleepRegularityIndex(sessions, windowStart, covered);
}

function longestRun(xs: (number | null)[], hit: (v: number | null) => boolean, start: number) {
  let best: { start: number; minutes: number } | null = null;
  let runStart = -1;
  for (let m = 0; m <= xs.length; m++) {
    if (m < xs.length && hit(xs[m])) {
      if (runStart < 0) runStart = m;
    } else if (runStart >= 0) {
      if (!best || m - runStart > best.minutes) best = { start: start + runStart * 60, minutes: m - runStart };
      runStart = -1;
    }
  }
  return best;
}

function fitnessOf(rows: HealthspanDay[], day: string, age: number, sex: "male" | "female"): FitnessRow {
  const cutoff = addDays(day, -89);
  const run = rows.findLast((r) => r.vo2maxRun != null && r.day >= cutoff);
  const daily = rows.findLast((r) => r.vo2maxDaily != null);
  const pick = run ? { v: run.vo2maxRun!, source: "run" as const, sourceDay: run.day } : daily ? { v: daily.vo2maxDaily!, source: "daily" as const, sourceDay: daily.day } : null;
  if (!pick) return { reason: "no_data" };
  return { reason: null, vo2max: pick.v, source: pick.source, sourceDay: pick.sourceDay, age, ...fitnessLevel(pick.v, age, sex) };
}
