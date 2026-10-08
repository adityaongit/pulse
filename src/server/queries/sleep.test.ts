import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { mergeSamples } from "../samples";
import { copyDb, ctxFor, dayAt, seeded, USER } from "../testing";
import { getSleep } from "./sleep";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getSleep", () => {
  it("a normal night has performance, stages that sum to 100%, a need breakdown and ordered bedtimes", async () => {
    const vm = await getSleep(dayAt(150), ctxFor(db));
    expect(vm.performance.value).toBeGreaterThan(40);
    expect(vm.performance.value).toBeLessThanOrEqual(100);
    const stages = vm.stages!.value!;
    expect(stages.rows.map((r) => r.label)).toEqual(["Awake", "REM", "Light", "Deep"]);
    expect(stages.rows.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100, 6);
    expect(stages.segments.length).toBeGreaterThan(5);
    expect(stages.bed).toBeLessThan(stages.wake);
    const need = vm.hoursVsNeed.value!;
    expect(need.calibrating).toBe(false);
    expect(need.needMin).toBeCloseTo(need.parts.baselineMin + need.parts.strainMin + need.parts.debtMin - need.parts.napMin, 6);
    expect(vm.summary.map((s) => s.label)).toEqual(["Hours vs. needed", "Sleep consistency", "Sleep efficiency"]);
    expect(vm.summary.map((s) => s.href)).toEqual(["/trend/hours_need", "/trend/consistency", "/trend/efficiency"]);
    expect(vm.summary.every((s) => s.status)).toBe(true);
    const consistency = vm.summary[1].metric.value!;
    expect(consistency).toBeGreaterThan(50);
    expect(consistency).toBeLessThanOrEqual(100);
    const plans = vm.planner.value!.plans;
    expect(plans[0].bedtimeAt).toBeLessThan(plans[1].bedtimeAt);
    expect(plans[1].bedtimeAt).toBeLessThan(plans[2].bedtimeAt);
    expect(vm.insight).toMatch(/^Your sleep was (optimal|sufficient|poor)\./);
    // Restorative is deep + REM; efficiency places each spell awake inside the night.
    const st = vm.stages!.value!;
    const deep = st.rows.find((r) => r.stage === "deep")!.minutes;
    const rem = st.rows.find((r) => r.stage === "rem")!.minutes;
    expect(vm.restorative.value!.minutes).toBe(deep + rem);
    const eff = vm.efficiency.value!;
    expect(eff.pct).toBeCloseTo(vm.summary[2].metric.value!, 6);
    for (const w of eff.wakes) {
      expect(w.at).toBeGreaterThan(0);
      expect(w.at + w.width).toBeLessThanOrEqual(1);
    }
    expect(vm.sleepStress.value).toBeNull();
  });

  it("consistency draws five nights against the usual times", async () => {
    const vm = await getSleep(dayAt(150), ctxFor(db));
    const c = vm.consistency.value!;
    expect(c.pct).toBe(vm.summary[1].metric.value);
    expect(c.nights).toHaveLength(5);
    const night = c.nights.at(-1)!;
    expect(night.day).toBe(dayAt(150));
    expect(night.bed).toBeLessThan(night.wake); // bed before midnight reads negative, wake after it positive
    expect(night.typicalBed).not.toBeNull();
    expect(night.typicalWake).not.toBeNull();
    // Each night's optimal times come from the 14 nights before it, so they move from night to night.
    expect(new Set(c.nights.map((n) => n?.typicalBed)).size).toBeGreaterThan(1);
  });

  it("no night: consistency carries the night's reason", async () => {
    const off = await getSleep(dayAt(156), ctxFor(db));
    expect(off.consistency.value).toBeNull();
  });

  it("calibrates the need and the planner in the first week", async () => {
    const vm = await getSleep(dayAt(3), ctxFor(db));
    expect(vm.hoursVsNeed.value?.calibrating).toBe(true);
    expect(vm.hoursVsNeed.value?.needMin).toBe(480);
    expect(vm.planner).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 3 });
  });

  it("band-off nights read 'band not worn'; today before wake reads 'awaiting sleep sync'", async () => {
    const off = await getSleep(dayAt(156), ctxFor(db));
    expect(off.performance.reason).toBe("band_not_worn");
    expect(off.stages).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(off.hoursVsNeed.reason).toBe("band_not_worn");

    const before = Date.parse("2026-10-02T05:00:00+05:30") / 1000;
    const morning = await getSleep(dayAt(179), ctxFor(await seeded([before]), before));
    expect(morning.performance.reason).toBe("awaiting_sleep_sync");
    expect(morning.stages).toMatchObject({ value: null, reason: "awaiting_sleep_sync" });
  });

  it("the hours hero is the main sleep's time asleep against the prior 30 nights", async () => {
    const vm = await getSleep(dayAt(150), ctxFor(db));
    const h = vm.hours.value!;
    expect(h.asleepMin).toBe(vm.hoursVsNeed.value!.asleepMin);
    const prior = (await Promise.all(Array.from({ length: 30 }, async (_, k) => (await getSleep(dayAt(149 - k), ctxFor(db))).hours.value?.asleepMin))).filter((x): x is number => x != null);
    expect(h.average).toBeCloseTo(prior.reduce((a, b) => a + b, 0) / prior.length, 6);
    expect(h.sd).toBeGreaterThan(0);
    // The first night has nothing to compare with.
    expect((await getSleep(dayAt(0), ctxFor(db))).hours.value?.average ?? null).toBeNull();
  });

  it("the overnight HR is per minute over the sleep window plus 15 minutes each side", async () => {
    const vm = await getSleep(dayAt(150), ctxFor(db));
    const { bed, wake, points } = vm.nightHr.value!;
    const stages = vm.stages!.value!;
    expect([bed, wake]).toEqual([stages.bed, stages.wake]);
    expect(points[0].t).toBeLessThanOrEqual(bed - 15 * 60_000);
    expect(points[0].t).toBeGreaterThan(bed - 16 * 60_000);
    expect(points.at(-1)!.t).toBeLessThan(wake + 15 * 60_000);
    expect(points.every((p, i) => i === 0 || p.t - points[i - 1].t === 60_000)).toBe(true);
    const inNight = points.filter((p) => p.t >= bed && p.t < wake && p.v !== null).map((p) => p.v!);
    expect(inNight.length).toBeGreaterThan((wake - bed) / 60_000 / 2);
    expect(Math.min(...inNight)).toBeGreaterThan(30);
    expect(Math.max(...inNight)).toBeLessThan(140);
  });

  it("no sleep: the hero and the HR chart carry the night's reason", async () => {
    const off = await getSleep(dayAt(156), ctxFor(db));
    expect(off.hours).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(off.nightHr).toMatchObject({ value: null, reason: "band_not_worn" });
    const before = Date.parse("2026-10-02T05:00:00+05:30") / 1000;
    const morning = await getSleep(dayAt(179), ctxFor(await seeded([before]), before));
    expect(morning.hours.reason).toBe("awaiting_sleep_sync");
    expect(morning.nightHr.reason).toBe("awaiting_sleep_sync");
  });

  it("a night with HR samples wiped reads 'not enough heart-rate data'", async () => {
    const copy = await copyDb(db);
    const { bed, wake } = (await getSleep(dayAt(150), ctxFor(copy))).nightHr.value!;
    await mergeSamples(copy, "hr", USER, { start: bed / 1000, end: wake / 1000 }, new Map(), "replace");
    expect((await getSleep(dayAt(150), ctxFor(copy))).nightHr).toMatchObject({ value: null, reason: "insufficient_hr_data" });
  });

  it("the short-sleep streak builds sleep debt", async () => {
    const debt = async (i: number) => (await getSleep(dayAt(i), ctxFor(db))).details.find((s) => s.key === "debt")!.metric.value!;
    expect(await debt(172)).toBeGreaterThan((await debt(167)) + 60);
  });
});
