import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { lastRun, recompute, type RecoveryRow, SCORING_VERSION, type SleepRow, type StrainTargetRow } from "./pipeline";
import { seedPull } from "./sources/seed/generate";
import { localMidnight } from "./time";
import { cleanup, copyDb, DAY_S, dayAt, dump, NOW, OPTS, seeded, TZ, PROFILE } from "./testing";

afterAll(cleanup);

const json = <T>(db: Db, col: string, day: string) =>
  JSON.parse(db.$client.prepare(`select ${col} from daily_scores where day = ?`).pluck().get(day) as string) as T;
const days = (db: Db) => db.$client.prepare("select day from daily_scores order by day").pluck().all() as string[];
const rowsBefore = (db: Db, day: string) => JSON.stringify(db.$client.prepare("select * from daily_scores where day < ? order by day").raw().all(day));

let db: Db;
beforeAll(() => {
  db = seeded();
});

describe("recompute on the 180-day seed", () => {
  it("scores every day once, under the current scoring version", () => {
    expect(days(db)).toHaveLength(180);
    expect(days(db)[0]).toBe(dayAt(0));
    const versions = db.$client.prepare("select distinct scoring_version from daily_scores").pluck().all();
    expect(versions).toEqual([SCORING_VERSION]);
  });

  it("is deterministic: a second run reads no HR, writes nothing and leaves daily_scores byte-identical", () => {
    const before = dump(db, "daily_scores");
    const changes = db.$client.prepare("select total_changes()").pluck();
    const c0 = changes.get() as number;
    recompute(db, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(changes.get()).toBe(c0 + 0);
    expect(dump(db, "daily_scores")).toBe(before);
  });

  it("matches a from-scratch run on an identical database", () => {
    const other = seeded();
    expect(dump(other, "daily_scores")).toBe(dump(db, "daily_scores"));
    expect(dump(other, "intraday_series", "1, 2")).toBe(dump(db, "intraday_series", "1, 2"));
    expect(dump(other, "reports")).toBe(dump(db, "reports"));
  });

  it("stage 1 reruns only today when only today's HR changes", () => {
    const later = copyDb(db);
    seedPull(later, { now: NOW + 3600, timeZone: TZ, maxHr: PROFILE.maxHr });
    expect(later.$client.prepare("select day from intraday_dirty").pluck().all()).toEqual([dayAt(179)]);
    recompute(later, OPTS);
    expect(lastRun.stage1Days).toEqual([dayAt(179)]);
    expect(later.$client.prepare("select count(*) from intraday_dirty").pluck().get()).toBe(0);
  });

  it("a scoring-version change recomputes every day exactly once", () => {
    const bumped = copyDb(db);
    bumped.$client.prepare("update daily_scores set scoring_version = ?").run(SCORING_VERSION - 1);
    recompute(bumped, OPTS);
    expect(lastRun.stage1Days).toEqual(days(db));
    expect(new Set(lastRun.stage1Days).size).toBe(180);
    recompute(bumped, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(dump(bumped, "daily_scores")).toBe(dump(db, "daily_scores"));
  });

  it("is causal: a day later, every earlier day is unchanged", () => {
    const later = copyDb(db);
    seedPull(later, { now: NOW + DAY_S, timeZone: TZ, maxHr: PROFILE.maxHr });
    recompute(later, OPTS);
    expect(days(later)).toHaveLength(181);
    expect(rowsBefore(later, dayAt(179))).toBe(rowsBefore(db, dayAt(179)));
    // Today itself gained the rest of the day, so its strain moves; its recovery does not.
    expect(json<RecoveryRow>(later, "recovery", dayAt(179))).toEqual(json<RecoveryRow>(db, "recovery", dayAt(179)));
  });
});

describe("scale contracts", () => {
  it("Recovery's sleepPerf is sleep performance / 100 on [0, 1], never 0–100", () => {
    let checked = 0;
    for (const d of days(db)) {
      const rec = json<RecoveryRow>(db, "recovery", d);
      const sleep = json<SleepRow>(db, "sleep", d);
      if (rec.inputs.sleepPerf == null) continue;
      expect(rec.inputs.sleepPerf).toBeGreaterThanOrEqual(0);
      expect(rec.inputs.sleepPerf).toBeLessThanOrEqual(1);
      if (sleep.performance != null) {
        expect(rec.inputs.sleepPerf).toBeCloseTo(sleep.performance / 100, 12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it("stores Effort on 0–100 and Strain Target on 0–21", () => {
    const efforts = days(db).map((d) => json<{ effort: number | null }>(db, "strain", d).effort).filter((e): e is number => e != null);
    expect(efforts.length).toBeGreaterThan(170);
    expect(Math.max(...efforts)).toBeLessThanOrEqual(100);
    // A training day's Effort is above 21, so it cannot be on the 0–21 axis.
    expect(Math.max(...efforts)).toBeGreaterThan(21);
    for (const d of days(db)) {
      const t = json<StrainTargetRow>(db, "strain_target", d);
      if (t.reason !== null) continue;
      expect(t.low).toBeGreaterThanOrEqual(4);
      expect(t.high).toBeLessThanOrEqual(19);
      expect(t.high - t.low).toBeGreaterThanOrEqual(2 - 1e-9);
    }
  });

  it("feeds Training load one row per calendar day: 0 on a worn rest day, null only when the band was off", () => {
    for (const d of days(db)) {
      const s1 = json<{ effort: number | null; hrCount: number }>(db, "strain", d);
      const tl = json<{ contiguousDays: number }>(db, "training_load", d);
      if (s1.hrCount === 0) expect(tl.contiguousDays).toBe(0);
    }
    // The band-off days (156) break the run; it rebuilds one day at a time after.
    expect(json<{ contiguousDays: number }>(db, "training_load", dayAt(158)).contiguousDays).toBeLessThan(5);
    expect(json<{ contiguousDays: number }>(db, "training_load", dayAt(150)).contiguousDays).toBe(151);
  });
});

describe("recovery gating on the seed", () => {
  it("days 1–7 calibrate with the nights left, and day 8 is the first score", () => {
    for (let i = 0; i < 7; i++) {
      const r = json<RecoveryRow>(db, "recovery", dayAt(i));
      expect(r).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 7 - i });
    }
    const first = json<RecoveryRow>(db, "recovery", dayAt(7));
    expect(first.value).toBeTypeOf("number");
    expect(first.provisional).toBe(true);
    expect(json<RecoveryRow>(db, "recovery", dayAt(30)).provisional).toBe(false);
  });

  it("the no-HRV night and the band-off nights get reasons, not scores", () => {
    expect(json<RecoveryRow>(db, "recovery", dayAt(164))).toMatchObject({ value: null, reason: "no_hrv_last_night" });
    expect(json<RecoveryRow>(db, "recovery", dayAt(156))).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(json<RecoveryRow>(db, "recovery", dayAt(157))).toMatchObject({ value: null, reason: "band_not_worn" });
  });

  it("the skin-temperature gap leaves its baseline stale on day 100, and the term drops", () => {
    const r = json<RecoveryRow>(db, "recovery", dayAt(100));
    expect(r.stale).toContain("skinTemp");
    expect(r.terms).not.toContain("skinTemp");
    expect(json<RecoveryRow>(db, "recovery", dayAt(101)).terms).toContain("skinTemp");
  });

  it("a score that gains a term later is flagged Updated", () => {
    // Today's skin temperature lands 90 minutes after the rest of the night.
    const early = seeded([Date.parse("2026-10-02T08:00:00+05:30") / 1000]);
    const before = json<RecoveryRow>(early, "recovery", dayAt(179));
    expect(before.value).toBeTypeOf("number");
    expect(before.terms).not.toContain("skinTemp");
    seedPull(early, { now: Date.parse("2026-10-02T10:00:00+05:30") / 1000, timeZone: TZ, maxHr: PROFILE.maxHr });
    recompute(early, OPTS);
    const after = json<RecoveryRow>(early, "recovery", dayAt(179));
    expect(after.terms).toContain("skinTemp");
    expect(after.updated).toBe(true);
    expect(json<RecoveryRow>(early, "recovery", dayAt(178)).updated).toBe(false);
  });
});

describe("incremental equals full on 220 days", () => {
  it("a late night for day 200 then an incremental recompute matches a from-scratch recompute byte for byte", () => {
    const base = seeded([NOW - 40 * DAY_S, NOW], { compute: false });
    expect(base.$client.prepare("select count(*) from daily_metrics").pluck().get()).toBe(220);
    const full = copyDb(base);
    const late = copyDb(base);
    const c = late.$client;
    const first = c.prepare("select min(day) from daily_metrics").pluck().get() as string;
    const at = (i: number) => new Date(Date.parse(first) + i * DAY_S * 1000).toISOString().slice(0, 10);
    const day = at(200);

    // Hold back night 200: its session, stages and nightly metrics.
    const session = c.prepare("select * from sleep_sessions where day = ? and is_main = 1").get(day) as Record<string, unknown>;
    const segments = c.prepare("select * from sleep_segments where session_id = ?").all(session.id) as Record<string, unknown>[];
    const metrics = c.prepare("select hrv_ms, hrv_deep_ms, rhr_bpm, rhr_method, resp_bpm, nightly_temp_c, spo2_pct from daily_metrics where day = ?").get(day) as Record<string, unknown>;
    c.prepare("delete from sleep_sessions where id = ?").run(session.id);
    c.prepare("update daily_metrics set hrv_ms = null, hrv_deep_ms = null, rhr_bpm = null, rhr_method = null, resp_bpm = null, nightly_temp_c = null, spo2_pct = null where day = ?").run(day);
    recompute(late, OPTS);
    expect(json<RecoveryRow>(late, "recovery", day).reason).toBe("band_not_worn");

    // The night syncs late: the source writes the rows (no HR changed, so nothing is marked dirty).
    const insert = (table: string, row: Record<string, unknown>) =>
      c.prepare(`insert into ${table} (${Object.keys(row)}) values (${Object.keys(row).map(() => "?")})`).run(...Object.values(row));
    insert("sleep_sessions", session);
    for (const g of segments) insert("sleep_segments", g);
    c.prepare(`update daily_metrics set ${Object.keys(metrics).map((k) => `${k} = ?`)} where day = ?`).run(...Object.values(metrics), day);
    recompute(late, OPTS);
    // Only the days the night touches rerun stage 1: the morning it ended, and the evening before if it started then.
    const startedBefore = (session.start_ts as number) < localMidnight(day, TZ);
    expect(lastRun.stage1Days).toEqual(startedBefore ? [at(199), day] : [day]);

    recompute(full, OPTS);
    expect(dump(late, "daily_scores")).toBe(dump(full, "daily_scores"));
    expect(dump(late, "intraday_series", "1, 2")).toBe(dump(full, "intraday_series", "1, 2"));
    expect(dump(late, "reports")).toBe(dump(full, "reports"));
  }, 60_000);
});
