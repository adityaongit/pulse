import { beforeAll, describe, expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import {
  type HealthMonitorRow,
  type JournalImpactRow,
  lastRun,
  needsRecompute,
  recompute,
  type RecoveryRow,
  SCORING_VERSION,
  type SleepRow,
  type Stage1Day,
  type StrainTargetRow,
} from ".";
import { load } from "./data";
import { stage1 } from "./stage1";
import { seedPull } from "../sources/seed/generate";
import { copyDb, DAY_S, dayAt, dump, freshDb, NOW, OPTS, seeded, TZ, PROFILE, USER } from "../testing";

const COLS = new Set(["strain", "recovery", "sleep", "training_load", "strain_target", "health_monitor", "journal_impact"]);
const json = async <T>(db: Db, col: string, day: string) => {
  if (!COLS.has(col)) throw new Error(col);
  const [r] = await rows<{ v: T }>(db, sql`select ${sql.identifier(col)} v from daily_scores where user_id = ${USER} and day = ${day}`);
  return r.v;
};
const days = async (db: Db) =>
  (await rows<{ day: string }>(db, sql`select day from daily_scores where user_id = ${USER} order by day`)).map((r) => r.day);
const rowsBefore = async (db: Db, day: string) =>
  JSON.stringify(await rows(db, sql`select * from daily_scores where user_id = ${USER} and day < ${day} order by day`));
const dirtyDays = async (db: Db) =>
  (await rows<{ day: string }>(db, sql`select day from intraday_dirty where user_id = ${USER} order by day`)).map((r) => r.day);
const setVersion = (db: Db, v: number, day?: string) =>
  db.execute(sql`update daily_scores set scoring_version = ${v} where user_id = ${USER} ${day ? sql`and day = ${day}` : sql``}`);
/** Row versions of everything stage 2 writes: unchanged xmins mean no row was written. */
const xmins = async (db: Db) =>
  JSON.stringify(
    await rows(
      db,
      sql`select (select array_agg(xmin::text order by day) from daily_scores) s,
        (select array_agg(xmin::text order by day, kind) from intraday_series) i,
        (select array_agg(xmin::text order by period) from reports) r`,
    ),
  );
const seedOpts = (now: number) => ({ userId: USER, now, timeZone: TZ, maxHr: PROFILE.maxHr });

let db: Db;
// Read once for the tests that only look at the seeded scores.
let scores: Map<string, Record<string, unknown>>;
let metrics: Map<string, Record<string, unknown>>;
let allDays: string[];
const js = <T>(col: string, day: string) => scores.get(day)![col] as T;
beforeAll(async () => {
  db = await seeded();
  scores = new Map((await rows<Record<string, unknown>>(db, sql`select * from daily_scores where user_id = ${USER}`)).map((r) => [r.day as string, r]));
  metrics = new Map((await rows<Record<string, unknown>>(db, sql`select * from daily_metrics where user_id = ${USER}`)).map((r) => [r.day as string, r]));
  allDays = [...scores.keys()].sort();
});

describe("recompute on the 180-day seed", () => {
  it("scores every day once, under the current scoring version", async () => {
    expect(await days(db)).toHaveLength(180);
    expect((await days(db))[0]).toBe(dayAt(0));
    const versions = await rows<{ v: number }>(db, sql`select distinct scoring_version v from daily_scores`);
    expect(versions.map((r) => r.v)).toEqual([SCORING_VERSION]);
  });

  it("is deterministic: a second run reads no HR, writes nothing and leaves daily_scores byte-identical", async () => {
    const before = await dump(db, "daily_scores");
    const x0 = await xmins(db);
    await recompute(db, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(await xmins(db)).toBe(x0);
    expect(await dump(db, "daily_scores")).toBe(before);
  });

  it("matches a from-scratch run on an identical database", async () => {
    // Built here, not copied from the shared template, so this also checks the template.
    const other = await seeded([NOW], { compute: false });
    await recompute(other, OPTS);
    expect(await dump(other, "daily_scores", "1, 2")).toBe(await dump(db, "daily_scores", "1, 2"));
    expect(await dump(other, "intraday_series", "1, 2, 3")).toBe(await dump(db, "intraday_series", "1, 2, 3"));
    expect(await dump(other, "reports", "1, 2")).toBe(await dump(db, "reports", "1, 2"));
  });

  it("stage 1 reruns only today when only today's HR changes", async () => {
    const later = await copyDb(db);
    await seedPull(later, seedOpts(NOW + 3600));
    expect(await dirtyDays(later)).toEqual([dayAt(179)]);
    await recompute(later, OPTS);
    expect(lastRun.stage1Days).toEqual([dayAt(179)]);
    expect(await dirtyDays(later)).toEqual([]);
  });

  it("a scoring-version change recomputes every day exactly once", async () => {
    const bumped = await copyDb(db);
    await setVersion(bumped, SCORING_VERSION - 1);
    await recompute(bumped, OPTS);
    expect(lastRun.stage1Days).toEqual(await days(db));
    expect(new Set(lastRun.stage1Days).size).toBe(180);
    await recompute(bumped, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(await dump(bumped, "daily_scores", "1, 2")).toBe(await dump(db, "daily_scores", "1, 2"));
  });

  it("is causal: a day later, every earlier day is unchanged", async () => {
    const later = await copyDb(db);
    await seedPull(later, seedOpts(NOW + DAY_S));
    await recompute(later, OPTS);
    expect(await days(later)).toHaveLength(181);
    expect(await rowsBefore(later, dayAt(179))).toBe(await rowsBefore(db, dayAt(179)));
    // Today itself gained the rest of the day, so its strain moves; its recovery does not.
    expect(await json<RecoveryRow>(later, "recovery", dayAt(179))).toEqual(await json<RecoveryRow>(db, "recovery", dayAt(179)));
  });

  it("scopes by user: another user's recompute leaves this user's rows alone", async () => {
    const two = await copyDb(db);
    const before = await dump(two, "daily_scores", "1, 2");
    const [{ id }] = await rows<{ id: number }>(two, sql`insert into "user" (name, email, email_verified) values ('B', 'b@pulse.test', true) returning id`);
    await recompute(two, { ...OPTS, userId: id });
    expect(lastRun.stage1Days).toEqual([]);
    expect(await needsRecompute(two, USER)).toBe(false);
    expect(await dump(two, "daily_scores", "1, 2")).toBe(before);
  });
});

describe("needsRecompute", () => {
  it("is false after a full recompute", async () => {
    expect(await needsRecompute(db, USER)).toBe(false);
  });

  it("is true with a dirty day", async () => {
    const dirty = await copyDb(db);
    await dirty.execute(sql`insert into intraday_dirty (user_id, day) values (${USER}, ${dayAt(10)})`);
    expect(await needsRecompute(dirty, USER)).toBe(true);
  });

  it("is true when a row carries another scoring version", async () => {
    const old = await copyDb(db);
    await setVersion(old, SCORING_VERSION - 1, dayAt(10));
    expect(await needsRecompute(old, USER)).toBe(true);
  });

  it("is false on an empty database", async () => {
    expect(await needsRecompute(await freshDb({ install: false }), USER)).toBe(false);
  });

  // Failure injection: stage 1 commits, then the process dies before stage 2 does.
  const crashBetweenStages = async (d: Db) => stage1(d, (await load(d, OPTS))!, OPTS);

  it("stays true after a crash between the stages, and the next run catches up", async () => {
    const later = await copyDb(db);
    await seedPull(later, seedOpts(NOW + DAY_S)); // new HR, a new day
    const reference = await copyDb(later);
    await recompute(reference, OPTS);

    await crashBetweenStages(later);
    expect(await needsRecompute(later, USER)).toBe(true);
    await recompute(later, OPTS);
    expect(await needsRecompute(later, USER)).toBe(false);
    expect(await dump(later, "daily_scores", "1, 2")).toBe(await dump(reference, "daily_scores", "1, 2"));
  });

  it("a scoring-version change survives a crash between the stages", async () => {
    const bumped = await copyDb(db);
    await setVersion(bumped, SCORING_VERSION - 1);
    await crashBetweenStages(bumped);
    expect(await needsRecompute(bumped, USER)).toBe(true);
    await recompute(bumped, OPTS);
    expect(await dump(bumped, "daily_scores", "1, 2")).toBe(await dump(db, "daily_scores", "1, 2"));
  });

  it("a check-in's dirty mark refreshes journal impact, causally and deterministically", async () => {
    const logged = await copyDb(db);
    // What saveJournalEntry writes: the entry, and the day marked dirty.
    await logged.execute(sql`insert into journal_entries (user_id, day, tag, value) values (${USER}, ${dayAt(170)}, 'cold_plunge', 1)`);
    await logged.execute(sql`insert into intraday_dirty (user_id, day) values (${USER}, ${dayAt(170)})`);
    expect(await needsRecompute(logged, USER)).toBe(true);
    await recompute(logged, OPTS);
    expect(lastRun.stage1Days).toEqual([dayAt(170)]);
    expect(await needsRecompute(logged, USER)).toBe(false);
    const tags = async (day: string) => (await json<JournalImpactRow>(logged, "journal_impact", day)).impacts.map((i) => i.tag);
    expect(await tags(dayAt(179))).toContain("cold_plunge");
    expect(await tags(dayAt(170))).not.toContain("cold_plunge"); // a day's impact reads only earlier check-ins
    expect(await rowsBefore(logged, dayAt(171))).toBe(await rowsBefore(db, dayAt(171)));
    const after = await dump(logged, "daily_scores", "1, 2");
    await recompute(logged, OPTS);
    expect(await dump(logged, "daily_scores", "1, 2")).toBe(after);
  });
});

describe("scale contracts", () => {
  it("Recovery's sleepPerf is sleep performance / 100 on [0, 1], never 0–100", () => {
    let checked = 0;
    for (const d of allDays) {
      const rec = js<RecoveryRow>("recovery", d);
      const sleep = js<SleepRow>("sleep", d);
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
    const efforts = allDays.map((d) => js<{ effort: number | null }>("strain", d).effort).filter((e): e is number => e != null);
    expect(efforts.length).toBeGreaterThan(170);
    expect(Math.max(...efforts)).toBeLessThanOrEqual(100);
    // A training day's Effort is above 21, so it cannot be on the 0–21 axis.
    expect(Math.max(...efforts)).toBeGreaterThan(21);
    for (const d of allDays) {
      const t = js<StrainTargetRow>("strain_target", d);
      if (t.reason !== null) continue;
      expect(t.low).toBeGreaterThanOrEqual(4);
      expect(t.high).toBeLessThanOrEqual(19);
      expect(t.high - t.low).toBeGreaterThanOrEqual(2 - 1e-9);
    }
  });

  it("feeds Training load one row per calendar day: 0 on a worn rest day, null only when the band was off", () => {
    for (const d of allDays) {
      const s1 = js<{ effort: number | null; hrCount: number }>("strain", d);
      const tl = js<{ contiguousDays: number }>("training_load", d);
      if (s1.hrCount === 0) expect(tl.contiguousDays).toBe(0);
    }
    // The band-off days (156) break the run; it rebuilds one day at a time after.
    expect(js<{ contiguousDays: number }>("training_load", dayAt(158)).contiguousDays).toBeLessThan(5);
    expect(js<{ contiguousDays: number }>("training_load", dayAt(150)).contiguousDays).toBe(151);
  });
});

describe("recovery gating on the seed", () => {
  it("days 1–7 calibrate with the nights left, and day 8 is the first score", () => {
    for (let i = 0; i < 7; i++) {
      const r = js<RecoveryRow>("recovery", dayAt(i));
      expect(r).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 7 - i });
    }
    const first = js<RecoveryRow>("recovery", dayAt(7));
    expect(first.value).toBeTypeOf("number");
    expect(first.provisional).toBe(true);
    expect(js<RecoveryRow>("recovery", dayAt(30)).provisional).toBe(false);
  });

  it("the no-HRV night and the band-off nights get reasons, not scores", () => {
    expect(js<RecoveryRow>("recovery", dayAt(164))).toMatchObject({ value: null, reason: "no_hrv_last_night" });
    expect(js<RecoveryRow>("recovery", dayAt(156))).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(js<RecoveryRow>("recovery", dayAt(157))).toMatchObject({ value: null, reason: "band_not_worn" });
  });

  it("scores a processed night with HRV even when Google sent no sleep stages", async () => {
    const unstaged = await copyDb(db);
    const day = dayAt(160);
    // What Google sends for a CLASSIC night: the session and its summary minutes, no hypnogram.
    await unstaged.execute(sql`update sleep_sessions set stages_status = 'FAILED' where user_id = ${USER} and day = ${day} and is_main`);
    await unstaged.execute(
      sql`delete from sleep_segments where user_id = ${USER} and session_id in (select id from sleep_sessions where user_id = ${USER} and day = ${day})`,
    );
    await unstaged.execute(sql`insert into intraday_dirty (user_id, day) values (${USER}, ${day})`);
    await recompute(unstaged, OPTS);
    expect(metrics.get(day)!.hrv_ms).toBeTypeOf("number");
    expect((await json<SleepRow>(unstaged, "sleep", day)).main?.staged).toBe(false);
    const rec = await json<RecoveryRow>(unstaged, "recovery", day);
    expect(rec.reason).toBeNull();
    expect(rec.value).toBeTypeOf("number");
  });

  it("the skin-temperature gap leaves its baseline stale on day 100, and the term drops", () => {
    const r = js<RecoveryRow>("recovery", dayAt(100));
    expect(r.stale).toContain("skinTemp");
    expect(r.terms).not.toContain("skinTemp");
    expect(js<RecoveryRow>("recovery", dayAt(101)).terms).toContain("skinTemp");
  });
});

describe("Google's inputs first (docs/research/google-vs-pulse-metrics.md)", () => {
  const metric = (day: string, col: string) => metrics.get(day)![col] as number | null;

  it("zones are five on heart-rate reserve from the day's resting HR, with or without Google's zones", () => {
    for (const d of [dayAt(120), dayAt(157)]) {
      const s1 = js<Stage1Day>("strain", d);
      const reserve = s1.maxHr - s1.restingHr;
      expect(s1.zoneLower).toEqual([0.5, 0.6, 0.7, 0.8, 0.9].map((e) => Math.round((s1.restingHr + e * reserve) * 10) / 10));
      expect(s1.zoneSeconds).toHaveLength(5);
    }
  });

  it("Recovery and Strain read Google's daily resting HR, not the sleep-session estimate", () => {
    const rhr = metric(dayAt(120), "rhr_bpm");
    expect(js<RecoveryRow>("recovery", dayAt(120)).inputs.rhr).toBe(rhr);
    expect(js<Stage1Day>("strain", dayAt(120))).toMatchObject({ restingHr: rhr, restingHrSource: "daily" });
  });

  it("skin temperature: nightly − Google's baseline; Health Monitor takes Google's ranges", () => {
    const d = dayAt(120);
    const dev = (metric(d, "nightly_temp_c") as number) - (metric(d, "temp_baseline_c") as number);
    expect(js<RecoveryRow>("recovery", d).inputs.skinTempDev).toBeCloseTo(dev, 9);
    const hm = js<HealthMonitorRow>("health_monitor", d);
    if (hm.reason !== null) throw new Error("no health monitor");
    const by = Object.fromEntries(hm.vitals.map((v) => [v.key, v]));
    expect(by.restingHr).toMatchObject({ rangeSource: "google", range: { low: metric(d, "rhr_range_low"), high: metric(d, "rhr_range_high") } });
    expect(by.hrv).toMatchObject({ rangeSource: "google", range: { low: metric(d, "hrv_range_low"), high: metric(d, "hrv_range_high") } });
    const sd = metric(d, "temp_sd_c") as number;
    expect(by.skinTempDev).toMatchObject({ rangeSource: "google", range: { low: -2 * sd, high: 2 * sd } });
    expect(by.resp.rangeSource).toBe("pulse");
  });
});
