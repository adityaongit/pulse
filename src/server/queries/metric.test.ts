import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { type Db, row, sql } from "../db";
import { dailyMetrics, dailyValues, dashboardMetrics, loggedEntries } from "../db/schema";
import { readSamples } from "../samples";
import { localMidnight } from "../time";
import { copyDb, ctxFor, dayAt, seeded, TZ, USER } from "../testing";

import { DETAIL_KEYS, getMetricDetail, rangeStats, STEP_TARGET, WEEKLY_TARGET, type Section } from "./metric";
import { getHome } from "./home";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

const putValue = (c: Db, day: string, key: string, value: number) =>
  c.insert(dailyValues).values({ userId: USER, day, key, value }).onConflictDoUpdate({ target: [dailyValues.userId, dailyValues.day, dailyValues.key], set: { value } });
const metricOn = async (c: Db, day: string) =>
  (await c.select().from(dailyMetrics).where(and(eq(dailyMetrics.userId, USER), eq(dailyMetrics.day, day))))[0];

const TODAY = dayAt(179);
const PAST = dayAt(170);
const section = <K extends Section["kind"]>(s: Section[], kind: K) => s.find((x) => x.kind === kind) as Extract<Section, { kind: K }> | undefined;

function finiteEverywhere(v: unknown, path = "vm"): void {
  if (typeof v === "number") expect(Number.isFinite(v), path).toBe(true);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) finiteEverywhere(x, `${path}.${k}`);
}

describe("getMetricDetail", () => {
  it("builds every metric, today and on a past day, with finite numbers and honest empty states", async () => {
    for (const key of DETAIL_KEYS)
      for (const day of [TODAY, PAST]) {
        const vm = await getMetricDetail(key, day, ctxFor(db));
        finiteEverywhere(vm, `${key}@${day}`);
        if (vm.value.value === null) expect(vm.value.reason).toBeTruthy();
        if (vm.history.value === null) expect(vm.history.reason).toBe("no_data");
        else expect(vm.history.value).toHaveLength(365);
      }
  });

  it("nightly vital pages match dashboard values and open the selected metric", async () => {
    const vitals = ["hrv", "rhr", "resp", "spo2", "skin"] as const;
    await db.insert(dashboardMetrics).values(vitals.map((key, position) => ({ userId: USER, key, position })));
    const home = await getHome(PAST, ctxFor(db)).finally(() => db.delete(dashboardMetrics).where(eq(dashboardMetrics.userId, USER)));
    for (const key of vitals) {
      const detail = await getMetricDetail(key, PAST, ctxFor(db));
      const dashboard = home.keyStats.find((s) => s.key === key)!;
      expect(dashboard.href).toBe(`/metric/${key}`);
      expect(detail.label).toBe(dashboard.label);
      expect(detail.value).toEqual(dashboard.metric);
      expect(detail.total).toBe(false);
      expect(detail.history.value?.at(-1)?.day).toBe(PAST);
      expect(detail.history.value?.at(-1)?.value).toBe(detail.value.value);
    }
  });

  it("missing nightly vitals keep sync reasons without borrowing another user's reading", async () => {
    const ctx = ctxFor(db, undefined, 99999);
    for (const key of ["hrv", "rhr", "resp", "spo2", "skin"] as const) {
      const detail = await getMetricDetail(key, TODAY, ctx);
      expect(detail.value).toMatchObject({ value: null, reason: "awaiting_sleep_sync" });
      expect(detail.history).toMatchObject({ value: null, reason: "no_data" });
      expect(detail.valueDay).toBeNull();
    }
  });

  it("steps: the day's value against its prior 30 days, today a gap in history, hours summing the stored steps", async () => {
    const vm = await getMetricDetail("steps", PAST, ctxFor(db));
    const steps = async (d: string) => (await metricOn(db, d))?.steps ?? null;
    expect(vm.value.value).toBe(await steps(PAST));
    const prior = (await Promise.all(Array.from({ length: 30 }, (_, k) => steps(dayAt(169 - k))))).filter((x): x is number => x != null);
    expect(vm.average).toBeCloseTo(prior.reduce((a, b) => a + b, 0) / prior.length, 6);
    const hours = section(vm.sections, "hourly")!.hours.value!;
    const start = localMidnight(PAST, TZ);
    const sum = (await readSamples(db, "steps", USER, start, start + 86400)).reduce((a, x) => a + x.v, 0);
    expect(hours).toHaveLength(24);
    expect(hours.reduce((a, h) => a + (h.value ?? 0), 0)).toBe(sum);
    expect(vm.chart.reference).toEqual({ y: STEP_TARGET, label: "7,000" });
    expect(section(vm.sections, "weekday")!.days.map((d) => d.label)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    const today = await getMetricDetail("steps", TODAY, ctxFor(db));
    expect(today.soFar).toBe(true);
    expect(today.history.value!.at(-1)!.value).toBeNull();
    // 14:00: the hours after now are gaps, not zeros.
    expect(section(today.sections, "hourly")!.hours.value!.slice(15).every((h) => h.value === null)).toBe(true);
  });

  it("sedentary time: the longest stretch without steps stays inside 07:00-22:00", async () => {
    const still = section((await getMetricDetail("sedentary_minutes", PAST, ctxFor(db))).sections, "hourly")!.still!;
    const start = localMidnight(PAST, TZ) * 1000;
    expect(still.from).toBeGreaterThanOrEqual(start + 7 * 3600_000);
    expect(still.to).toBeLessThanOrEqual(start + 22 * 3600_000);
    expect(still.minutes).toBe(Math.round((still.to - still.from) / 60_000));
  });

  it("steps goal: the streak runs back from the day, today counting only once it is met", async () => {
    const c = await copyDb(db);
    const set = (steps: number, day: string) => c.update(dailyMetrics).set({ steps }).where(and(eq(dailyMetrics.userId, USER), eq(dailyMetrics.day, day)));
    for (let k = 1; k <= 40; k++) await set(k <= 4 ? STEP_TARGET + 500 : 1000, dayAt(179 - k));
    await set(200, TODAY);
    const g = section((await getMetricDetail("steps", TODAY, ctxFor(c))).sections, "goal")!;
    expect(g).toMatchObject({ streak: 4, met: 4, days: 30 });
    expect(g.longest).toBeGreaterThanOrEqual(4);
    await set(STEP_TARGET, TODAY);
    expect(section((await getMetricDetail("steps", TODAY, ctxFor(c))).sections, "goal")!.streak).toBe(5);
  });

  it("calories: each day's parts add up to its total; workouts list the day's exercises", async () => {
    const vm = await getMetricDetail("calories", PAST, ctxFor(db));
    expect(vm.chart.stack).toBe("calories");
    for (const p of vm.history.value!.filter((x) => x.parts)) expect(p.parts!.active + p.parts!.resting).toBeCloseTo(p.value!, 6);
    const { n } = (await row<{ n: number }>(db, sql`select count(*) n from exercises where user_id = ${USER} and day = ${PAST}`))!;
    expect(section(vm.sections, "workouts")!.items).toHaveLength(n);
  });

  it("active minutes: this week's total and twelve weeks against 150", async () => {
    const vm = await getMetricDetail("active_minutes", PAST, ctxFor(db));
    const w = section(vm.sections, "weekly")!;
    const { sum } = (await row<{ sum: number }>(
      db,
      sql`select coalesce(sum(value), 0) sum from daily_values where user_id = ${USER} and key = 'active_minutes' and day >= ${w.week.from} and day <= ${PAST}`,
    ))!;
    expect(w.week.total).toBeCloseTo(sum, 6);
    expect(w.target).toBe(WEEKLY_TARGET);
    expect(w.weeks).toHaveLength(12);
    expect(w.met).toBe(w.weeks.filter((x) => (x.value ?? 0) >= WEEKLY_TARGET).length);
    expect(section(vm.sections, "intensity")!.rows.map((r) => r.key)).toEqual(["active_minutes", "light_minutes", "sedentary_minutes"]);
  });

  it("weight: the latest reading on or before the day, with its changes and readings", async () => {
    const vm = await getMetricDetail("weight", PAST, ctxFor(db));
    const latest = (await row<{ day: string; w: number }>(
      db,
      sql`select day::text, weight_kg w from daily_metrics where user_id = ${USER} and weight_kg is not null and day <= ${PAST} order by day desc limit 1`,
    ))!;
    expect(vm.valueDay).toBe(latest.day);
    expect(vm.value.value).toBe(latest.w);
    expect(vm.chart.smooth).toBe(7);
    expect(section(vm.sections, "readings")!.items[0]).toEqual({ day: latest.day, value: latest.w });
  });

  it("vitals: days outside mean ± 2 SD of the last 90 are listed", async () => {
    const c = await copyDb(db);
    for (let k = 0; k < 90; k++) await putValue(c, dayAt(170 - k), "avg_hr", 70 + (k % 3));
    await putValue(c, dayAt(160), "avg_hr", 110);
    const vm = await getMetricDetail("avg_hr", PAST, ctxFor(c));
    expect(section(vm.sections, "outliers")!.items).toEqual([{ day: dayAt(160), value: 110, dir: "high" }]);
    expect(vm.chart.baseline!.mean).toBeGreaterThan(70);
  });

  it("nutrition: the day's logged entries, eaten vs burned and the protein reference", async () => {
    const c = await copyDb(db);
    const ts = localMidnight(PAST, TZ) + 13 * 3600;
    await c.insert(loggedEntries).values({ userId: USER, id: "e1", type: "nutrition-log", ts, day: PAST, data: { meal: "lunch", kcal: 650, proteinG: 30 }, createdAt: ts });
    await putValue(c, PAST, "calories_in", 2000);
    await putValue(c, PAST, "protein", 90);
    const vm = await getMetricDetail("calories_in", PAST, ctxFor(c));
    expect(section(vm.sections, "entries")!.items.map((e) => e.id)).toEqual(["e1"]);
    const burned = (await metricOn(c, PAST)).calories!;
    expect(section(vm.sections, "balance")!.rows.find((r) => r.key === "balance")!.metric.value).toBeCloseTo(2000 - burned, 6);
    expect(section(vm.sections, "macros")!.rows.map((r) => r.key)).toContain("protein_target");
  });

  it("is honest when Google has never sent the metric", async () => {
    const vm = await getMetricDetail("glucose", PAST, ctxFor(db));
    expect(vm.value).toMatchObject({ value: null, reason: "no_data" });
    expect(vm.history).toMatchObject({ value: null, reason: "no_data" });
    expect(vm.sections).toEqual([]);
  });
});

describe("rangeStats", () => {
  it("averages, extremes, total and coverage over the last n, against the n before", async () => {
    const days = ["a", "b", "c", "d", "e", "f"];
    expect(rangeStats([1, 3, 5, null, 2, 8], days, 3, true)).toEqual({
      average: 5,
      prior: 3,
      high: { day: "f", value: 8 },
      low: { day: "e", value: 2 },
      total: 10,
      withData: 2,
      days: 3,
    });
    expect(rangeStats([null, null], ["a", "b"], 1, true)).toMatchObject({ average: null, prior: null, high: null, total: null, withData: 0 });
  });
});
