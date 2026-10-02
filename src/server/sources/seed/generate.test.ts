import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, openDb } from "../../db";
import { generateDay, localMidnight, seedPull } from "./generate";
import { DEFAULT_JOURNAL_TAGS, SCENARIO, SEED_DAYS } from "./scenario";

const TZ = "Asia/Kolkata"; // no DST, so day i starts at ANCHOR_START + i * DAY
const MAX_HR = 183;
const HOUR = 3600;
const DAY = 86_400;
/** Friday 14:00, after wake. The seeded range then starts on Monday 2026-04-06. */
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const TODAY = "2026-10-02";
const ANCHOR = "2026-04-06";
const ANCHOR_START = localMidnight(ANCHOR, TZ);
const TODAY_I = SEED_DAYS - 1;
const opts = (now: number) => ({ now, timeZone: TZ, maxHr: MAX_HR });
const dayAt = (i: number) => new Date(Date.parse(ANCHOR) + i * DAY * 1000).toISOString().slice(0, 10);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-seed-"));
let dbCount = 0;
const freshDb = () => openDb(path.join(dir, `${dbCount++}.db`));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const rows = <T>(db: Db, query: string, ...args: unknown[]) => db.$client.prepare(query).all(...args) as T[];
const value = <T>(db: Db, query: string, ...args: unknown[]) => db.$client.prepare(query).pluck().get(...args) as T;
const row = (db: Db, query: string, ...args: unknown[]) => db.$client.prepare(query).get(...args);

const indexOf = (day: string) => Math.round((Date.parse(day) - Date.parse(ANCHOR)) / DAY / 1000);
const clampZone = (z: number) => Math.min(5, Math.max(0, z));

/** sha256 of a table's rows in column order. */
function tableHash(db: Db, table: string, where = "") {
  const columns = value<number>(db, `select count(*) from pragma_table_info('${table}')`);
  const h = createHash("sha256");
  for (const row of db.$client.prepare(`select * from ${table} ${where} order by ${range(1, columns)}`).raw().iterate()) {
    h.update(JSON.stringify(row));
  }
  return h.digest("hex");
}

/** Every app table's hash. */
function checksums(db: Db) {
  const tables = rows<{ name: string }>(db, "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'");
  return Object.fromEntries(tables.map(({ name }) => [name, tableHash(db, name)]));
}

type Metrics = { day: string; hrv_ms: number | null; rhr_bpm: number | null; resp_bpm: number | null; nightly_temp_c: number | null; spo2_pct: number | null; steps: number | null };
type Session = { id: string; day: string; start_ts: number; end_ts: number; is_main: number; stages_status: string | null; asleep_min: number; awake_min: number; deep_min: number; light_min: number; rem_min: number };

let db: Db;
let seedSeconds = 0;
let metrics: Map<number, Metrics>;
let mainSleep: Map<number, Session>;
beforeAll(() => {
  db = freshDb();
  const t = performance.now();
  expect(seedPull(db, opts(NOW))).toEqual({ changed: true });
  seedSeconds = (performance.now() - t) / 1000;
  metrics = new Map(rows<Metrics>(db, "select * from daily_metrics").map((m) => [indexOf(m.day), m]));
  mainSleep = new Map(rows<Session>(db, "select * from sleep_sessions where is_main = 1").map((s) => [indexOf(s.day), s]));
}, 60_000);
const hrCount = (i: number) => value<number>(db, "select count(*) from hr_samples where ts >= ? and ts < ?", ANCHOR_START + i * DAY, ANCHOR_START + (i + 1) * DAY);

describe("a fresh seed", () => {
  it(`fills ${SEED_DAYS} local days ending today, within a few seconds`, () => {
    expect([...metrics.keys()].sort((a, b) => a - b)).toEqual(range(0, TODAY_I));
    expect(metrics.get(TODAY_I)!.day).toBe(TODAY);
    expect(seedSeconds).toBeLessThan(10);
  });

  it("writes HR every 15 s on the local-day grid, a full day being 5760 readings", () => {
    expect(value(db, "select count(*) from hr_samples where ts % 15 != 0")).toBe(0);
    expect(hrCount(100)).toBe(5760);
    expect(value(db, "select max(ts) from hr_samples")).toBeLessThan(NOW);
    expect(value(db, "select min(bpm) >= 38 and max(bpm) <= ? from hr_samples", MAX_HR)).toBe(1);
  });

  it("marks every day with HR or steps intraday_dirty", () => {
    const dirty = rows<{ day: string }>(db, "select day from intraday_dirty order by day").map((r) => indexOf(r.day));
    expect(dirty).toEqual(range(0, TODAY_I).filter((i) => i !== 156));
  });

  it("seeds the default journal tags and a check-in on most past days, none today", () => {
    expect(rows(db, "select tag, label, is_default as d from journal_tags order by tag")).toEqual(
      DEFAULT_JOURNAL_TAGS.map(({ tag, label }) => ({ tag, label, d: 1 })).sort((a, b) => a.tag.localeCompare(b.tag)),
    );
    const perDay = rows<{ day: string; n: number }>(db, "select day, count(*) n from journal_entries group by day");
    expect(perDay.every((d) => d.n === DEFAULT_JOURNAL_TAGS.length)).toBe(true);
    expect(perDay.some((d) => d.day === TODAY)).toBe(false);
    expect(perDay.length).toBeGreaterThan(0.85 * TODAY_I);
    expect(perDay.length).toBeLessThan(TODAY_I);
  });
});

describe("reason coverage", () => {
  const staged = (i: number) => mainSleep.get(i)?.stages_status === "SUCCEEDED";

  it("calibrating: valid nights from day 0, so days 0–6 have fewer than 7 prior nights", () => {
    for (const i of range(0, SCENARIO.calibratingDays)) {
      expect(staged(i), `day ${i}`).toBe(true);
      expect(metrics.get(i)!.hrv_ms, `day ${i}`).not.toBeNull();
    }
  });

  it("no_hrv_last_night: exactly one staged night without HRV", () => {
    expect(range(0, TODAY_I).filter((i) => staged(i) && metrics.get(i)!.hrv_ms === null)).toEqual([SCENARIO.noHrvNight]);
  });

  it("band_not_worn: two past days without sleep, one of them without any HR", () => {
    expect(range(0, TODAY_I).filter((i) => !mainSleep.has(i))).toEqual([156, 157]);
    expect(hrCount(156)).toBe(0);
    expect(metrics.get(156)!.steps).toBeNull();
  });

  it("insufficient_hr_data: the band goes back on minutes before midnight (under 600 readings spanning under 600 s)", () => {
    const [n, spanS] = db.$client
      .prepare("select count(*), max(ts) - min(ts) from hr_samples where ts >= ? and ts < ?")
      .raw()
      .get(ANCHOR_START + 157 * DAY, ANCHOR_START + 158 * DAY) as [number, number];
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThan(600);
    expect(spanS).toBeLessThan(600);
  });

  it("stale_baseline: skin temperature is missing for the first 3 nights and 15 nights in a row later", () => {
    const missing = range(0, TODAY_I).filter((i) => mainSleep.has(i) && metrics.get(i)!.nightly_temp_c === null);
    expect(missing).toEqual([...range(0, 2), ...range(SCENARIO.skinTempGap.start, SCENARIO.skinTempGap.end)]);
  });
});

describe("scenario", () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const field = (k: keyof Metrics, days: number[]) => days.map((i) => metrics.get(i)![k] as number).filter((v) => v !== null);

  it("illness week: HRV down, RHR, respiration and temperature up, SpO2 under 95 at the peak", () => {
    const before = range(104, 117);
    const peak = range(119, 121);
    expect(mean(field("hrv_ms", peak)) / mean(field("hrv_ms", before))).toBeLessThan(0.85);
    expect(mean(field("rhr_bpm", peak)) - mean(field("rhr_bpm", before))).toBeGreaterThan(4);
    expect(mean(field("resp_bpm", peak)) - mean(field("resp_bpm", before))).toBeGreaterThan(1);
    expect(mean(field("nightly_temp_c", peak)) - mean(field("nightly_temp_c", before))).toBeGreaterThan(0.4);
    expect(Math.max(...field("spo2_pct", peak))).toBeLessThan(95);
    const ill = rows<{ day: string }>(db, "select day from journal_entries where tag = 'illness' and value = 1").map((r) => indexOf(r.day));
    expect(ill.every((i) => i >= SCENARIO.illness.start && i <= SCENARIO.illness.end)).toBe(true);
    expect(value(db, "select count(*) from exercises where day between ? and ?", dayAt(118), dayAt(125))).toBe(0);
  });

  it("training block: Edwards-effort ACWR (7 / 28 days) rises above 1.3, and not before", () => {
    const trimp = new Array<number>(SEED_DAYS).fill(0);
    for (const [ts, bpm] of db.$client.prepare("select ts, bpm from hr_samples").raw().iterate() as Iterable<[number, number]>) {
      const i = Math.floor((ts - ANCHOR_START) / DAY);
      const rhr = metrics.get(i)!.rhr_bpm ?? 56;
      trimp[i] += (clampZone(Math.floor((10 * (bpm - rhr)) / (MAX_HR - rhr)) - 4) * 15) / 60;
    }
    const effort = trimp.map((t) => (100 * Math.log(t + 1)) / Math.log(7201));
    const avg = (from: number, to: number) => mean(effort.slice(from, to + 1));
    const acwr = (i: number) => avg(i - 6, i) / avg(i - 27, i);
    expect(Math.max(...range(SCENARIO.trainingBlock.start, SCENARIO.trainingBlock.end).map(acwr))).toBeGreaterThan(1.3);
    expect(Math.max(...range(28, SCENARIO.trainingBlock.start - 1).map(acwr))).toBeLessThan(1.3);
  });

  it("sleep debt: five nights under 6 h asleep after a normal fortnight", () => {
    const asleepH = (i: number) => mainSleep.get(i)!.asleep_min / 60;
    expect(range(SCENARIO.shortSleep.start, SCENARIO.shortSleep.end).every((i) => asleepH(i) < 6)).toBe(true);
    expect(mean(range(154, 167).filter((i) => mainSleep.has(i)).map(asleepH))).toBeGreaterThan(7);
  });

  it("alcohol lowers next-night HRV by about 12%", () => {
    const alcohol = new Set(rows<{ day: string }>(db, "select day from journal_entries where tag = 'alcohol' and value = 1").map((r) => indexOf(r.day)));
    const recorded = new Set(rows<{ day: string }>(db, "select distinct day from journal_entries").map((r) => indexOf(r.day)));
    const nextHrv = (yes: boolean) => [...recorded].filter((i) => alcohol.has(i) === yes).flatMap((i) => field("hrv_ms", [i + 1]));
    expect(alcohol.size).toBeGreaterThan(20);
    const ratio = mean(nextHrv(true)) / mean(nextHrv(false));
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
  });

  it("workouts mix runs, rides and strength, with run VO2max, weekly daily VO2max and monthly weigh-ins", () => {
    const types = rows<{ type: string; n: number }>(db, "select type, count(*) n from exercises group by type");
    expect(Object.fromEntries(types.map((t) => [t.type, t.n > 10]))).toMatchObject({ RUNNING: true, BIKING: true, STRENGTH_TRAINING: true });
    expect(value(db, "select count(*) from daily_metrics where vo2max_run is not null")).toBe(value(db, "select count(distinct day) from exercises where type = 'RUNNING'"));
    expect(value(db, "select count(*) from daily_metrics where vo2max_daily is not null")).toBeGreaterThanOrEqual(24);
    expect(value(db, "select count(*) from daily_metrics where weight_kg is not null and body_fat_pct is not null")).toBe(6);
  });

  it("naps: unstaged side sessions, more of them when ill or short on sleep", () => {
    const naps = rows<Session>(db, "select * from sleep_sessions where is_main = 0").map((s) => ({ ...s, i: indexOf(s.day) }));
    expect(naps.length).toBeGreaterThan(5);
    expect(naps.every((s) => s.stages_status === null && s.asleep_min > 0)).toBe(true);
    expect(value(db, "select count(*) from sleep_segments where session_id like 'seed-nap-%'")).toBe(0);
    expect(naps.filter((s) => (s.i >= 118 && s.i <= 124) || (s.i >= 168 && s.i <= 172)).length).toBeGreaterThanOrEqual(5);
  });

  it("sleep sessions and workouts never overlap", () => {
    const spans = rows<{ s: number; e: number }>(db, "select start_ts s, end_ts e from sleep_sessions union all select start_ts, end_ts from exercises order by 1");
    for (let k = 1; k < spans.length; k++) expect(spans[k].s).toBeGreaterThanOrEqual(spans[k - 1].e);
  });
});

describe("plausibility", () => {
  it("nightly metrics stay in physiological ranges", () => {
    const all = [...metrics.values()];
    const within = (k: keyof Metrics, lo: number, hi: number) =>
      expect(all.filter((m) => m[k] !== null && ((m[k] as number) < lo || (m[k] as number) > hi)), k).toEqual([]);
    within("hrv_ms", 20, 120);
    within("rhr_bpm", 45, 75);
    within("resp_bpm", 10, 22);
    within("spo2_pct", 90, 100);
    within("nightly_temp_c", 32, 37);
  });

  it("main sleeps last 4–10 h with stage shares in physiological ranges", () => {
    for (const s of mainSleep.values()) {
      const inBedH = (s.end_ts - s.start_ts) / HOUR;
      expect(inBedH, s.day).toBeGreaterThanOrEqual(4);
      expect(inBedH, s.day).toBeLessThanOrEqual(10);
      expect(s.asleep_min / 60, s.day).toBeGreaterThanOrEqual(4);
      expect(s.asleep_min + s.awake_min).toBe((s.end_ts - s.start_ts) / 60);
      expect(s.deep_min / s.asleep_min, `${s.day} deep`).toBeGreaterThan(0.1);
      expect(s.deep_min / s.asleep_min, `${s.day} deep`).toBeLessThan(0.3);
      expect(s.rem_min / s.asleep_min, `${s.day} rem`).toBeGreaterThan(0.12);
      expect(s.rem_min / s.asleep_min, `${s.day} rem`).toBeLessThan(0.32);
      expect(s.awake_min / (s.asleep_min + s.awake_min), `${s.day} awake`).toBeLessThan(0.2);
    }
  });

  it("segments tile each main sleep exactly", () => {
    const segs = rows<{ session_id: string; start_ts: number; end_ts: number }>(db, "select * from sleep_segments order by session_id, start_ts");
    const bySession = Map.groupBy(segs, (g) => g.session_id);
    for (const s of mainSleep.values()) {
      const list = bySession.get(s.id)!;
      expect(list[0].start_ts).toBe(s.start_ts);
      expect(list.at(-1)!.end_ts).toBe(s.end_ts);
      for (let k = 1; k < list.length; k++) expect(list[k].start_ts).toBe(list[k - 1].end_ts);
    }
  });

  it("full worn days have 1k–30k steps (sick days are the low end)", () => {
    const full = [...metrics.entries()].filter(([i]) => i < TODAY_I && i !== 155 && i !== 156 && i !== 157);
    expect(full.filter(([, m]) => m.steps! < 1000 || m.steps! > 30_000).map(([i, m]) => [i, m.steps])).toEqual([]);
  });
});

describe("HRV spread", () => {
  it("has a fitted EWMA spread above noop's 5 ms floor and reaches both tails", () => {
    const hrv = [...metrics.values()].sort((a, b) => a.day.localeCompare(b.day)).flatMap((m) => (m.hrv_ms === null ? [] : [m.hrv_ms]));
    const centreAlpha = 1 - 2 ** (-1 / 14);
    const spreadAlpha = 1 - 2 ** (-1 / 21);
    let centre = hrv[0];
    let spread = 5;
    const fitted: { spread: number; z: number }[] = [];
    for (const x of hrv.slice(1)) {
      fitted.push({ spread, z: (x - centre) / (1.253 * spread) });
      spread += spreadAlpha * (Math.abs(x - centre) - spread);
      centre += centreAlpha * (x - centre);
    }
    const settled = fitted.slice(30);
    const median = settled.map((f) => f.spread).sort((a, b) => a - b)[settled.length >> 1];
    expect(median).toBeGreaterThan(5);
    // Recovery is green above z ≈ +0.25 and red below z ≈ −0.65: both need real days.
    expect(settled.filter((f) => f.z > 0.5).length / settled.length).toBeGreaterThan(0.1);
    expect(settled.filter((f) => f.z < -0.8).length / settled.length).toBeGreaterThan(0.1);
  });
});

const ctx = { anchor: ANCHOR, timeZone: TZ, maxHr: MAX_HR };

describe("determinism", () => {
  it("generates a day identically twice, and different days differently", () => {
    expect(generateDay(ctx, 120)).toEqual(generateDay(ctx, 120));
    expect(generateDay(ctx, 121).bpm).not.toEqual(generateDay(ctx, 120).bpm);
  });

  it("seeds the full range identically twice", () => {
    const again = freshDb();
    seedPull(again, opts(NOW));
    expect(checksums(again)).toEqual(checksums(db));
  }, 60_000);
});

describe("incremental pulls", () => {
  it("this morning: awaiting sleep sync until 30 min after wake, skin temperature 90 min later, then equal to a fresh seed", () => {
    const early = freshDb();
    const wake = generateDay(ctx, TODAY_I).sleeps.find((s) => s.row.isMain)!.row.endTs;
    const today = () => row(early, "select hrv_ms, nightly_temp_c from daily_metrics where day = ?", TODAY);
    const mainSleeps = () => value(early, "select count(*) from sleep_sessions where day = ? and is_main = 1", TODAY);
    const fiveAm = Date.parse(`${TODAY}T05:00:00+05:30`) / 1000;
    expect(fiveAm).toBeLessThan(wake);

    seedPull(early, opts(fiveAm));
    expect(value(early, "select max(ts) from hr_samples")).toBe(fiveAm - 15);
    expect([mainSleeps(), today()]).toEqual([0, { hrv_ms: null, nightly_temp_c: null }]);
    seedPull(early, opts(wake + 15 * 60));
    expect([mainSleeps(), today()]).toEqual([0, { hrv_ms: null, nightly_temp_c: null }]);
    seedPull(early, opts(wake + 45 * 60));
    expect(mainSleeps()).toBe(1);
    expect(today()).toEqual({ hrv_ms: expect.any(Number), nightly_temp_c: null });
    seedPull(early, opts(NOW));
    expect(today()).toEqual({ hrv_ms: expect.any(Number), nightly_temp_c: expect.any(Number) });
    expect(checksums(early)).toEqual(checksums(db));
  }, 60_000);

  describe("on a seeded database", () => {
    let b: Db;
    beforeAll(() => {
      b = freshDb();
      seedPull(b, opts(NOW));
    }, 60_000);

    it("a pull at the same instant, or an earlier one, changes nothing", () => {
      const before = checksums(b);
      expect(seedPull(b, opts(NOW))).toEqual({ changed: false });
      expect(seedPull(b, opts(NOW - HOUR))).toEqual({ changed: false });
      expect(checksums(b)).toEqual(before);
    });

    it("a tick an hour later only adds HR and steps for that hour and updates today's totals", () => {
      // Friday afternoon of the seeded range is a rest day with no nap, so nothing else ends in this hour.
      const before = checksums(b);
      const earlier = (t: string) => tableHash(b, t, `where ts < ${NOW}`);
      const beforeIntraday = [earlier("hr_samples"), earlier("steps_minutes")];
      const pastMetrics = rows(b, "select * from daily_metrics where day < ? order by day", TODAY);
      b.$client.exec("delete from intraday_dirty");

      expect(seedPull(b, opts(NOW + HOUR))).toEqual({ changed: true });
      expect(value(b, "select count(*) from hr_samples where ts >= ?", NOW)).toBe(HOUR / 15);
      expect(value(b, "select max(ts) from hr_samples")).toBe(NOW + HOUR - 15);
      expect(value(b, "select min(ts) >= ? and max(ts) < ? from steps_minutes where ts >= ?", NOW, NOW + HOUR, NOW - 60)).toBe(1);
      const after = checksums(b);
      expect([earlier("hr_samples"), earlier("steps_minutes")]).toEqual(beforeIntraday);
      for (const t of ["sleep_sessions", "sleep_segments", "exercises", "journal_entries", "journal_tags"]) expect(after[t], t).toBe(before[t]);
      expect(rows(b, "select * from daily_metrics where day < ? order by day", TODAY)).toEqual(pastMetrics);
      expect(rows(b, "select day from intraday_dirty")).toEqual([{ day: TODAY }]);
    });

    it("rolling into the next day extends the range and keeps the user's own check-in", () => {
      b.$client.prepare("insert into journal_entries (day, tag, value) values (?, 'alcohol', 1)").run(TODAY);
      const tomorrow = dayAt(SEED_DAYS);
      seedPull(b, opts(NOW + DAY));
      expect(rows(b, "select tag, value from journal_entries where day = ?", TODAY)).toEqual([{ tag: "alcohol", value: 1 }]);
      expect(value(b, "select count(*) from journal_entries where day = ?", tomorrow)).toBe(0);
      expect(value(b, "select min(day) || ' ' || max(day) from daily_metrics")).toBe(`${ANCHOR} ${tomorrow}`);
      expect(value(b, "select count(*) from sleep_sessions where day = ? and is_main = 1", tomorrow)).toBe(1);
    });
  });
});
