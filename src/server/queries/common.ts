// Shared by the screen queries: the query context, batched day loaders and the Metric builders.
import { getConfig, type Config } from "../config";
import { type Db, getDb } from "../db";
import type {
  EnergyBankRow,
  FitnessRow,
  HealthMonitorRow,
  HealthspanRow,
  RecoveryRow,
  SleepPlannerRow,
  SleepRow,
  Stage1Activity,
  Stage1Day,
  StrainTargetRow,
  StressRow,
  TrainingLoadRow,
} from "../pipeline";
import { addDays, localDay, localMidnight } from "../time";
import type { ActivityKind, DayPoint, Metric, MetricTag, ReasonCode, SleepPlanVM, TimelineItem, TimePoint } from "./types";

export type QueryCtx = {
  db: Db;
  timeZone: string;
  profile: Config["profile"];
  mode: "demo" | "google";
  /** Unix seconds. */
  now: number;
};

export function defaultCtx(): QueryCtx {
  const cfg = getConfig();
  return { db: getDb(), timeZone: cfg.timeZone, profile: cfg.profile, mode: cfg.googleOAuthEnabled ? "google" : "demo", now: Math.floor(Date.now() / 1000) };
}

export const todayOf = (ctx: QueryCtx) => localDay(ctx.now, ctx.timeZone);

export type MetricsRow = {
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
};

export type DayRow = {
  day: string;
  s1: Stage1Day | null;
  activities: Stage1Activity[];
  sessionRhr: number | null;
  recovery: RecoveryRow | null;
  sleep: SleepRow | null;
  trainingLoad: TrainingLoadRow | null;
  strainTarget: StrainTargetRow | null;
  sleepPlanner: SleepPlannerRow | null;
  energyBank: EnergyBankRow | null;
  stress: StressRow | null;
  healthMonitor: HealthMonitorRow | null;
  healthspan: HealthspanRow | null;
  fitness: FitnessRow | null;
  metrics: MetricsRow | null;
};

const parse = <T>(s: string | null): T | null => (s == null ? null : (JSON.parse(s) as T));

/** Every day in [from, to], one query per table; days without rows come back empty. */
export function loadDays(ctx: QueryCtx, from: string, to: string): Map<string, DayRow> {
  const c = ctx.db.$client;
  type Raw = Record<string, string | null> & { day: string; session_rhr_bpm: number | null };
  const scores = new Map(
    (
      c
        .prepare(
          `select day, strain, activities, session_rhr_bpm, recovery, sleep, training_load, strain_target, sleep_planner,
             energy_bank, stress, health_monitor, healthspan, fitness
           from daily_scores where day >= ? and day <= ?`,
        )
        .all(from, to) as Raw[]
    ).map((r) => [r.day, r]),
  );
  const metrics = new Map(
    (
      c
        .prepare(
          `select day, hrv_ms hrvMs, rhr_bpm rhrBpm, resp_bpm respBpm, nightly_temp_c nightlyTempC, spo2_pct spo2Pct,
             vo2max_daily vo2maxDaily, vo2max_run vo2maxRun, steps, calories
           from daily_metrics where day >= ? and day <= ?`,
        )
        .all(from, to) as MetricsRow[]
    ).map((r) => [r.day, r]),
  );
  const out = new Map<string, DayRow>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = scores.get(d);
    out.set(d, {
      day: d,
      s1: parse(r?.strain ?? null),
      activities: parse<Stage1Activity[]>(r?.activities ?? null) ?? [],
      sessionRhr: r?.session_rhr_bpm ?? null,
      recovery: parse(r?.recovery ?? null),
      sleep: parse(r?.sleep ?? null),
      trainingLoad: parse(r?.training_load ?? null),
      strainTarget: parse(r?.strain_target ?? null),
      sleepPlanner: parse(r?.sleep_planner ?? null),
      energyBank: parse(r?.energy_bank ?? null),
      stress: parse(r?.stress ?? null),
      healthMonitor: parse(r?.health_monitor ?? null),
      healthspan: parse(r?.healthspan ?? null),
      fitness: parse(r?.fitness ?? null),
      metrics: metrics.get(d) ?? null,
    });
  }
  return out;
}

export function loadSeries(ctx: QueryCtx, day: string, kind: string): (number | null)[] | null {
  const r = ctx.db.$client.prepare("select data from intraday_series where day = ? and kind = ?").pluck().get(day, kind) as string | undefined;
  return r ? (JSON.parse(r) as (number | null)[]) : null;
}

export const firstDay = (ctx: QueryCtx) => ctx.db.$client.prepare("select min(day) from daily_scores").pluck().get() as string | null;

// ── Metric builders ─────────────────────────────────────────────────────────

export const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

export function ok<T>(value: T, provisional = false, tags: MetricTag[] = []): Metric<T> {
  if (typeof value === "number" && !Number.isFinite(value)) return none("no_data");
  return { value, reason: null, provisional, ...(tags.length && { tags }) };
}

export function none<T>(reason: ReasonCode, nightsLeft?: number): Metric<T> {
  return { value: null, reason, provisional: false, ...(nightsLeft !== undefined && { nightsLeft }) };
}

/** A stored `{ reason, nightsLeft }` as a null metric; "band_not_worn" on today means the night hasn't synced yet. */
export const fromReason = <T>(reason: ReasonCode | null | undefined, isToday: boolean, nightsLeft?: number): Metric<T> =>
  none(nightReason(reason ?? "no_data", isToday), nightsLeft);

export const nightReason = (reason: ReasonCode, isToday: boolean): ReasonCode =>
  reason === "band_not_worn" && isToday ? "awaiting_sleep_sync" : reason;

/** Why a nightly vital (HRV, resting HR, …) is missing on `row`'s day. */
export function vitalReason(row: DayRow | undefined, isToday: boolean, hrv = false): ReasonCode {
  const main = row?.sleep?.main;
  if (!main) return isToday ? "awaiting_sleep_sync" : "band_not_worn";
  if (!main.processed) return "awaiting_sleep_sync";
  return hrv ? "no_hrv_last_night" : "no_data";
}

/** A value metric when finite, else the given reason. */
export const maybe = (v: number | null | undefined, reason: ReasonCode, provisional = false, tags: MetricTag[] = []): Metric<number> =>
  finite(v) ? ok(v, provisional, tags) : none(reason);

/** Why strain-type (HR) data is missing. */
export const hrReason = (s1: Stage1Day | null): ReasonCode => (!s1 || s1.hrCount === 0 ? "band_not_worn" : "insufficient_hr_data");

export const toStrain = (effort: number) => (effort * 21) / 100;
export const ms = (s: number) => s * 1000;

export function meanSd(xs: (number | null | undefined)[]) {
  const v = xs.filter(finite);
  if (!v.length) return { mean: null, sd: undefined };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length - 1)) : undefined;
  return { mean, sd };
}

/** Mean and SD over the `n` days before `day` (exclusive). */
export function priorStats(rows: Map<string, DayRow>, day: string, pick: (r: DayRow) => number | null | undefined, n = 30) {
  const xs: (number | null | undefined)[] = [];
  for (let k = 1; k <= n; k++) {
    const r = rows.get(addDays(day, -k));
    if (r) xs.push(pick(r));
  }
  return meanSd(xs);
}

/** `n` days ending on `day`, oldest first. */
export function trendPoints(rows: Map<string, DayRow>, day: string, pick: (r: DayRow) => number | null | undefined, n = 182, provisional?: (r: DayRow) => boolean): DayPoint[] {
  return Array.from({ length: n }, (_, k) => {
    const d = addDays(day, k - n + 1);
    const r = rows.get(d);
    const v = r ? pick(r) : null;
    return { day: d, value: finite(v) ? v : null, ...(r && provisional?.(r) && { provisional: true }) };
  });
}

/** A per-minute series on the day's grid → points every `step` minutes (nulls kept as gaps). */
export function minutePoints(series: (number | null)[] | null, dayStart: number, step = 1, from = 0, to = Infinity): TimePoint[] {
  if (!series) return [];
  const out: TimePoint[] = [];
  for (let m = Math.max(0, from); m < Math.min(series.length, to); m += step) {
    const v = series[m];
    out.push({ t: ms(dayStart + m * 60), v: finite(v) ? v : null });
  }
  return out;
}

export const dayStartOf = (ctx: QueryCtx, day: string) => localMidnight(day, ctx.timeZone);

// ── Activities and plans ─────────────────────────────────────────────────────

export function activityKind(type: string): ActivityKind {
  if (/RUN/.test(type)) return "run";
  if (/BIK|CYCL|RIDE/.test(type)) return "ride";
  if (/WALK|HIK/.test(type)) return "walk";
  if (/STRENGTH|WEIGHT|CROSSFIT|CALISTHENICS/.test(type)) return "strength";
  return "workout";
}

export const ACTIVITY_NAME: Record<ActivityKind, string> = {
  run: "Running",
  ride: "Cycling",
  walk: "Walking",
  strength: "Strength training",
  workout: "Workout",
};

export type ExerciseRow = { id: string; day: string; startTs: number; endTs: number; type: string; name: string | null; calories: number | null };

export function exercisesBetween(ctx: QueryCtx, from: string, to: string): ExerciseRow[] {
  return ctx.db.$client
    .prepare("select id, day, start_ts startTs, end_ts endTs, type, name, calories from exercises where day >= ? and day <= ? order by start_ts, id")
    .all(from, to) as ExerciseRow[];
}

export function activityItem(e: ExerciseRow, row: DayRow | undefined): Extract<TimelineItem, { kind: "activity" }> {
  const kind = activityKind(e.type);
  const a = row?.activities.find((x) => x.id === e.id);
  const strain = a?.effort != null ? ok(toStrain(a.effort)) : none<number>(a && a.hrCount > 0 ? "insufficient_hr_data" : "band_not_worn");
  return { kind: "activity", id: e.id, day: e.day, name: ACTIVITY_NAME[kind], activityKind: kind, strain, start: ms(e.startTs), end: ms(e.endTs) };
}

/** The day's timeline: main sleep, naps and workouts, in time order. */
export function timeline(ctx: QueryCtx, row: DayRow | undefined, day: string): TimelineItem[] {
  const items: TimelineItem[] = [];
  const s = row?.sleep;
  if (s?.main) items.push({ kind: "sleep", id: s.main.id, day, minutes: s.main.asleepMin, start: ms(s.main.start), end: ms(s.main.end) });
  for (const n of s?.naps ?? []) items.push({ kind: "nap", id: n.id, day, minutes: n.asleepMin, start: ms(n.start), end: ms(n.end) });
  for (const e of exercisesBetween(ctx, day, day)) items.push(activityItem(e, row));
  return items.sort((a, b) => a.start - b.start);
}

const PLAN_LABELS = [
  ["peak", "Peak"],
  ["perform", "Perform"],
  ["get_by", "Get by"],
] as const;

export function planVM(ctx: QueryCtx, row: DayRow | undefined, isToday: boolean): Metric<SleepPlanVM> {
  const p = row?.sleepPlanner;
  if (!p) return none(isToday ? "awaiting_sleep_sync" : "no_data");
  if (p.reason !== null) return none(p.reason, p.nightsLeft);
  if (p.wakeMin == null) return none("no_data");
  const wakeMidnight = localMidnight(p.wakeDay, ctx.timeZone);
  return ok({
    needMin: p.needMin,
    parts: p.parts,
    wakeAt: ms(wakeMidnight + Math.round(p.wakeMin * 60)),
    weekend: p.weekend,
    plans: p.plans.map((x, i) => ({
      key: PLAN_LABELS[i][0],
      label: PLAN_LABELS[i][1],
      share: x.share,
      sleepMin: x.sleepMin,
      bedtimeAt: ms(wakeMidnight + Math.round(x.bedtimeMin * 60)),
    })),
  });
}

export const recoveryBand = (v: number) => (v >= 67 ? "green" : v >= 34 ? "yellow" : "red");
export const stressLevel = (v: number) => (v >= 2 ? "high" : v >= 1 ? "medium" : "low");

/** Recovery tags: stale baselines and a late-gained term. */
export const recoveryTags = (r: RecoveryRow): MetricTag[] => [...(r.stale.length ? ["stale_baseline" as const] : []), ...(r.updated ? ["updated" as const] : [])];

export function recoveryMetric(row: DayRow | undefined, isToday: boolean): Metric<number> {
  const r = row?.recovery;
  if (!r) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (r.value == null) return fromReason(r.reason, isToday, r.nightsLeft);
  return ok(r.value, r.provisional, recoveryTags(r));
}

export function sleepMetric(row: DayRow | undefined, isToday: boolean): Metric<number> {
  const s = row?.sleep;
  if (!s) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (s.performance == null) return fromReason(s.reason, isToday);
  return ok(s.performance);
}

export function strainMetric(row: DayRow | undefined): Metric<number> {
  const s1 = row?.s1;
  return s1?.effort != null ? ok(toStrain(s1.effort)) : none(hrReason(s1 ?? null));
}

export function stressNow(row: DayRow | undefined, isToday: boolean): Metric<{ value: number; level: "low" | "medium" | "high"; at: number | null; dayAverage: boolean }> {
  const st = row?.stress;
  if (!row?.s1 || row.s1.hrCount === 0) return none("band_not_worn");
  if (!st || st.average == null) return none("no_data");
  if (isToday && st.latest) return ok({ value: st.latest.value, level: stressLevel(st.latest.value), at: ms(st.latest.ts), dayAverage: false }, st.provisional);
  return ok({ value: st.average, level: stressLevel(st.average), at: null, dayAverage: true }, st.provisional);
}
