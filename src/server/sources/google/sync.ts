// Google source (U4): per type, a 180-day first backfill walked oldest first with "N of 180 days"
// progress in sync_state, then a trailing re-fetch every run. Writes are upserts that only touch a
// row whose values differ, so an unchanged re-fetch is a no-op, `changed` is honest, and only days
// whose intraday inputs actually changed land in intraday_dirty.
//
// Deletions: `list` returns a window whole or throws, so within a list window we hold exactly what
// Google returns. A sleep session, exercise or band HR sample there that Google left out was deleted
// in Fitbit; it is removed and its day marked dirty. Rows outside the window are never touched.
// This assumes Google omits deleted points; a tombstone shape would need a filter in map.ts.
//
// Each type runs on its own: a failure records the GoogleError's safe message (status and code,
// never a body or token) in its sync_state row and the next type carries on. A chunk's rows and its
// cursor commit in one transaction, so an interrupted backfill resumes where it stopped.
import { and, eq, getTableColumns, getTableName, gte, inArray, lt, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { getConfig } from "../../config";
import { type Db, getDb, row } from "../../db";
import { dailyMetrics, dailyValues, exercises, healthRecords, hrDays, intradayDirty, oauthTokens, sleepSegments, sleepSessions, stepsDays, syncState } from "../../db/schema";
import { LOG_DAYS } from "@/lib/log";
import { importEntries, pruneEntries } from "../../log";
import { getProfile } from "../../profile";
import { mergeSamples } from "../../samples";
import type { Source } from "../types";
import { DATA_TYPES, type DataTypeId } from "./catalogue";
import { addDays, localDay, localMidnight } from "../../time";
import { type ClientDeps, createGoogleClient, localWindows, pruneRawPayloads, type TimeWindow } from "./client";
import {
  DAILY_TYPES,
  type DailyRow,
  EXTRA_TYPES,
  type ExtraType,
  mapDaily,
  mapExercises,
  mapExtra,
  mapHeartRate,
  mapHeight,
  mapLogEntries,
  mapRecords,
  mapRollup,
  mapSleep,
  mapStepsMinutes,
  type ReadableLogType,
  type RollupType,
  type SegmentRow,
} from "./map";
import { GoogleError } from "./oauth";

export const BACKFILL_DAYS = 180;
/** The sync_state row for the paired-device check; its lastError holds NO_PAIRED_DEVICE while the account has none. */
export const DEVICES_KEY = "paired-devices";
export const NO_DEVICE_ERROR = `[google] ${DEVICES_KEY}: NO_PAIRED_DEVICE`;
/** daily-*, sleep, exercise, sample types and rollups re-fetch this many local days before synced_through. */
const OVERLAP_DAYS = 3;
/**
 * Sleep and exercise re-fetch further back: a session deleted in Google Health is only pruned when its window is
 * listed again, and people delete a stray workout or nap days later. A few pages of 25 sessions each run.
 * ponytail: older deletions stay; widen toward BACKFILL_DAYS if that is seen.
 */
const SESSION_OVERLAP_DAYS = 30;
/** heart-rate and steps re-fetch from synced_through minus this. */
const INTRADAY_OVERLAP_S = 3600;
/** The live heart-rate pull re-fetches from the newest stored sample minus this. */
export const LIVE_OVERLAP_S = 600;

type Job =
  | { key: string; kind: "daily"; type: (typeof DAILY_TYPES)[number] }
  | { key: string; kind: "rollup"; type: RollupType }
  | { key: string; kind: "extra"; type: ExtraType }
  | { key: string; kind: "records"; type: "electrocardiogram" | "irregular-rhythm-notification" }
  | { key: string; kind: "sleep" | "exercise" | "hr" | "steps" | "height"; type: DataTypeId };

/** Shown-only extras (src/lib/extraMetrics.ts). heart-rate's roll-up gets its own key: "heart-rate" is the sample list. */
export const EXTRA_JOBS: Job[] = [
  ...EXTRA_TYPES.map((type) => ({ key: type === "heart-rate" ? "heart-rate-daily" : type, kind: "extra" as const, type })),
  { key: "electrocardiogram", kind: "records", type: "electrocardiogram" },
  { key: "irregular-rhythm-notification", kind: "records", type: "irregular-rhythm-notification" },
  { key: "height", kind: "height", type: "height" },
];
export const EXTRA_JOB_KEYS = new Set(EXTRA_JOBS.map((j) => j.key));

/** The sync_state row for Journal › Log's import of entries logged in other apps. */
export const LOG_IMPORT_KEY = "logged-entries";
/** The types Google lets Pulse list back, in the order they are imported. */
const LOG_IMPORT_TYPES: ReadableLogType[] = ["hydration-log", "nutrition-log", "weight", "body-fat"];

/** Cheap types first, so a first connect shows daily data long before heart rate (~1,300 requests) is done. */
const JOBS: Job[] = [
  ...DAILY_TYPES.map((type) => ({ key: type, kind: "daily" as const, type })),
  { key: "sleep", kind: "sleep", type: "sleep" },
  { key: "exercise", kind: "exercise", type: "exercise" },
  { key: "total-calories", kind: "rollup", type: "total-calories" },
  { key: "steps-daily", kind: "rollup", type: "steps" }, // daily totals; "steps" below is per minute
  { key: "steps", kind: "steps", type: "steps" },
  // Score inputs from roll-ups (Pulse Age's zone minutes, Health Monitor's ranges); "rollup" sets `changed`.
  { key: "time-in-heart-rate-zone", kind: "rollup", type: "time-in-heart-rate-zone" },
  // Personal ranges (rhr/hrv) are not fetched: the API answers UNSUPPORTED_DATA_TYPE_ACTION to a roll-up on the
  // daily types (checked on a real account, 2026-10-03), so Health Monitor keeps Pulse's own ranges.
  { key: "heart-rate", kind: "hr", type: "heart-rate" },
  // Last, so the scored data lands first; each fails on its own (a scope granted later, a 400 on a new type).
  ...EXTRA_JOBS,
];

export type SyncDeps = Omit<ClientDeps, "userId"> & { log?: Pick<Console, "error"> };

export function createGoogleSource(deps: SyncDeps): Source {
  const { db, timeZone: tz, now = Date.now, log = console } = deps;
  const nowS = () => Math.floor(now() / 1000);

  return {
    async pull(userId: number) {
      const [grant] = await db.select({ userId: oauthTokens.userId }).from(oauthTokens).where(eq(oauthTokens.userId, userId));
      if (!grant) return { changed: false }; // not connected yet
      const client = createGoogleClient({ ...deps, userId }); // one per run: it holds the rate limiter
      const w = writer(tz, userId);
      const run = { changed: false };
      const setState = (d: Db, key: string, patch: Partial<typeof syncState.$inferInsert>) =>
        d
          .insert(syncState)
          .values({ userId, type: key, ...patch })
          .onConflictDoUpdate({ target: [syncState.userId, syncState.type], set: patch });

      // A Google Health profile with no paired device imports 180 empty days; say so instead (Settings,
      // ConnectionBanner). Only a clear "none" sets it and a clear "some" clears it; an error or an unknown
      // shape keeps the last answer, so a bad day at Google never claims the band is missing.
      try {
        const devices = await client.pairedDevices();
        if (devices !== "unknown") {
          await setState(db, DEVICES_KEY, { lastAttemptAt: nowS(), lastSuccessAt: nowS(), lastError: devices === "none" ? NO_DEVICE_ERROR : null });
        }
      } catch (err) {
        log.error(err instanceof GoogleError ? err.message : "[sync] pairedDevices: internal error");
      }

      for (const job of JOBS) {
        await setState(db, job.key, { lastAttemptAt: nowS() });
        try {
          await syncJob(job);
          await setState(db, job.key, { lastSuccessAt: nowS(), lastError: null });
        } catch (err) {
          const safe = err instanceof GoogleError ? err.message : `[sync] ${job.key}: internal error`;
          await setState(db, job.key, { lastError: safe });
          log.error(err instanceof GoogleError ? safe : `[sync] ${job.key} failed: ${(err as Error)?.stack ?? err}`);
        }
      }
      await importLog();
      await pruneRawPayloads(db, userId, nowS()); // every run, so the archive stays bounded (client.ts)
      return { changed: run.changed };

      /**
       * Every run re-reads Journal › Log's window for each readable type, so an entry logged, edited or deleted in
       * another app (or Pulse's own, once Google has it) lands in logged_entries. Feeds no score: never sets `changed`.
       * Each type fails on its own; the first error is kept in the row.
       */
      async function importLog() {
        const t = nowS();
        const today = localDay(t, tz);
        // Through the end of today: another app can log a meal ahead of its time.
        const [from, to] = [localMidnight(addDays(today, 1 - LOG_DAYS), tz), localMidnight(addDays(today, 1), tz)];
        let error: string | null = null;
        await setState(db, LOG_IMPORT_KEY, { lastAttemptAt: t });
        for (const type of LOG_IMPORT_TYPES) {
          try {
            const points = await client.list(type, from, to);
            const { missing } = await db.transaction((tx) => importEntries(tx, userId, type, mapLogEntries(type, points, tz), { from, to, now: t }));
            // Read-backs outside the transaction: a slow Google never holds a database connection.
            const pruned = await pruneEntries(db, userId, missing, (name) => client.exists(type, name));
            if (pruned.error) throw pruned.error;
          } catch (err) {
            const safe = err instanceof GoogleError ? err.message : `[sync] ${LOG_IMPORT_KEY} ${type}: internal error`;
            error ??= safe;
            log.error(err instanceof GoogleError ? safe : `[sync] ${LOG_IMPORT_KEY} ${type} failed: ${(err as Error)?.stack ?? err}`);
          }
        }
        await setState(db, LOG_IMPORT_KEY, error ? { lastError: error } : { lastSuccessAt: nowS(), lastError: null });
      }

      async function syncJob(job: Job) {
        const [st] = await db.select().from(syncState).where(and(eq(syncState.userId, userId), eq(syncState.type, job.key)));
        const t = nowS();
        const today = localDay(t, tz);
        const fresh = st?.syncedThrough == null;
        const backfilling = fresh || (st.backfillDaysDone ?? 0) < (st.backfillDaysTotal ?? BACKFILL_DAYS);
        let done = fresh ? 0 : (st.backfillDaysDone ?? 0);

        let from: number;
        if (fresh) {
          from = localMidnight(addDays(today, 1 - BACKFILL_DAYS), tz); // today is day 180
          await setState(db, job.key, { backfillDaysDone: 0, backfillDaysTotal: BACKFILL_DAYS });
        } else if (backfilling) {
          from = st.syncedThrough!; // the last committed chunk's end
        } else {
          const through = st.syncedThrough!;
          from = localMidnight(addDays(localDay(through, tz), -(job.kind === "sleep" || job.kind === "exercise" ? SESSION_OVERLAP_DAYS : OVERLAP_DAYS)), tz);
          if (job.kind === "hr" || job.kind === "steps") {
            // From the last sample too, not just the cursor, so a band that uploads hours late is not
            // lost behind a 1-hour overlap.
            // ponytail: a band silent for more than OVERLAP_DAYS loses the older part; widen if seen.
            const last = (await w.lastSample(db, job.kind)) ?? Infinity;
            from = Math.max(from, minute(Math.min(through, last + 1) - INTRADAY_OVERLAP_S));
          }
        }

        // heart-rate one local day at a time, each page mapped as it arrives: a day can be 86k points (one a second),
        // and holding them raw ran the heap out (a crash loop on a new band's backfill).
        const chunkDays = job.kind === "hr" ? 1 : DATA_TYPES[job.type].maxDays;
        for (const win of localWindows(from, t, chunkDays, tz)) {
          const hr = job.kind === "hr" ? await heartRate(client, win) : null;
          const points =
            hr !== null
              ? []
              : job.kind === "rollup" || job.kind === "extra"
                ? await client.dailyRollUp(job.type, localDay(win.start, tz), dayAfter(win.end, tz))
                : await client.list(job.type, win.start, win.end);
          await db.transaction(async (tx) => {
            if (await (hr !== null ? w.writeHr(tx, hr, win) : w.write(tx, job, points, win))) run.changed = true;
            if (backfilling) done = Math.min(BACKFILL_DAYS, done + daysIn(win, tz));
            await setState(tx, job.key, { syncedThrough: win.end, ...(backfilling && { backfillDaysDone: done }) });
          });
        }
        if (backfilling) await setState(db, job.key, { syncedThrough: t, backfillDaysDone: BACKFILL_DAYS });
      }
    },

    /**
     * The live heart-rate view's pull: one heart-rate list from the newest stored sample (less LIVE_OVERLAP_S, never
     * before today's local midnight) to now, written as the hr job writes it (merge, dirty days for the next
     * recompute). sync_state is left alone: the full sync's overlap re-reads this stretch anyway. No retries, so a
     * 429 or a revoked grant throws at once for the caller to back off.
     */
    async pullHeartRate(userId: number) {
      const t = nowS();
      const w = writer(tz, userId);
      const last = await w.lastSample(db, "hr");
      const start = Math.max(localMidnight(localDay(t, tz), tz), minute((last ?? 0) - LIVE_OVERLAP_S));
      if (start >= t) return;
      const win = { start, end: t };
      await w.writeHr(db, await heartRate(createGoogleClient({ ...deps, userId, maxTries: 1 }), win), win);
    },
  };
}

/**
 * The app's source: config and database from the environment, one client per pull, windows in the user's zone.
 * Before onboarding there is no zone yet: UTC, and saving the profile marks every day dirty for a rescore.
 */
export const googleSource: Source = {
  async pull(userId) {
    return (await sourceFor(userId))?.pull(userId) ?? { changed: false };
  },
  async pullHeartRate(userId) {
    await (await sourceFor(userId))?.pullHeartRate?.(userId);
  },
};

async function sourceFor(userId: number) {
  const { google } = getConfig();
  if (!google) return null;
  const db = getDb();
  const timeZone = (await getProfile(db, userId))?.timeZone ?? "UTC";
  return createGoogleSource({ db, google, timeZone });
}

const minute = (s: number) => Math.floor(s / 60) * 60;

/** A window's band heart rate, mapped page by page so only the samples are held, never a day of raw points. */
async function heartRate(client: Pick<ReturnType<typeof createGoogleClient>, "listEach">, win: TimeWindow) {
  const hr = new Map<number, number>();
  await client.listEach("heart-rate", win.start, win.end, (points) => {
    for (const [ts, bpm] of mapHeartRate(points)) hr.set(ts, bpm);
  });
  return hr;
}

/** The exclusive civil end day for a window ending at `end`: the day after, unless `end` is a local midnight. */
const dayAfter = (end: number, tz: string) =>
  localMidnight(localDay(end, tz), tz) === end ? localDay(end, tz) : addDays(localDay(end, tz), 1);

/** Local days a window touches. */
const daysIn = (w: TimeWindow, tz: string) =>
  Math.round((Date.parse(localDay(w.end - 1, tz)) - Date.parse(localDay(w.start, tz))) / 86_400_000) + 1;

// --- Writes ---------------------------------------------------------------------------------------

const CHUNK = 1000;

/**
 * Multi-row upsert of the user's rows on `key` (user_id leads it), updating a row only when a value differs
 * (`IS DISTINCT FROM`, so an unchanged re-fetch writes nothing). Rows with the same key: the last wins. Returns the
 * rows actually inserted or updated.
 */
async function upsert<T extends PgTable>(db: Db, table: T, key: string[], userId: number, input: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!input.length) return [];
  const cols = getTableColumns(table) as Record<string, PgColumn>;
  const byKey = new Map(input.map((r) => [key.map((k) => String(r[k])).join("\u0000"), r]));
  const rows = [...byKey.values()].map((r) => ({ ...r, userId }));
  const names = [...new Set(rows.flatMap(Object.keys))].filter((k) => k !== "userId" && !key.includes(k));
  // Column names come from the schema, never from input.
  const q = (k: string) => `"${cols[k].name}"`;
  const set = Object.fromEntries(names.map((k) => [k, sql.raw(`excluded.${q(k)}`)]));
  const t = `"${getTableName(table)}"`;
  const differs = sql.raw(`(${names.map((k) => `${t}.${q(k)}`)}) is distinct from (${names.map((k) => `excluded.${q(k)}`)})`);
  const target = [cols.userId, ...key.map((k) => cols[k])];
  const returned = Object.fromEntries(key.map((k) => [k, cols[k]]));
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    const ins = db.insert(table).values(rows.slice(i, i + CHUNK) as never);
    const res = names.length
      ? await ins.onConflictDoUpdate({ target, set: set as never, setWhere: differs }).returning(returned)
      : await ins.onConflictDoNothing().returning(returned);
    out.push(...(res as Record<string, unknown>[]));
  }
  return out;
}

function writer(tz: string, userId: number) {
  // Local midnight sits on a UTC quarter hour in every zone, so one lookup per 15 minutes is exact.
  const days = new Map<number, string>();
  const dayOf = (ts: number) => {
    const q = Math.floor(ts / 900);
    return days.get(q) ?? days.set(q, localDay(q * 900, tz)).get(q)!;
  };

  /** Upserts nightly and daily rows; a changed day is marked dirty (stage 2 replays from the first dirty day). */
  const dailyRows = async (db: Db, rows: DailyRow[], dirty: Set<string>) => {
    const written = await upsert(db, dailyMetrics, ["day"], userId, rows.map((r) => ({ ...r, source: "google" })));
    for (const r of written) dirty.add(r.day as string);
    return written.length > 0;
  };

  /** Replaces each session's segments where they differ. Returns the sessions whose segments changed. */
  async function segments(db: Db, sessionIds: string[], next: SegmentRow[]): Promise<Set<string>> {
    const changed = new Set<string>();
    if (!sessionIds.length) return changed;
    const held = await db
      .select({ sessionId: sleepSegments.sessionId, startTs: sleepSegments.startTs, endTs: sleepSegments.endTs, stage: sleepSegments.stage })
      .from(sleepSegments)
      .where(and(eq(sleepSegments.userId, userId), inArray(sleepSegments.sessionId, sessionIds)))
      .orderBy(sleepSegments.sessionId, sleepSegments.startTs);
    const key = (xs: SegmentRow[], id: string) =>
      JSON.stringify(xs.filter((s) => s.sessionId === id).map((s) => [s.startTs, s.endTs, s.stage]).sort((a, b) => (a[0] as number) - (b[0] as number)));
    for (const id of sessionIds) if (key(held, id) !== key(next, id)) changed.add(id);
    if (!changed.size) return changed;
    await db.delete(sleepSegments).where(and(eq(sleepSegments.userId, userId), inArray(sleepSegments.sessionId, [...changed])));
    const rows = next.filter((s) => changed.has(s.sessionId)).map((s) => ({ userId, ...s }));
    for (let i = 0; i < rows.length; i += CHUNK) await db.insert(sleepSegments).values(rows.slice(i, i + CHUNK));
    return changed;
  }

  /** Deletes the user's rows of `table` with `col` in the window whose id Google did not return. Returns their days. */
  async function prune(db: Db, table: typeof sleepSessions | typeof exercises, col: PgColumn, win: TimeWindow, returned: { id: string }[]) {
    const keep = new Set(returned.map((r) => r.id));
    const held = await db
      .select({ id: table.id, day: table.day })
      .from(table)
      .where(and(eq(table.userId, userId), gte(col, win.start), lt(col, win.end)));
    const gone = held.filter((r) => !keep.has(r.id));
    if (!gone.length) return [];
    const ids = gone.map((r) => r.id);
    await db.delete(table).where(and(eq(table.userId, userId), inArray(table.id, ids)));
    if (table === sleepSessions) await db.delete(sleepSegments).where(and(eq(sleepSegments.userId, userId), inArray(sleepSegments.sessionId, ids)));
    return gone.map((r) => r.day);
  }

  /** Writes a list window's points (or a rollup's) for a job; marks changed days dirty. True when anything changed. */
  async function write(db: Db, job: Job, points: unknown[], win: TimeWindow): Promise<boolean> {
    const dirty = new Set<string>();
    let changed = false;
    switch (job.kind) {
      case "daily":
        changed = await dailyRows(db, mapDaily(job.type, points, tz), dirty);
        break;
      case "rollup":
        changed = await dailyRows(db, mapRollup(job.type, points), dirty);
        break;
      // Extras and records feed no score, so they never set `changed` (no recompute for them).
      case "extra":
        await upsert(db, dailyValues, ["day", "key"], userId, mapExtra(job.type, points));
        break;
      case "records":
        await upsert(db, healthRecords, ["id"], userId, mapRecords(job.type, points, tz));
        break;
      case "height": {
        // Pulse Age's lean-mass term reads it when the profile has no height, so a new value rescores.
        const h = mapHeight(points);
        if (h) changed = (await upsert(db, dailyValues, ["day", "key"], userId, [{ day: "latest", key: "height_cm", value: h.cm }])).length > 0;
        break;
      }
      case "hr":
        return writeHr(db, mapHeartRate(points), win);
      case "steps": {
        // Max with the stored minute too: a multi-minute interval that starts before the re-fetch
        // window must not shrink the minutes it spills into.
        const steps = mapStepsMinutes(points);
        if (steps.size) for (const ts of await mergeSamples(db, "steps", userId, win, steps, "max")) dirty.add(dayOf(ts));
        break;
      }
      // Sessions feed stage 1 too (session resting HR, per-activity strain), so a changed one marks its day.
      case "sleep": {
        const { sessions, segments: segs } = mapSleep(points, tz);
        const written = new Set((await upsert(db, sleepSessions, ["id"], userId, sessions)).map((r) => r.id as string));
        const resegmented = await segments(db, sessions.map((s) => s.id), segs);
        for (const s of sessions) if (written.has(s.id) || resegmented.has(s.id)) dirty.add(s.day);
        // Only when every point was readable: a shape change must not read as "all deleted".
        if (sessions.length === points.length) for (const d of await prune(db, sleepSessions, sleepSessions.endTs, win, sessions)) dirty.add(d);
        break;
      }
      case "exercise": {
        const rows = mapExercises(points, tz);
        const written = new Set((await upsert(db, exercises, ["id"], userId, rows)).map((r) => r.id as string));
        for (const e of rows) if (written.has(e.id)) dirty.add(e.day);
        // The filter is on civil start time, which is start_ts in this zone.
        if (rows.length === points.length) for (const d of await prune(db, exercises, exercises.startTs, win, rows)) dirty.add(d);
        break;
      }
    }
    if (dirty.size) await db.insert(intradayDirty).values([...dirty].map((day) => ({ userId, day }))).onConflictDoNothing();
    return changed || dirty.size > 0;
  }

  /** Merges a window's band heart rate into hr_days and marks the changed days dirty. True when anything changed. */
  async function writeHr(db: Db, hr: Map<number, number>, win: TimeWindow): Promise<boolean> {
    // ponytail: only when the window has band HR, so an empty or unreadable answer never wipes a day;
    // a whole window deleted upstream stays. Drop the guard if that is ever seen.
    if (!hr.size) return false;
    const dirty = new Set((await mergeSamples(db, "hr", userId, win, hr, "replace")).map(dayOf));
    if (dirty.size) await db.insert(intradayDirty).values([...dirty].map((day) => ({ userId, day }))).onConflictDoNothing();
    return dirty.size > 0;
  }

  /** The user's newest stored intraday sample, unix seconds: the last offset of the newest day row. */
  async function lastSample(db: Db, kind: "hr" | "steps"): Promise<number | null> {
    const t = kind === "hr" ? hrDays : stepsDays;
    const r = await row<{ t: number | null }>(
      db,
      sql`select ${t.bucket} * 86400 + ${t.offsets}[array_length(${t.offsets}, 1)] as t from ${t} where ${t.userId} = ${userId} order by ${t.bucket} desc limit 1`,
    );
    return r?.t ?? null;
  }

  return { write, writeHr, lastSample };
}
