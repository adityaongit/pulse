// Seed source (KTD2, KTD3): a deterministic demo person written straight into the normalized tables.
//
// Every day is a pure function of (anchor day, day index, time zone, max HR). Randomness comes from
// mulberry32 keyed by the date and a stream name, so any day regenerates identically. Each pull
// regenerates the days from the last sync to "now" and inserts only what has happened by then, with
// insert-or-ignore, so a later tick adds rows and never changes earlier ones.
//
// mulberry32 and the shaping (HR follows steps, a workout lifts both, sleep HR sits under the day's
// resting figure) are adapted from Hælan's packages/core/src/testing/seed.ts (AGPL-3.0).
import { eq, getTableColumns, min, sql } from "drizzle-orm";
import { getConfig } from "../../config";
import { type Db, getDb } from "../../db";
import {
  dailyMetrics,
  exercises,
  intradayDirty,
  journalEntries,
  sleepSegments,
  sleepSessions,
  syncState,
} from "../../db/schema";
import { ensureDefaultTags } from "../../journalTags";
import type { Source } from "../types";
import {
  ALCOHOL_WEEKEND_ODDS,
  blockWeek,
  DEFAULT_JOURNAL_TAGS,
  EFFECTS,
  fatigue,
  hasSkinTemp,
  illnessSeverity,
  isBandOffDay,
  isBandOffNight,
  isShortSleep,
  MISSED_CHECK_IN_ODDS,
  plannedWorkouts,
  SCENARIO,
  SEED_DAYS,
  SKIN_TEMP_LAG_S,
  SLEEP_SYNC_DELAY_S,
  TAG_ODDS,
  type Tag,
  type WorkoutKind,
  WORKOUTS,
} from "./scenario";

// ---------------------------------------------------------------------------------------------
// Randomness and time

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** One stream per (day, purpose), so extra draws in one never move another. */
function rng(day: string, stream: string) {
  const next = mulberry32(hash(`${day}:${stream}`));
  return {
    u: (lo = 0, hi = 1) => lo + (hi - lo) * next(),
    /** About N(0, 1), bounded to ±3.5 (Irwin–Hall), so clamps rarely bind. */
    g: () => (next() + next() + next() + next() - 2) * Math.sqrt(3),
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof rng>;

const DAY_MS = 86_400_000;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, dp = 0) => Math.round(x * 10 ** dp) / 10 ** dp;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

const formats = new Map<string, Intl.DateTimeFormat>();
function partsFormat(timeZone: string) {
  let f = formats.get(timeZone);
  if (!f) {
    const n = "numeric";
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: n, month: n, day: n, hour: n, minute: n, second: n });
    formats.set(timeZone, f);
  }
  return f;
}

/** Local wall-clock parts of a unix-seconds instant. */
function localParts(ts: number, timeZone: string) {
  const p = Object.fromEntries(partsFormat(timeZone).formatToParts(ts * 1000).map((x) => [x.type, Number(x.value)]));
  return { year: p.year, month: p.month, day: p.day, offsetS: Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 1000 - ts };
}

/** Local `YYYY-MM-DD` of a unix-seconds instant. */
export function localDay(ts: number, timeZone: string) {
  const { year, month, day } = localParts(ts, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Unix seconds of the local midnight that starts `day`. */
export function localMidnight(day: string, timeZone: string) {
  const utc = Date.parse(`${day}T00:00:00Z`) / 1000;
  return utc - localParts(utc - localParts(utc, timeZone).offsetS, timeZone).offsetS;
}

type Ctx = { anchor: string; timeZone: string; maxHr: number };

const dayOf = (ctx: Ctx, i: number) => addDays(ctx.anchor, i);
/** 0 → 1 across the seeded range, then flat: slow fitness and body-composition trends. */
const progress = (i: number) => Math.min(1, i / SEED_DAYS);
const isWeekend = (weekday: number) => weekday === 0 || weekday === 6;

// ponytail: clock hours are added to local midnight, so on a DST-change day events land an hour off.
/** Unix seconds at `hours` past local midnight of day i (negative: the evening before), on the minute. */
const at = (ctx: Ctx, i: number, hours: number) => localMidnight(dayOf(ctx, i), ctx.timeZone) + Math.round(hours * 60) * 60;

// ---------------------------------------------------------------------------------------------
// The person, day by day

type Workout = { kind: WorkoutKind; start: number; minutes: number; intensity: number };

/** What the person did on day i: journal behaviours and workouts. */
function behaviour(ctx: Ctx, i: number) {
  const day = dayOf(ctx, i);
  const weekday = weekdayOf(day);
  const weekend = isWeekend(weekday);
  const r = rng(day, "behaviour");
  const tags = Object.fromEntries(DEFAULT_JOURNAL_TAGS.map(({ tag }) => [tag, r.chance(TAG_ODDS[tag])])) as Record<Tag, boolean>;
  if (weekday === 5 || weekday === 6) tags.alcohol ||= r.chance(ALCOHOL_WEEKEND_ODDS);
  if (illnessSeverity(i) > 0) tags.alcohol = false;
  tags.illness = illnessSeverity(i) >= 0.3;
  tags.travel ||= isBandOffDay(i);

  const week = blockWeek(i);
  const keys = plannedWorkouts(i, weekday).filter(() => !r.chance(0.1));
  const workouts: Workout[] = keys.map((key, n) => {
    const kind = WORKOUTS[key];
    // Weekend sessions after the late wake; weekday ones in the evening, or 07:30 for the first of two.
    const hour = weekend ? r.u(9.5, 10) : keys.length > 1 && n === 0 ? r.u(7.4, 7.6) : r.u(18.5, 19.1);
    return {
      kind,
      start: at(ctx, i, hour),
      minutes: Math.round(r.u(...kind.minutes) * (1 + 0.1 * week)),
      intensity: r.u(...kind.intensity) + 0.02 * week,
    };
  });
  /** Training stress felt the next night: minutes above easy effort. */
  const hardness = workouts.reduce((s, w) => s + (w.minutes * Math.max(0, w.intensity - 0.3)) / 20, 0);
  return { weekend, tags, workouts, hardness };
}

type Stage = "awake" | "light" | "deep" | "rem";
type Segment = { start: number; end: number; stage: Stage };

/** ~90-minute cycles: deep early, REM growing later, short wakes between. Alcohol halves early REM. */
function sleepStages(r: Rng, bed: number, wake: number, restless: number, alcohol: boolean): Segment[] {
  const total = Math.round((wake - bed) / 60);
  const finalAwake = Math.round(r.u(1, 6));
  const parts: [Stage, number][] = [];
  let planned = 0;
  const plan = (stage: Stage, minutes: number) => {
    parts.push([stage, minutes]);
    planned += minutes;
  };
  plan("awake", r.u(4, 14) + 10 * restless);
  for (let k = 0; planned < total; k++) {
    const deep = Math.max(0, 34 - 9 * k) * r.u(0.7, 1.2);
    const rem = Math.min(35, 8 + 7 * k) * r.u(0.75, 1.25) * (alcohol && k < 2 ? 0.5 : 1);
    const light = r.u(85, 100) - deep - rem;
    plan("light", light * 0.6);
    plan("deep", deep);
    plan("light", light * 0.4);
    plan("rem", rem);
    if (r.chance(0.35 + 0.4 * restless)) plan("awake", r.u(1, 4) + 6 * restless);
  }
  const segments: Segment[] = [];
  let t = 0;
  const push = (stage: Stage, minutes: number) => {
    if (minutes <= 0) return;
    const last = segments.at(-1);
    if (last?.stage === stage) last.end += minutes * 60;
    else segments.push({ start: bed + t * 60, end: bed + (t + minutes) * 60, stage });
    t += minutes;
  };
  for (const [stage, minutes] of parts) push(stage, Math.min(Math.round(minutes), total - finalAwake - t));
  push("awake", total - t);
  return segments;
}

/** The main sleep ending on the morning of day i, with that night's metrics; null when the band was off. */
function night(ctx: Ctx, i: number) {
  if (isBandOffNight(i)) return null;
  const day = dayOf(ctx, i);
  const r = rng(day, "night");
  const prev = behaviour(ctx, i - 1);
  const alcohol = prev.tags.alcohol;
  const sev = illnessSeverity(i);
  const weekend = isWeekend(weekdayOf(day));

  let bedH = weekend ? r.u(-0.5, 0.4) : r.u(-1.15, -0.55);
  let wakeH = weekend ? r.u(7.9, 8.9) : r.u(6.6, 7.1);
  if (alcohol) bedH += 0.5;
  if (isShortSleep(i)) [bedH, wakeH] = [r.u(0.75, 1.2), r.u(6.25, 6.5)];
  if (sev > 0) [bedH, wakeH] = [r.u(-1.3, -1), r.u(8, 8.4)];
  if (i === SCENARIO.bandOff.untilDay + 1) bedH = Math.max(bedH, r.u(0.25, 0.4));
  const bed = at(ctx, i, bedH);
  const wake = at(ctx, i, wakeH);

  const restless = sev > 0 ? 1 : alcohol ? 0.6 : r.u(0, 0.2);
  const segments = sleepStages(r, bed, wake, restless, alcohol);
  const minutesIn = (stage: Stage) => segments.reduce((n, s) => n + (s.stage === stage ? (s.end - s.start) / 60 : 0), 0);
  const summary = {
    asleepMin: minutesIn("light") + minutesIn("deep") + minutesIn("rem"),
    awakeMin: minutesIn("awake"),
    deepMin: minutesIn("deep"),
    lightMin: minutesIn("light"),
    remMin: minutesIn("rem"),
  };

  // Couplings: short sleep lowers HRV and raises RHR; yesterday's training and alcohol carry into tonight.
  const shortBy = Math.max(0, 7 - summary.asleepMin / 60);
  const trend = progress(i);
  const ill = EFFECTS.illness;
  const hrv = clamp(
    52 *
      (1 + 0.06 * trend) *
      (1 - fatigue(i)) *
      (1 + ill.hrv * sev) *
      (alcohol ? EFFECTS.alcohol.hrv : 1) *
      (prev.tags.meditation ? EFFECTS.meditation.hrv : 1) *
      (1 - 0.02 * prev.hardness) *
      (1 - 0.04 * shortBy) *
      Math.exp(0.15 * r.g()),
    20,
    120,
  );
  const rhr = clamp(
    56 - 1.5 * trend + 20 * fatigue(i) + ill.rhr * sev + (alcohol ? EFFECTS.alcohol.rhr : 0) + 1.2 * shortBy + 0.4 * prev.hardness + 1.2 * r.g(),
    45,
    75,
  );
  const noHrv = i === SCENARIO.noHrvNight;
  const metrics = {
    hrvMs: noHrv ? null : round(hrv, 1),
    hrvDeepMs: noHrv ? null : round(hrv * r.u(1.04, 1.14), 1),
    rhrBpm: Math.round(rhr),
    rhrMethod: "WITH_SLEEP",
    respBpm: round(14.6 + ill.resp * sev + (alcohol ? EFFECTS.alcohol.resp : 0) + 0.25 * r.g(), 1),
    nightlyTempC: hasSkinTemp(i) ? round(34.3 + ill.tempC * sev + (alcohol ? EFFECTS.alcohol.tempC : 0) + 0.12 * r.g(), 2) : null,
    spo2Pct: round(clamp(96.7 + ill.spo2 * sev + 0.5 * r.g(), 90, 99.5), 1),
  };
  return { bed, wake, segments, summary, rhr, metrics };
}

/** An afternoon nap on day i, more likely when ill or short on sleep. Naps carry no stages. */
function nap(ctx: Ctx, i: number) {
  if (isBandOffDay(i)) return null;
  const day = dayOf(ctx, i);
  const r = rng(day, "nap");
  const sev = illnessSeverity(i);
  const odds = sev >= 0.5 ? 0.9 : isShortSleep(i) ? 0.6 : isWeekend(weekdayOf(day)) ? 0.15 : 0.06;
  if (!r.chance(odds)) return null;
  const start = at(ctx, i, r.u(13.5, 15));
  const minutes = Math.round(sev > 0 ? r.u(45, 80) : r.u(20, 40));
  const awakeMin = Math.round(r.u(2, 5));
  return { start, end: start + minutes * 60, asleepMin: minutes - awakeMin, awakeMin };
}

/** Share of heart-rate reserve k minutes into a workout. */
function workoutIntensity(w: Workout, k: number) {
  let a = w.intensity + 0.04 * (k / w.minutes); // cardiac drift
  if (w.kind.intervals && k >= 10 && k < w.minutes - 5) a += (k - 10) % 5 < 3 ? 0.26 : -0.04; // 3 min hard, 2 easy
  if (w.kind.type === "STRENGTH_TRAINING") a += 0.1 * Math.sin((Math.PI * k) / 2); // sets
  return 0.3 + (a - 0.3) * Math.min(1, (k + 1) / 6); // warm-up
}

const HR_CADENCE_S = 15;
const BMR_KCAL = 1700;
/** Sleep HR relative to the night's resting HR, by stage. */
const STAGE_HR: Record<Stage, number> = { awake: 6, light: -2, deep: -4, rem: 1 };
const NO_NIGHT = { hrvMs: null, hrvDeepMs: null, rhrBpm: null, rhrMethod: null, respBpm: null, nightlyTempC: null, spo2Pct: null, vo2maxDaily: null };

/** Everything that happens on local day i, before any "now" cut. Pure: same inputs, same output. */
export function generateDay(ctx: Ctx, i: number) {
  const day = dayOf(ctx, i);
  const start = localMidnight(day, ctx.timeZone);
  const end = localMidnight(addDays(day, 1), ctx.timeZone);
  const n = (end - start) / 60;
  const r = rng(day, "day");
  const b = behaviour(ctx, i);
  const lastNight = night(ctx, i);
  const tonight = night(ctx, i + 1);
  const napToday = nap(ctx, i);
  const sev = illnessSeverity(i);
  const rhr = lastNight?.rhr ?? 56;
  const effort = (a: number) => rhr + a * (ctx.maxHr - rhr);

  // Per minute: target HR, steps, activity kcal, asleep, band worn.
  const target = new Float32Array(n);
  const steps = new Uint8Array(n);
  const kcal = new Float32Array(n);
  const asleep = new Uint8Array(n);
  const worn = new Uint8Array(n).fill(1);
  /** Runs fn for each minute of the day inside [from, to); k is minutes since `from`. */
  const span = (from: number, to: number, fn: (m: number, k: number) => void) => {
    for (let m = Math.max(0, Math.ceil((from - start) / 60)); m < Math.min(n, Math.ceil((to - start) / 60)); m++) {
      fn(m, m - (from - start) / 60);
    }
  };

  // Awake: a daytime lift peaking mid-afternoon, plus pottering steps. Later layers override earlier ones.
  const base = (m: number) =>
    rhr + 13 + 5 * Math.max(0, Math.sin((Math.PI * (m / 60 - 7)) / 15)) + 6 * sev + (isShortSleep(i) ? 3 : 0);
  for (let m = 0; m < n; m++) {
    target[m] = base(m);
    if (r.chance(sev > 0 ? 0.05 : 0.14)) {
      steps[m] = Math.round(r.u(8, 60));
      target[m] += steps[m] * 0.1;
    }
  }
  const walk = (from: number, minutes: number, cadence: number, a: number) =>
    span(from, from + minutes * 60, (m) => {
      steps[m] = Math.round(cadence + r.u(-4, 4));
      target[m] = Math.max(target[m], effort(a));
    });
  const stressed = (from: number, minutes: number, lift: number) =>
    span(from, from + minutes * 60, (m) => {
      steps[m] = 0;
      target[m] = base(m) + lift;
    });
  if (sev === 0 && !b.weekend) {
    walk(at(ctx, i, r.u(8.6, 8.75)), r.u(12, 18), r.u(100, 112), r.u(0.28, 0.34)); // commute
    walk(at(ctx, i, r.u(17.6, 17.8)), r.u(12, 18), r.u(100, 112), r.u(0.28, 0.34));
    // Still, stressed desk time (HR up, no steps): what the Stress Monitor picks up.
    stressed(at(ctx, i, r.u(10, 11.5)), r.u(20, 45), r.u(12, 20));
    if (r.chance(isShortSleep(i) ? 1 : 0.5)) stressed(at(ctx, i, r.u(16, 16.8)), r.u(15, 30), r.u(10, 16));
  }
  // Stairs or a hurry; only a short errand when ill. This is the day's Edwards zone-1 time.
  walk(at(ctx, i, r.u(10, 20)), sev > 0 ? r.u(3, 5) : r.u(6, 12), r.u(112, 124), r.u(0.5, 0.56));

  const exerciseRows = b.workouts.map((w, nth) => {
    const { type, name } = w.kind;
    const cadence = type === "RUNNING" ? r.u(160, 172) : type === "WALKING" ? r.u(108, 120) : 0;
    const endTs = w.start + w.minutes * 60;
    let calories = 0;
    span(w.start, endTs, (m, k) => {
      const a = workoutIntensity(w, k);
      target[m] = effort(a);
      steps[m] = Math.round(cadence ? cadence + r.u(-3, 3) : r.u(0, 12));
      kcal[m] = 3 + 14 * a;
      calories += kcal[m];
    });
    const metresPerMin = { RUNNING: 80 + 125 * w.intensity, BIKING: 250 + 300 * w.intensity, WALKING: 85, STRENGTH_TRAINING: 0 }[type];
    return {
      id: `seed-ex-${day}-${nth}`,
      day,
      startTs: w.start,
      endTs,
      type,
      name,
      calories: Math.round(calories),
      distanceM: metresPerMin ? Math.round(metresPerMin * w.minutes) : null,
      source: "seed",
    };
  });

  const sleepIn = (from: number, to: number, hr: (k: number) => number) =>
    span(from, to, (m, k) => {
      steps[m] = 0;
      kcal[m] = 0;
      asleep[m] = 1;
      target[m] = hr(k);
    });
  if (napToday) sleepIn(napToday.start, napToday.end, () => rhr + 2);
  for (const s of [lastNight, tonight]) {
    for (const g of s?.segments ?? []) {
      // HR settles over the first hour asleep.
      sleepIn(g.start, g.end, (k) => s!.rhr + STAGE_HR[g.stage] + 4 * Math.exp(-((g.start - s!.bed) / 60 + k) / 60));
    }
  }

  if (isBandOffDay(i)) {
    const { bandOff } = SCENARIO;
    const from = i === bandOff.day ? at(ctx, i, bandOff.hour) : start;
    span(from, i === bandOff.untilDay ? at(ctx, i, bandOff.untilHour) : end, (m) => {
      worn[m] = 0;
      steps[m] = 0;
    });
  }
  for (let m = 0; m < n; m++) {
    if (!kcal[m]) kcal[m] = steps[m] * 0.04;
    target[m] += (asleep[m] ? 0.7 : 1.5) * r.g();
  }

  // HR every 15 s: eases toward the minute's target (fast up, slower down, which gives the
  // post-workout recovery curve), plus sample noise. 0 marks "not worn".
  const bpm = new Uint8Array((n * 60) / HR_CADENCE_S);
  const rise = 1 - Math.exp(-HR_CADENCE_S / 30);
  const fall = 1 - Math.exp(-HR_CADENCE_S / 130);
  let hr = target[0];
  for (let s = 0; s < bpm.length; s++) {
    const m = Math.floor((s * HR_CADENCE_S) / 60);
    if (!worn[m]) {
      hr = target[m];
      continue;
    }
    hr += (target[m] - hr) * (target[m] > hr ? rise : fall);
    bpm[s] = Math.round(clamp(hr + r.g(), 38, ctx.maxHr));
  }

  const sleeps = [];
  if (lastNight) {
    const id = `seed-sleep-${day}`;
    sleeps.push({
      availableAt: lastNight.wake + SLEEP_SYNC_DELAY_S,
      row: { id, day, startTs: lastNight.bed, endTs: lastNight.wake, isMain: true, processed: true, stagesStatus: "SUCCEEDED", ...lastNight.summary, source: "seed" },
      segments: lastNight.segments.map((g) => ({ sessionId: id, startTs: g.start, endTs: g.end, stage: g.stage })),
    });
  }
  if (napToday) {
    const { start: startTs, end: endTs, asleepMin, awakeMin } = napToday;
    sleeps.push({
      availableAt: endTs,
      row: { id: `seed-nap-${day}`, day, startTs, endTs, isMain: false, processed: true, stagesStatus: null, asleepMin, awakeMin, source: "seed" },
      segments: [],
    });
  }

  const vo2 = 43 + 2.2 * progress(i) + (i > SCENARIO.trainingBlock.end ? 0.6 : 0);
  const run = exerciseRows.findLast((e) => e.type === "RUNNING");
  const weighAt = (lastNight?.wake ?? at(ctx, i, 7.5)) + 20 * 60;
  return {
    day,
    start,
    end,
    /** One reading per 15 s from `start`; 0 = band not worn. */
    bpm,
    /** Per minute from `start`. */
    steps,
    kcal,
    worn: worn.includes(1),
    sleeps,
    exercises: exerciseRows,
    nightly: lastNight && {
      availableAt: lastNight.wake + SLEEP_SYNC_DELAY_S,
      // Weekly, like Fitbit's resting-HR-based estimate.
      values: { ...lastNight.metrics, vo2maxDaily: i % 7 === 6 ? round(vo2 - 0.8 + 0.3 * r.g(), 1) : null },
    },
    runVo2: run && { at: run.endTs, value: round(vo2 + 0.4 * r.g(), 1) },
    weighIn: i % 30 === 2 && {
      at: weighAt,
      values: { weightKg: round(78.6 - 1.6 * progress(i) + 0.25 * r.g(), 1), bodyFatPct: round(21.5 - 1.6 * progress(i) + 0.3 * r.g(), 1) },
    },
    /** Written once the day is over; null on a missed check-in. */
    journal: r.chance(MISSED_CHECK_IN_ODDS) ? null : b.tags,
  };
}

type Day = ReturnType<typeof generateDay>;

// ---------------------------------------------------------------------------------------------
// Writing

/** The day's daily_metrics row as of `now`: today's steps and calories are running totals. */
function metricsAt(g: Day, now: number): typeof dailyMetrics.$inferInsert {
  const minutesDone = Math.min(g.steps.length, Math.floor((now - g.start) / 60));
  let steps = 0;
  let kcal = 0;
  for (let m = 0; m < minutesDone; m++) {
    steps += g.steps[m];
    kcal += g.kcal[m];
  }
  const night = g.nightly && g.nightly.availableAt <= now ? g.nightly.values : NO_NIGHT;
  return {
    day: g.day,
    ...night,
    nightlyTempC: g.nightly && g.nightly.availableAt + SKIN_TEMP_LAG_S <= now ? night.nightlyTempC : null,
    vo2maxRun: g.runVo2 && g.runVo2.at <= now ? g.runVo2.value : null,
    steps: g.worn ? steps : null,
    calories: Math.round(BMR_KCAL * Math.min(1, (now - g.start) / (g.end - g.start)) + kcal),
    ...(g.weighIn && g.weighIn.at <= now ? g.weighIn.values : { weightKg: null, bodyFatPct: null }),
    source: "seed",
  };
}

const metricColumns = Object.entries(getTableColumns(dailyMetrics)).filter(([key]) => key !== "day");
const excludedMetrics = Object.fromEntries(metricColumns.map(([key, c]) => [key, sql.raw(`excluded.${c.name}`)]));
/** Update only when a value differs, so regenerating an unchanged day reports no change. */
const metricsDiffer = sql.raw(
  `(${metricColumns.map(([, c]) => c.name)}) is not (${metricColumns.map(([, c]) => `excluded.${c.name}`)})`,
);

/** Inserts what has happened on day g by `now`. Returns the number of rows written. */
function writeDay(db: Db, g: Day, now: number) {
  const insertHr = db.$client.prepare("insert or ignore into hr_samples (ts, bpm) values (?, ?)");
  const insertSteps = db.$client.prepare("insert or ignore into steps_minutes (ts, steps) values (?, ?)");
  let intraday = 0;
  for (let s = 0; s < g.bpm.length && g.start + s * HR_CADENCE_S < now; s++) {
    if (g.bpm[s]) intraday += insertHr.run(g.start + s * HR_CADENCE_S, g.bpm[s]).changes;
  }
  for (let m = 0; m < g.steps.length && g.start + (m + 1) * 60 <= now; m++) {
    if (g.steps[m]) intraday += insertSteps.run(g.start + m * 60, g.steps[m]).changes;
  }
  if (intraday) db.insert(intradayDirty).values({ day: g.day }).onConflictDoNothing().run();

  let other = 0;
  for (const s of g.sleeps.filter((s) => s.availableAt <= now)) {
    other += db.insert(sleepSessions).values(s.row).onConflictDoNothing().run().changes;
    if (s.segments.length) other += db.insert(sleepSegments).values(s.segments).onConflictDoNothing().run().changes;
  }
  const done = g.exercises.filter((e) => e.endTs <= now);
  if (done.length) other += db.insert(exercises).values(done).onConflictDoNothing().run().changes;
  other += db
    .insert(dailyMetrics)
    .values(metricsAt(g, now))
    .onConflictDoUpdate({ target: dailyMetrics.day, set: excludedMetrics, setWhere: metricsDiffer })
    .run().changes;
  // Never touch a day the user already checked in for.
  if (g.journal && now >= g.end && !db.select().from(journalEntries).where(eq(journalEntries.day, g.day)).get()) {
    const rows = Object.entries(g.journal).map(([tag, yes]) => ({ day: g.day, tag, value: Number(yes) }));
    other += db.insert(journalEntries).values(rows).run().changes;
  }
  return intraday + other;
}

export type SeedOptions = { /** Unix seconds. */ now: number; timeZone: string; maxHr: number };

/**
 * Fills the demo database up to `now`: a fresh database gets SEED_DAYS days ending today, later
 * pulls regenerate from the last sync's day onwards. Marks days with new HR or steps intraday_dirty.
 */
export function seedPull(db: Db, { now, timeZone, maxHr }: SeedOptions): { changed: boolean } {
  return db.$client.transaction(() => {
    const synced = db.select().from(syncState).where(eq(syncState.type, "seed")).get()?.syncedThrough ?? null;
    if (synced !== null && now <= synced) return { changed: false };
    const today = localDay(now, timeZone);
    const first = db.select({ day: min(dailyMetrics.day) }).from(dailyMetrics).where(eq(dailyMetrics.source, "seed")).get()?.day;
    const ctx: Ctx = { anchor: first ?? addDays(today, 1 - SEED_DAYS), timeZone, maxHr };

    let changes = ensureDefaultTags(db);
    const from = synced === null ? 0 : Math.max(0, daysBetween(ctx.anchor, localDay(synced, timeZone)));
    for (let i = from; i <= daysBetween(ctx.anchor, today); i++) changes += writeDay(db, generateDay(ctx, i), now);

    const state = { syncedThrough: now, lastAttemptAt: now, lastSuccessAt: now, lastError: null };
    db.insert(syncState).values({ type: "seed", ...state }).onConflictDoUpdate({ target: syncState.type, set: state }).run();
    return { changed: changes > 0 };
  })();
}

export const seedSource: Source = {
  pull: async () => {
    const { timeZone, profile } = getConfig();
    return seedPull(getDb(), { now: Math.floor(Date.now() / 1000), timeZone, maxHr: profile.maxHr });
  },
};
