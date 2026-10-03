// Pure mappers: Google Health API v4 data points -> rows for the normalized tables. No I/O.
// Shapes from Hælan's probe/findings/field-map.md and its api/map*.ts (AGPL-3.0); see
// docs/data-notes.md. Unconfirmed on the Fitbit Air.
//
// int64 fields arrive as JSON strings, and proto3 omits zero, false and empty fields, so every
// read goes through num/str and treats "absent" as "unknown", never as zero.
import type { dailyMetrics, exercises, sleepSessions } from "../../db/schema";
import type { DataTypeId } from "./catalogue";
import { localDay } from "../../time";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Own-property path lookup: the objects come from Google, so "constructor" must not walk the prototype. */
function at(v: unknown, path: string): unknown {
  for (const k of path.split(".")) {
    if (!isObj(v) || !Object.hasOwn(v, k)) return undefined;
    v = v[k];
  }
  return v;
}

/** A number, or an int64 sent as a string. */
function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
const int = (v: unknown) => (num(v) === null ? null : Math.round(num(v)!));
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const per = (v: number | null, d: number) => (v === null ? null : v / d);

/** Unix seconds of an RFC 3339 instant. */
function secs(v: unknown): number | null {
  const ms = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** `YYYY-MM-DD` from a civil `{year, month, day}` (numbers, or numeric strings). */
function civil(v: unknown): string | null {
  const [y, m, d] = ["year", "month", "day"].map((k) => num(at(v, k)));
  if (y === null || m === null || d === null) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The body key of a type: `daily-resting-heart-rate` -> `dailyRestingHeartRate`. */
const bodyKey = (type: DataTypeId) => type.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

const platform = (p: unknown) => str(at(p, "dataSource.platform"));

// --- Daily rows -----------------------------------------------------------------------------------

export type DailyValues = Partial<Omit<typeof dailyMetrics.$inferInsert, "day" | "source">>;
export type DailyRow = { day: string } & DailyValues;

/** Payload object -> daily_metrics columns, per list type. Civil-date types keep Google's day as-is. */
const DAILY = {
  "daily-heart-rate-variability": (o: Obj): DailyValues => ({
    // The average is what Recovery's baseline uses; the deep-sleep RMSSD is stored beside it, never mixed in.
    hrvMs: num(o.averageHeartRateVariabilityMilliseconds),
    hrvDeepMs: num(o.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds),
  }),
  "daily-resting-heart-rate": (o: Obj): DailyValues => ({
    rhrBpm: num(o.beatsPerMinute),
    rhrMethod: str(at(o, "dailyRestingHeartRateMetadata.calculationMethod")),
  }),
  "daily-respiratory-rate": (o: Obj): DailyValues => ({ respBpm: num(o.breathsPerMinute) }),
  // Raw nightly figure. The deviation is computed in the pipeline against our own causal baseline,
  // not Google's baselineTemperatureCelsius (a 30-day window that may include the night itself).
  "daily-sleep-temperature-derivations": (o: Obj): DailyValues => ({ nightlyTempC: num(o.nightlyTemperatureCelsius) }),
  "daily-oxygen-saturation": (o: Obj): DailyValues => ({ spo2Pct: num(o.averagePercentage) }),
  "daily-vo2-max": (o: Obj): DailyValues => ({ vo2maxDaily: num(o.vo2Max) }),
  // Sample types: the latest reading of the local day.
  "run-vo2-max": (o: Obj): DailyValues => ({ vo2maxRun: num(o.runVo2Max) }),
  weight: (o: Obj): DailyValues => ({ weightKg: per(num(o.weightGrams), 1000) }),
  "body-fat": (o: Obj): DailyValues => ({ bodyFatPct: num(o.percentage) }),
} satisfies Partial<Record<DataTypeId, (o: Obj) => DailyValues>>;

export type DailyType = keyof typeof DAILY;
export const DAILY_TYPES = Object.keys(DAILY) as DailyType[];

/** One row per local day. A `date` type uses its civil date; a sample type its sample's local day, latest wins. */
export function mapDaily(type: DailyType, points: unknown[], tz: string): DailyRow[] {
  const key = bodyKey(type);
  const byDay = new Map<string, { t: number; row: DailyRow }>();
  for (const p of points) {
    const o = at(p, key);
    if (!isObj(o)) continue;
    const t = secs(at(o, "sampleTime.physicalTime"));
    const day = civil(o.date) ?? (t === null ? null : localDay(t, tz));
    if (!day) continue;
    const prev = byDay.get(day);
    if (!prev || (t ?? 0) >= prev.t) byDay.set(day, { t: t ?? 0, row: { day, ...DAILY[type](o) } });
  }
  return [...byDay.values()].map((x) => x.row);
}

/** `dailyRollUp` points -> daily totals. Google merges sources server-side and omits days with no data. */
const ROLLUP = {
  // Value path unobserved (Hælan saw floors.countSum, an int64 string); confirm on Fitbit Air.
  steps: (o: Obj): DailyValues => ({ steps: int(o.countSum) }),
  "total-calories": (o: Obj): DailyValues => ({ calories: num(o.kcalSum) }),
} satisfies Partial<Record<DataTypeId, (o: Obj) => DailyValues>>;

export type RollupType = keyof typeof ROLLUP;

/** Points whose value is missing are skipped, so a renamed value path writes nothing rather than nulls. */
export function mapRollup(type: RollupType, points: unknown[]): DailyRow[] {
  const out: DailyRow[] = [];
  for (const p of points) {
    const day = civil(at(p, "civilStartTime.date"));
    const o = at(p, bodyKey(type));
    if (!day || !isObj(o)) continue;
    const values = ROLLUP[type](o);
    if (Object.values(values).every((v) => v === null)) continue;
    out.push({ day, ...values });
  }
  return out;
}

// --- Intraday -------------------------------------------------------------------------------------

/**
 * Band heart rate, unix second -> bpm. HEALTH_CONNECT carries phone and third-party apps, so it is
 * dropped: hr_samples is the band's alone. A repeated second keeps the last point.
 */
export function mapHeartRate(points: unknown[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of points) {
    if (platform(p) === "HEALTH_CONNECT") continue;
    const ts = secs(at(p, "heartRate.sampleTime.physicalTime"));
    const bpm = int(at(p, "heartRate.beatsPerMinute"));
    if (ts !== null && bpm !== null && bpm > 0) out.set(ts, bpm);
  }
  return out;
}

/**
 * Steps per minute (minute-start unix second -> count), the maximum across sources: summing would
 * double-count a walk both the band and the phone saw. Only used for movement gating; daily totals
 * come from dailyRollUp. An interval longer than a minute is spread evenly over the minutes it touches.
 */
export function mapStepsMinutes(points: unknown[]): Map<number, number> {
  const bySource = new Map<string, Map<number, number>>();
  for (const p of points) {
    const start = secs(at(p, "steps.interval.startTime"));
    const end = secs(at(p, "steps.interval.endTime"));
    const n = int(at(p, "steps.count"));
    if (start === null || end === null || n === null || n <= 0 || end < start) continue;
    const source = [platform(p), at(p, "dataSource.device.displayName"), at(p, "dataSource.application.packageName")].join("|");
    const mine = bySource.get(source) ?? bySource.set(source, new Map()).get(source)!;
    const first = Math.floor(start / 60);
    const minutes = Math.max(1, Math.ceil(end / 60) - first);
    for (let i = 0; i < minutes; i++) {
      const share = Math.floor((n * (i + 1)) / minutes) - Math.floor((n * i) / minutes);
      const ts = (first + i) * 60;
      mine.set(ts, (mine.get(ts) ?? 0) + share);
    }
  }
  const out = new Map<number, number>();
  for (const mine of bySource.values()) {
    for (const [ts, n] of mine) out.set(ts, Math.max(out.get(ts) ?? 0, n));
  }
  return out;
}

// --- Sessions -------------------------------------------------------------------------------------

/** noop's lowercase stage vocabulary, which src/core/scoring expects. */
export type Stage = "awake" | "light" | "deep" | "rem";
const STAGES: Record<string, Stage> = { AWAKE: "awake", LIGHT: "light", DEEP: "deep", REM: "rem" };

export type SessionRow = typeof sleepSessions.$inferInsert;
export type SegmentRow = { sessionId: string; startTs: number; endTs: number; stage: Stage };
export type ExerciseRow = typeof exercises.$inferInsert;

/** A point's stable id: its resource name, which survives a re-fetch, else type and start. */
const pointId = (p: unknown, kind: string, start: number) => str(at(p, "name")) ?? `${kind}-${start}`;

const duration = (s: SessionRow) => s.endTs - s.startTs;
/** Longest first, then earliest, then id: deterministic whatever order the API returned. */
const longest = (xs: SessionRow[]) =>
  [...xs].sort((a, b) => duration(b) - duration(a) || a.startTs - b.startTs || a.id.localeCompare(b.id))[0];

/**
 * Sleep sessions, each on its local wake day, and their stage segments.
 *
 * `is_main`: one session per wake day at most. Sessions flagged `metadata.mainSleep` win, even when
 * shorter. A day where no session carries the flag at all falls back to its longest session. proto3
 * omits `false`, so a nap next to a flagged night reads as unflagged and loses; a day whose only
 * flags are an explicit `false` has no main sleep.
 *
 * Segments only for `stagesStatus` SUCCEEDED with a recognised stage list; any other session keeps
 * its summary minutes and gets no hypnogram.
 */
export function mapSleep(points: unknown[], tz: string): { sessions: SessionRow[]; segments: SegmentRow[] } {
  const sessions = new Map<string, { row: SessionRow; flag: unknown }>();
  const segments = new Map<string, SegmentRow[]>();
  for (const p of points) {
    const o = at(p, "sleep");
    const start = secs(at(o, "interval.startTime"));
    const end = secs(at(o, "interval.endTime"));
    if (!isObj(o) || start === null || end === null || end <= start) continue;
    const id = pointId(p, "sleep", start);
    const stagesStatus = str(at(o, "metadata.stagesStatus"));
    const summary = at(o, "summary.stagesSummary");
    const minutesIn = (type: string) => {
      const s = Array.isArray(summary) ? summary.find((x) => at(x, "type") === type) : undefined;
      return s === undefined ? null : int(at(s, "minutes"));
    };
    sessions.set(id, {
      flag: at(o, "metadata.mainSleep"),
      row: {
        id,
        day: localDay(end, tz),
        startTs: start,
        endTs: end,
        isMain: false,
        processed: at(o, "metadata.processed") === true,
        stagesStatus,
        asleepMin: int(at(o, "summary.minutesAsleep")),
        awakeMin: int(at(o, "summary.minutesAwake")),
        deepMin: minutesIn("DEEP"),
        lightMin: minutesIn("LIGHT"),
        remMin: minutesIn("REM"),
        source: platform(p) ?? "google",
      },
    });

    const stages = at(o, "stages");
    const segs = new Map<number, SegmentRow>(); // by start: the segment primary key
    if (stagesStatus === "SUCCEEDED" && Array.isArray(stages)) {
      for (const s of stages) {
        const sStart = secs(at(s, "startTime"));
        const sEnd = secs(at(s, "endTime"));
        const stage = STAGES[String(at(s, "type"))];
        if (!stage || sStart === null || sEnd === null) {
          segs.clear(); // a stage we can't read makes the whole hypnogram suspect
          break;
        }
        if (sEnd > sStart) segs.set(sStart, { sessionId: id, startTs: sStart, endTs: sEnd, stage });
      }
    }
    segments.set(id, [...segs.values()].sort((a, b) => a.startTs - b.startTs));
  }

  const byDay = new Map<string, { row: SessionRow; flag: unknown }[]>();
  for (const s of sessions.values()) byDay.set(s.row.day, [...(byDay.get(s.row.day) ?? []), s]);
  for (const day of byDay.values()) {
    const flagged = day.filter((s) => s.flag === true).map((s) => s.row);
    const unflagged = day.every((s) => typeof s.flag !== "boolean");
    const main = flagged.length ? longest(flagged) : unflagged ? longest(day.map((s) => s.row)) : undefined;
    if (main) main.isMain = true;
  }
  return { sessions: [...sessions.values()].map((s) => s.row), segments: [...segments.values()].flat() };
}

/** Exercises on their local start day. */
export function mapExercises(points: unknown[], tz: string): ExerciseRow[] {
  const out = new Map<string, ExerciseRow>();
  for (const p of points) {
    const o = at(p, "exercise");
    const start = secs(at(o, "interval.startTime"));
    const end = secs(at(o, "interval.endTime"));
    if (!isObj(o) || start === null || end === null || end < start) continue;
    const id = pointId(p, "exercise", start);
    out.set(id, {
      id,
      day: localDay(start, tz),
      startTs: start,
      endTs: end,
      type: str(o.exerciseType) ?? "UNSPECIFIED",
      name: str(o.displayName),
      calories: num(at(o, "metricsSummary.caloriesKcal")),
      distanceM: per(num(at(o, "metricsSummary.distanceMillimeters")), 1000),
      source: platform(p) ?? "google",
    });
  }
  return [...out.values()];
}
