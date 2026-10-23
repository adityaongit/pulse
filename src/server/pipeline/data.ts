// Loading: the daily rows, sessions and exercises both stages fold over, and small shared helpers.
import { uniqueExercises } from "../exercises";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Db } from "../db";
import { dailyMetrics, exercises as exercisesTable, intradaySeries, sleepSessions } from "../db/schema";
import { sampleRange } from "../samples";
import { addDays, daysBetween, localDay, localMidnight } from "../time";
import type { PipelineOptions } from "./types";

export type Session = {
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
export type Exercise = { id: string; day: string; startTs: number; endTs: number; type: string; name: string | null; calories: number | null; distanceM: number | null };
export type Metrics = {
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
  /** Google's zone bounds for the day (see daily_metrics.hr_zones). */
  hrZones: number[] | null;
  lightModerateMin: number | null;
  vigorousPeakMin: number | null;
  tempBaselineC: number | null;
  tempSdC: number | null;
  rhrRangeLow: number | null;
  rhrRangeHigh: number | null;
  hrvRangeLow: number | null;
  hrvRangeHigh: number | null;
};
export type Segment = { sessionId: string; startTs: number; endTs: number; stage: "awake" | "light" | "deep" | "rem" };

export type Data = Awaited<ReturnType<typeof load>> & {};

export function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x);
    else m.set(k, [x]);
  }
  return m;
}

// Text tie-breaks sort bytewise ("C"), as SQLite did: session and exercise order feeds stage 1's keys and the naps list.
const byteOrder = (c: AnyPgColumn) => sql`${c} collate "C"`;

export async function load(db: Db, { userId, timeZone: tz }: PipelineOptions) {
  const m = dailyMetrics;
  const s = sleepSessions;
  const e = exercisesTable;
  const [metrics, sessions, exerciseRows, hrSpan] = await Promise.all([
    db
      .select({
        day: m.day, hrvMs: m.hrvMs, rhrBpm: m.rhrBpm, respBpm: m.respBpm, nightlyTempC: m.nightlyTempC, spo2Pct: m.spo2Pct,
        vo2maxDaily: m.vo2maxDaily, vo2maxRun: m.vo2maxRun, steps: m.steps, calories: m.calories, weightKg: m.weightKg,
        bodyFatPct: m.bodyFatPct, hrZones: m.hrZones, lightModerateMin: m.lightModerateMin, vigorousPeakMin: m.vigorousPeakMin,
        tempBaselineC: m.tempBaselineC, tempSdC: m.tempSdC, rhrRangeLow: m.rhrRangeLow, rhrRangeHigh: m.rhrRangeHigh,
        hrvRangeLow: m.hrvRangeLow, hrvRangeHigh: m.hrvRangeHigh,
      })
      .from(m)
      .where(eq(m.userId, userId))
      .orderBy(m.day) as Promise<Metrics[]>,
    db
      .select({
        id: s.id, day: s.day, startTs: s.startTs, endTs: s.endTs, isMain: s.isMain, processed: s.processed, stagesStatus: s.stagesStatus,
        asleepMin: s.asleepMin, awakeMin: s.awakeMin, deepMin: s.deepMin, lightMin: s.lightMin, remMin: s.remMin,
      })
      .from(s)
      .where(eq(s.userId, userId))
      .orderBy(s.startTs, byteOrder(s.id)) as Promise<Session[]>,
    db
      .select({ id: e.id, day: e.day, startTs: e.startTs, endTs: e.endTs, type: e.type, name: e.name, calories: e.calories, distanceM: e.distanceM })
      .from(e)
      .where(eq(e.userId, userId))
      .orderBy(e.startTs, byteOrder(e.id)) as Promise<Exercise[]>,
    sampleRange(db, "hr", userId),
  ]);
  const exercises = uniqueExercises(exerciseRows);
  const candidates = [
    ...metrics.map((m) => m.day),
    ...sessions.map((s) => s.day),
    ...exercises.map((x) => x.day),
    ...(hrSpan ? [localDay(hrSpan.min, tz), localDay(hrSpan.max, tz)] : []),
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
    exercisesByDay: groupBy(exercises, (x) => x.day),
  };
}

/** Sessions and exercises that overlap [lo, hi). */
export const touching = <T extends { startTs: number; endTs: number }>(xs: T[], lo: number, hi: number) =>
  xs.filter((x) => x.endTs > lo && x.startTs < hi);

export const sha = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);
export const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
export const r1 = (x: number | null) => (x == null ? null : round(x, 1));

/** Days per write transaction: keeps memory flat in history length and each write lock short. */
export const BATCH_DAYS = 30;

/** Upserts per-minute series in one statement, writing only the rows whose data differs. */
export async function upsertSeries(db: Db, userId: number, rows: { day: string; kind: string; data: (number | null)[] }[]) {
  if (!rows.length) return;
  const t = intradaySeries;
  await db
    .insert(t)
    .values(rows.map((r) => ({ userId, ...r })))
    .onConflictDoUpdate({
      target: [t.userId, t.day, t.kind],
      set: { data: sql`excluded.data` },
      setWhere: sql`intraday_series.data is distinct from excluded.data`,
    });
}
