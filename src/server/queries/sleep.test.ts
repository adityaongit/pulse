import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { cleanup, ctxFor, dayAt, seeded } from "../testing";
import { getSleep } from "./sleep";

afterAll(cleanup);

let db: Db;
beforeAll(() => {
  db = seeded();
});

describe("getSleep", () => {
  it("a normal night has performance, stages that sum to 100%, a need breakdown and ordered bedtimes", () => {
    const vm = getSleep(dayAt(150), ctxFor(db));
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
    expect(vm.summary.map((s) => s.label)).toEqual(["Hours vs. needed", "Sleep consistency", "Sleep efficiency", "Restorative sleep"]);
    expect(vm.summary.every((s) => s.status)).toBe(true);
    const consistency = vm.summary[1].metric.value!;
    expect(consistency).toBeGreaterThan(50);
    expect(consistency).toBeLessThanOrEqual(100);
    const plans = vm.planner.value!.plans;
    expect(plans[0].bedtimeAt).toBeLessThan(plans[1].bedtimeAt);
    expect(plans[1].bedtimeAt).toBeLessThan(plans[2].bedtimeAt);
    expect(vm.insight).toMatch(/^Your sleep was (optimal|sufficient|poor)\./);
    expect(vm.debtTrend.points).toHaveLength(182);
  });

  it("calibrates the need and the planner in the first week", () => {
    const vm = getSleep(dayAt(3), ctxFor(db));
    expect(vm.hoursVsNeed.value?.calibrating).toBe(true);
    expect(vm.hoursVsNeed.value?.needMin).toBe(480);
    expect(vm.planner).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 3 });
  });

  it("band-off nights read 'band not worn'; today before wake reads 'awaiting sleep sync'", () => {
    const off = getSleep(dayAt(156), ctxFor(db));
    expect(off.performance.reason).toBe("band_not_worn");
    expect(off.stages).toMatchObject({ value: null, reason: "band_not_worn" });
    expect(off.hoursVsNeed.reason).toBe("band_not_worn");

    const before = Date.parse("2026-10-02T05:00:00+05:30") / 1000;
    const morning = getSleep(dayAt(179), ctxFor(seeded([before]), before));
    expect(morning.performance.reason).toBe("awaiting_sleep_sync");
    expect(morning.stages).toMatchObject({ value: null, reason: "awaiting_sleep_sync" });
  });

  it("the short-sleep streak builds sleep debt", () => {
    const debt = (i: number) => getSleep(dayAt(i), ctxFor(db)).details.find((s) => s.key === "debt")!.metric.value!;
    expect(debt(172)).toBeGreaterThan(debt(167) + 60);
  });
});
