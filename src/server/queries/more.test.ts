// The More hub's view models (U21): Trends, the reports archive, Behaviours, More itself and Your data.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Db, openDb } from "../db";
import { addTag, reorderTags, setTagHidden } from "../journalTags";
import { cleanup, ctxFor, seeded } from "../testing";
import { addDays } from "../time";
import { getBehaviours, getJournal, getJournalInsights } from "./journal";
import { getReportArchive } from "./reports";
import { getMore, getYourData } from "./settings";
import { getTrends, parseTrendMetric, TREND_METRICS } from "./trends";
import { todayOf } from "./common";

let db: Db;
beforeAll(() => {
  db = seeded();
});
afterAll(cleanup);

describe("getTrends", () => {
  it("returns a year ending today, and each range's average against the range before it", () => {
    const ctx = ctxFor(db);
    const vm = getTrends("recovery", ctx);
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

  it("leaves today a gap for metrics that accrue through the day", () => {
    const ctx = ctxFor(db);
    for (const key of ["strain", "steps", "stress"] as const) expect(getTrends(key, ctx).points.value!.at(-1)!.value).toBeNull();
    expect(getTrends("hrv", ctx).points.value!.some((p) => p.value !== null)).toBe(true);
  });

  it("every metric yields finite values on the demo, and unknown keys fall back to Recovery", () => {
    const ctx = ctxFor(db);
    for (const m of TREND_METRICS) expect(getTrends(m.key, ctx).points.value!.some((p) => p.value !== null), m.key).toBe(true);
    expect(parseTrendMetric("nope").key).toBe("recovery");
    expect(parseTrendMetric(["hrv"]).key).toBe("hrv");
  });

  it("is honest with no data: no_data, or calibrating with nights left for a new Recovery", () => {
    const empty = openDb(":memory:");
    expect(getTrends("hrv", ctxFor(empty)).points).toMatchObject({ value: null, reason: "no_data" });
    // Day 3 of a new instance: Recovery stores its calibrating reason, as the pipeline does before 7 nights.
    const ctx = ctxFor(empty);
    empty.$client
      .prepare("insert into daily_scores (day, scoring_version, recovery) values (?, 1, ?)")
      .run(todayOf(ctx), JSON.stringify({ value: null, reason: "calibrating", nightsLeft: 4, provisional: false, stale: [], terms: [], updated: false }));
    expect(getTrends("recovery", ctx).points).toEqual({ value: null, reason: "calibrating", provisional: false, nightsLeft: 4 });
    expect(getTrends("hrv", ctx).points).toMatchObject({ value: null, reason: "no_data" });
  });
});

describe("getReportArchive", () => {
  it("lists every week and month with data, newest first, flagging partial ones", () => {
    const vm = getReportArchive(ctxFor(db));
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
  it("a hidden behaviour leaves the check-in, keeps its answers, History labels and insights", () => {
    const ctx = ctxFor(db);
    const before = getJournalInsights("recovery", ctx);
    const answers = getBehaviours(ctx).tags.find((t) => t.tag === "alcohol")!.answers;
    expect(answers).toBeGreaterThan(0);
    setTagHidden(db, "alcohol", true);
    try {
      const day = addDays(todayOf(ctx), -2);
      const j = getJournal(day, ctx);
      expect(j.tags.some((t) => t.tag === "alcohol")).toBe(false);
      expect(j.history.some((h) => h.yes.includes("Alcohol"))).toBe(true);
      expect(getBehaviours(ctx).tags.find((t) => t.tag === "alcohol")).toMatchObject({ hidden: true, answers });
      expect(getJournalInsights("recovery", ctx)).toEqual(before);
      expect(getMore(ctx).behaviours).toEqual({ shown: 8, total: 9 });
    } finally {
      setTagHidden(db, "alcohol", false);
    }
  });

  it("orders each group by position, and new custom tags go last", () => {
    const ctx = ctxFor(db);
    expect(reorderTags(db, ["sauna", "meditation", "stretching"])).toBe(true);
    addTag(db, "cold_plunge", "Cold plunge");
    const tags = getJournal(todayOf(ctx), ctx).tags;
    expect(tags.filter((t) => t.group === "recovery").map((t) => t.tag)).toEqual(["sauna", "meditation", "stretching"]);
    expect(tags.filter((t) => t.group === "evening").map((t) => t.tag)).toEqual(["alcohol", "late_caffeine", "late_meal", "screen_in_bed"]);
    expect(tags.at(-1)).toMatchObject({ tag: "cold_plunge", group: "custom", hidden: false });
    expect(reorderTags(db, ["sauna", "unknown"])).toBe(false);
  });
});

describe("getMore and getYourData", () => {
  it("count reports, behaviours, days and answers", () => {
    const ctx = ctxFor(db);
    const more = getMore(ctx);
    const archive = getReportArchive(ctx);
    expect(more.reportCount).toBe(archive.weeks.length + archive.months.length);
    expect(more.latestWeek).not.toBeNull();
    const data = getYourData(ctx);
    expect(data.days).toBe(180);
    expect(data.answers).toBe(db.$client.prepare("select count(*) from journal_entries").pluck().get());
    expect(data.first).toBe(db.$client.prepare("select min(day) from daily_scores").pluck().get());
    expect(getYourData(ctxFor(openDb(":memory:")))).toMatchObject({ first: null, days: 0, answers: 0 });
  });
});
