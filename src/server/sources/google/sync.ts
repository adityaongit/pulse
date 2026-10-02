// Google source (U4): per type, a 180-day first backfill walked oldest first with "N of 180 days"
// progress in sync_state, then a trailing re-fetch every run. Writes are upserts that only touch a
// row whose values differ, so an unchanged re-fetch is a no-op, `changed` is honest, and only days
// whose intraday inputs actually changed land in intraday_dirty.
//
// Each type runs on its own: a failure records the GoogleError's safe message (status and code,
// never a body or token) in its sync_state row and the next type carries on. A chunk's rows and its
// cursor commit in one transaction, so an interrupted backfill resumes where it stopped.
import type { Statement } from "better-sqlite3";
import { eq, getTableColumns, getTableName } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { getConfig } from "../../config";
import { type Db, getDb } from "../../db";
import { dailyMetrics, exercises, oauthTokens, sleepSessions, syncState } from "../../db/schema";
import type { Source } from "../types";
import { DATA_TYPES, type DataTypeId } from "./catalogue";
import { addDays, type ClientDeps, createGoogleClient, localDay, localMidnight, localWindows, type TimeWindow } from "./client";
import {
  DAILY_TYPES,
  type DailyRow,
  mapDaily,
  mapExercises,
  mapHeartRate,
  mapRollup,
  mapSleep,
  mapStepsMinutes,
  type RollupType,
  type SegmentRow,
} from "./map";
import { GoogleError } from "./oauth";

export const BACKFILL_DAYS = 180;
/** daily-*, sleep, exercise, sample types and rollups re-fetch this many local days before synced_through. */
const OVERLAP_DAYS = 3;
/** heart-rate and steps re-fetch from synced_through minus this. */
const INTRADAY_OVERLAP_S = 3600;

type Job =
  | { key: string; kind: "daily"; type: (typeof DAILY_TYPES)[number] }
  | { key: string; kind: "rollup"; type: RollupType }
  | { key: string; kind: "sleep" | "exercise" | "hr" | "steps"; type: DataTypeId };

/** Cheap types first, so a first connect shows daily data long before heart rate (~1,300 requests) is done. */
const JOBS: Job[] = [
  ...DAILY_TYPES.map((type) => ({ key: type, kind: "daily" as const, type })),
  { key: "sleep", kind: "sleep", type: "sleep" },
  { key: "exercise", kind: "exercise", type: "exercise" },
  { key: "total-calories", kind: "rollup", type: "total-calories" },
  { key: "steps-daily", kind: "rollup", type: "steps" }, // daily totals; "steps" below is per minute
  { key: "steps", kind: "steps", type: "steps" },
  { key: "heart-rate", kind: "hr", type: "heart-rate" },
];

export type SyncDeps = ClientDeps & { log?: Pick<Console, "error"> };

export function createGoogleSource(deps: SyncDeps): Source {
  const { db, timeZone: tz, now = Date.now, log = console } = deps;
  const nowS = () => Math.floor(now() / 1000);

  const setState = (key: string, patch: Partial<typeof syncState.$inferInsert>) =>
    db.insert(syncState).values({ type: key, ...patch }).onConflictDoUpdate({ target: syncState.type, set: patch }).run();

  return {
    async pull() {
      if (!db.select().from(oauthTokens).get()) return { changed: false }; // not connected yet
      const client = createGoogleClient(deps); // one per run: it holds the rate limiter
      const w = writer(db, tz);
      const run = { changed: false };

      for (const job of JOBS) {
        setState(job.key, { lastAttemptAt: nowS() });
        try {
          await syncJob(job);
          setState(job.key, { lastSuccessAt: nowS(), lastError: null });
        } catch (err) {
          const safe = err instanceof GoogleError ? err.message : `[sync] ${job.key}: internal error`;
          setState(job.key, { lastError: safe });
          log.error(err instanceof GoogleError ? safe : `[sync] ${job.key} failed: ${(err as Error)?.stack ?? err}`);
        }
      }
      return { changed: run.changed };

      async function syncJob(job: Job) {
        const st = db.select().from(syncState).where(eq(syncState.type, job.key)).get();
        const t = nowS();
        const today = localDay(t, tz);
        const fresh = st?.syncedThrough == null;
        const backfilling = fresh || (st.backfillDaysDone ?? 0) < (st.backfillDaysTotal ?? BACKFILL_DAYS);
        let done = fresh ? 0 : (st.backfillDaysDone ?? 0);

        let from: number;
        if (fresh) {
          from = localMidnight(addDays(today, 1 - BACKFILL_DAYS), tz); // today is day 180
          setState(job.key, { backfillDaysDone: 0, backfillDaysTotal: BACKFILL_DAYS });
        } else if (backfilling) {
          from = st.syncedThrough!; // the last committed chunk's end
        } else {
          const through = st.syncedThrough!;
          from = localMidnight(addDays(localDay(through, tz), -OVERLAP_DAYS), tz);
          if (job.kind === "hr" || job.kind === "steps") {
            // From the last sample too, not just the cursor, so a band that uploads hours late is not
            // lost behind a 1-hour overlap.
            // ponytail: a band silent for more than OVERLAP_DAYS loses the older part; widen if seen.
            const last = w.lastSample(job.kind) ?? Infinity;
            from = Math.max(from, minute(Math.min(through, last + 1) - INTRADAY_OVERLAP_S));
          }
        }

        // heart-rate one local day at a time: list() holds the whole range in memory (~37k points/day).
        const chunkDays = job.kind === "hr" ? 1 : DATA_TYPES[job.type].maxDays;
        for (const win of localWindows(from, t, chunkDays, tz)) {
          const points =
            job.kind === "rollup"
              ? await client.dailyRollUp(job.type, localDay(win.start, tz), dayAfter(win.end, tz))
              : await client.list(job.type, win.start, win.end);
          db.$client.transaction(() => {
            if (w.write(job, points)) run.changed = true;
            if (backfilling) done = Math.min(BACKFILL_DAYS, done + daysIn(win, tz));
            setState(job.key, { syncedThrough: win.end, ...(backfilling && { backfillDaysDone: done }) });
          })();
        }
        if (backfilling) setState(job.key, { syncedThrough: t, backfillDaysDone: BACKFILL_DAYS });
      }
    },
  };
}

/** The app's source: config and database from the environment, one client per pull. */
export const googleSource: Source = {
  pull() {
    const cfg = getConfig();
    if (!cfg.google) return Promise.resolve({ changed: false });
    return createGoogleSource({ db: getDb(), google: cfg.google, timeZone: cfg.timeZone }).pull();
  },
};

const minute = (s: number) => Math.floor(s / 60) * 60;

/** The exclusive civil end day for a window ending at `end`: the day after, unless `end` is a local midnight. */
const dayAfter = (end: number, tz: string) =>
  localMidnight(localDay(end, tz), tz) === end ? localDay(end, tz) : addDays(localDay(end, tz), 1);

/** Local days a window touches. */
const daysIn = (w: TimeWindow, tz: string) =>
  Math.round((Date.parse(localDay(w.end - 1, tz)) - Date.parse(localDay(w.start, tz))) / 86_400_000) + 1;

// --- Writes ---------------------------------------------------------------------------------------

function writer(db: Db, tz: string) {
  const c = db.$client;
  const stmts = new Map<string, Statement>();
  const prep = (q: string) => stmts.get(q) ?? stmts.set(q, c.prepare(q)).get(q)!;

  // Local midnight sits on a UTC quarter hour in every zone, so one lookup per 15 minutes is exact.
  const days = new Map<number, string>();
  const dayOf = (ts: number) => {
    const q = Math.floor(ts / 900);
    return days.get(q) ?? days.set(q, localDay(q * 900, tz)).get(q)!;
  };

  /** Inserts a row, or updates it when any value differs. True when a row was written. */
  function upsert(table: SQLiteTable, key: string, row: Record<string, unknown>): boolean {
    const cols = getTableColumns(table);
    const names = Object.keys(row).map((k) => `"${cols[k].name}"`);
    const set = names.filter((n) => n !== `"${key}"`);
    const q =
      `INSERT INTO "${getTableName(table)}" (${names}) VALUES (${names.map(() => "?")}) ` +
      `ON CONFLICT ("${key}") DO UPDATE SET ${set.map((n) => `${n} = excluded.${n}`)} ` +
      `WHERE ${set.map((n) => `${n} IS NOT excluded.${n}`).join(" OR ")}`;
    const values = Object.values(row).map((v) => (typeof v === "boolean" ? Number(v) : (v ?? null)));
    return prep(q).run(values).changes > 0;
  }

  const dailyRows = (rows: DailyRow[]) =>
    rows.map((r) => upsert(dailyMetrics, "day", { ...r, source: "google" })).includes(true);

  /** Replaces a session's segments when they differ. */
  function segments(sessionId: string, next: SegmentRow[]): boolean {
    const old = prep("SELECT start_ts, end_ts, stage FROM sleep_segments WHERE session_id = ? ORDER BY start_ts").all(sessionId);
    const rows = next.map((s) => ({ start_ts: s.startTs, end_ts: s.endTs, stage: s.stage }));
    if (JSON.stringify(old) === JSON.stringify(rows)) return false;
    prep("DELETE FROM sleep_segments WHERE session_id = ?").run(sessionId);
    const ins = prep("INSERT INTO sleep_segments (session_id, start_ts, end_ts, stage) VALUES (?, ?, ?, ?)");
    for (const r of rows) ins.run(sessionId, r.start_ts, r.end_ts, r.stage);
    return true;
  }

  /** Writes a batch of points for a job; marks changed days dirty. True when anything changed. */
  function write(job: Job, points: unknown[]): boolean {
    const dirty = new Set<string>();
    let changed = false;
    switch (job.kind) {
      case "daily":
        changed = dailyRows(mapDaily(job.type, points, tz));
        break;
      case "rollup":
        changed = dailyRows(mapRollup(job.type, points));
        break;
      case "hr": {
        const q = prep("INSERT INTO hr_samples (ts, bpm) VALUES (?, ?) ON CONFLICT (ts) DO UPDATE SET bpm = excluded.bpm WHERE bpm IS NOT excluded.bpm");
        for (const [ts, bpm] of mapHeartRate(points)) if (q.run(ts, bpm).changes) dirty.add(dayOf(ts));
        break;
      }
      case "steps": {
        // Max with the stored minute too: a multi-minute interval that starts before the re-fetch
        // window must not shrink the minutes it spills into.
        const q = prep("INSERT INTO steps_minutes (ts, steps) VALUES (?, ?) ON CONFLICT (ts) DO UPDATE SET steps = excluded.steps WHERE excluded.steps > steps");
        for (const [ts, n] of mapStepsMinutes(points)) if (q.run(ts, n).changes) dirty.add(dayOf(ts));
        break;
      }
      // Sessions feed stage 1 too (session resting HR, per-activity strain), so a changed one marks its day.
      case "sleep": {
        const { sessions, segments: segs } = mapSleep(points, tz);
        for (const s of sessions) {
          const a = upsert(sleepSessions, "id", s);
          const b = segments(s.id, segs.filter((g) => g.sessionId === s.id));
          if (a || b) dirty.add(s.day);
        }
        break;
      }
      case "exercise":
        for (const e of mapExercises(points, tz)) if (upsert(exercises, "id", e)) dirty.add(e.day);
        break;
    }
    const mark = prep("INSERT INTO intraday_dirty (day) VALUES (?) ON CONFLICT DO NOTHING");
    for (const d of dirty) mark.run(d);
    return changed || dirty.size > 0;
  }

  /** The newest stored intraday sample, unix seconds. */
  const lastSample = (kind: "hr" | "steps") =>
    (prep(`SELECT max(ts) AS t FROM ${kind === "hr" ? "hr_samples" : "steps_minutes"}`).get() as { t: number | null }).t;

  return { write, lastSample };
}
