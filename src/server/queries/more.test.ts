// The More hub's view models (U21): Trends, the reports archive, Behaviours, More itself and Your data.
import { beforeAll, describe, expect, it } from "vitest";
import { EXTRA_KEYS } from "@/lib/extraMetrics";
import { type Db, row, sql } from "../db";
import { dailyScores } from "../db/schema";
import { addTag, selectTags } from "../journalTags";
import { ctxFor, freshDb, seeded, USER } from "../testing";
import { addDays } from "../time";
import { getBehaviours, getJournal, getJournalInsights } from "./journal";
import { getReportArchive } from "./reports";
import { getMore, getYourData } from "./settings";
import { getTrends, parseTrendMetric, TREND_GROUPS, TREND_METRICS } from "./trends";
import { todayOf } from "./common";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getTrends", () => {
  it("returns a year ending today, and each range's average against the range before it", async () => {
    const ctx = ctxFor(db);
    const vm = await getTrends("recovery", ctx);
    const pts = vm.points.value!;
    expect(pts).toHaveLength(365);
    expect(pts.at(-1)!.day).toBe(todayOf(ctx));
    expect(vm.periods.map((p) => p.range)).toEqual(["w", "m", "6m", "1y"]);
    const mean = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x !== null);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    const w = vm.periods[0];
    expect(w.average.value).toBeCloseTo(mean(pts.slice(-7).map((p) => p.value)), 6);
    expect(w.prior).toBeCloseTo(mean(pts.slice(-14, -7).map((p) => p.value)), 6);
    // The demo has 180 days: the 6M range has no 6 months before it.
    expect(vm.periods[2].prior).toBeNull();
    expect(vm.periods[2].average.value).not.toBeNull();
  });

  it("leaves today a gap for metrics that accrue through the day", async () => {
    const ctx = ctxFor(db);
    for (const key of ["strain", "steps", "stress", "distance", "azm"] as const) expect((await getTrends(key, ctx)).points.value!.at(-1)!.value).toBeNull();
    expect((await getTrends("avg_hr", ctx)).points.value!.at(-1)!.value).not.toBeNull();
    expect((await getTrends("hrv", ctx)).points.value!.some((p) => p.value !== null)).toBe(true);
  });

  it("every seeded metric yields finite values on the demo, the unseeded logs are no_data, and unknown keys fall back to Recovery", async () => {
    const ctx = ctxFor(db);
    const unseeded = ["water", "calories_in", "protein", "carbs", "fat", "glucose", "core_temp", "swim_strokes"];
    for (const m of TREND_METRICS) {
      const points = (await getTrends(m.key, ctx)).points;
      if (unseeded.includes(m.key)) expect(points, m.key).toMatchObject({ value: null, reason: "no_data" });
      else expect(points.value!.some((p) => p.value !== null), m.key).toBe(true);
    }
    expect(parseTrendMetric("distance").key).toBe("distance");
    expect(parseTrendMetric("nope").key).toBe("recovery");
    expect(parseTrendMetric(["hrv"]).key).toBe("hrv");
  });

  it("is honest with no data: no_data, or calibrating with nights left for a new Recovery", async () => {
    const empty = await freshDb({ install: false });
    expect((await getTrends("hrv", ctxFor(empty))).points).toMatchObject({ value: null, reason: "no_data" });
    // Day 3 of a new instance: Recovery stores its calibrating reason, as the pipeline does before 7 nights.
    const ctx = ctxFor(empty);
    await empty.insert(dailyScores).values({
      userId: USER,
      day: todayOf(ctx),
      scoringVersion: 1,
      recovery: { value: null, reason: "calibrating", nightsLeft: 4, provisional: false, stale: [], terms: [], updated: false },
    });
    expect((await getTrends("recovery", ctx)).points).toEqual({ value: null, reason: "calibrating", provisional: false, nightsLeft: 4 });
    expect((await getTrends("hrv", ctx)).points).toMatchObject({ value: null, reason: "no_data" });
  });
});

describe("TREND_METRICS", () => {
  it("adds every extra from the catalogue plus weight and body fat, each in a picker section, with unique export columns", async () => {
    const keys = TREND_METRICS.map((m) => m.key);
    expect(keys).toEqual(expect.arrayContaining([...EXTRA_KEYS, "weight", "body_fat"]));
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(TREND_METRICS.map((m) => m.column)).size).toBe(keys.length);
    expect(TREND_METRICS.every((m) => TREND_GROUPS.includes(m.group))).toBe(true);
    const col = (k: string) => TREND_METRICS.find((m) => m.key === k)!.column;
    expect([col("distance"), col("azm"), col("active_minutes"), col("glucose"), col("core_temp"), col("weight")]).toEqual([
      "distance_km",
      "azm_minutes",
      "active_minutes",
      "glucose_mg_dl",
      "core_temp_c",
      "weight_kg",
    ]);
  });
});

describe("getReportArchive", () => {
  it("lists every week and month with data, newest first, flagging partial ones", async () => {
    const vm = await getReportArchive(ctxFor(db));
    expect(vm.weeks.length).toBeGreaterThanOrEqual(25);
    expect(vm.months.length).toBeGreaterThanOrEqual(6);
    expect(vm.weeks.every((w) => /^\d{4}-W\d{2}$/.test(w.period))).toBe(true);
    expect(vm.months.every((m) => /^\d{4}-\d{2}$/.test(m.period))).toBe(true);
    expect([...vm.weeks].sort((a, b) => b.period.localeCompare(a.period))).toEqual(vm.weeks);
    // Friday: the current week and month are in progress; the weeks before are whole.
    expect(vm.weeks[0].partial).toBe(true);
    expect(vm.months[0].partial).toBe(true);
    expect(vm.weeks.slice(1, -1).every((w) => !w.partial)).toBe(true);
    expect(vm.weeks[1].recovery).toBeGreaterThan(0);
  });
});

describe("Behaviours", () => {
  it("a hidden behaviour leaves the check-in, keeps its answers, History labels and insights", async () => {
    const ctx = ctxFor(db);
    const before = await getJournalInsights("recovery", ctx);
    const all = (await getBehaviours(ctx)).tags.map((t) => t.tag);
    await selectTags(db, USER, all.filter((t) => t !== "alcohol"));
    try {
      const day = addDays(todayOf(ctx), -2);
      const j = await getJournal(day, ctx);
      expect(j.tags.some((t) => t.tag === "alcohol")).toBe(false);
      expect(j.history.some((h) => h.yes.includes("Alcohol"))).toBe(true);
      expect((await getBehaviours(ctx)).tags.find((t) => t.tag === "alcohol")).toMatchObject({ hidden: true });
      expect((await getJournalInsights("recovery", ctx))).toEqual(before);
      expect((await getMore(ctx)).behaviours).toEqual({ shown: 8, total: 9 });
    } finally {
      await selectTags(db, USER, all);
    }
  });

  it("sorts the defaults into the journal's sections, and new custom tags go last", async () => {
    const ctx = ctxFor(db);
    await addTag(db, USER, "cold_plunge", "Cold plunge");
    const tags = (await getJournal(todayOf(ctx), ctx)).tags;
    expect(tags.filter((t) => t.section === "daytime").map((t) => t.tag)).toEqual(["late_caffeine", "meditation", "stretching", "sauna"]);
    expect(tags.filter((t) => t.section === "nighttime").map((t) => t.tag)).toEqual(["alcohol", "late_meal", "screen_in_bed"]);
    expect(tags.at(-1)).toMatchObject({ tag: "cold_plunge", section: "custom", question: "Cold plunge?", hidden: false });
  });
});

describe("getMore and getYourData", () => {
  it("count reports, behaviours, days and answers", async () => {
    const ctx = ctxFor(db);
    const more = await getMore(ctx);
    const archive = await getReportArchive(ctx);
    expect(more.reportCount).toBe(archive.weeks.length + archive.months.length);
    expect(more.latestWeek).not.toBeNull();
    const data = await getYourData(ctx);
    expect(data.days).toBe(180);
    expect(data.answers).toBe((await row<{ n: number }>(db, sql`select count(*) n from journal_entries where user_id = ${USER}`))!.n);
    expect(data.first).toBe((await row<{ d: string }>(db, sql`select min(day)::text d from daily_scores where user_id = ${USER}`))!.d);
    expect(await getYourData(ctxFor(await freshDb({ install: false })))).toMatchObject({ first: null, days: 0, answers: 0 });
  });
});
