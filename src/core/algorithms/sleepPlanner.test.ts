import { describe, expect, it } from "vitest";
import { effortValueFromWhoopStrain } from "../scoring/strain";
import { isWeekendDay, sleepPlan, sleepPlannerConfig, type SleepPlannerInput, type WakeNight } from "./sleepPlanner";

const iso = (d: number) => new Date(Date.UTC(2026, 8, d)).toISOString().slice(0, 10); // September 2026
/** 14 nights, Sep 17–30: weekdays wake 07:00, weekends 09:00, efficiency 0.9. */
const nights: WakeNight[] = Array.from({ length: 14 }, (_, i) => {
  const day = iso(17 + i);
  return { day, wakeMin: isWeekendDay(day) ? 540 : 420, efficiency: 0.9 };
});
const input = (over: Partial<SleepPlannerInput> = {}): SleepPlannerInput => ({
  baselineNeedHours: 8,
  effort: effortValueFromWhoopStrain(10),
  meanEffort28: effortValueFromWhoopStrain(10),
  debtMin: 0,
  napMin: 0,
  nights,
  wakeDay: "2026-10-01", // a Thursday
  ...over,
});

describe("sleepPlan need", () => {
  it("no debt and base strain gives need = baseline", () => {
    const p = sleepPlan(input());
    expect(p.needMin).toBeCloseTo(480, 10);
    expect(p.parts).toEqual({ baselineMin: 480, strainMin: 0, debtMin: 0, napMin: 0 });
  });

  it("60 min of debt adds 12 min", () => {
    expect(sleepPlan(input({ debtMin: 60 })).needMin).toBeCloseTo(492, 10);
  });

  it("a 30-minute nap subtracts 30", () => {
    expect(sleepPlan(input({ napMin: 30 })).needMin).toBeCloseTo(450, 10);
  });

  it("adds 0.05 h per Day Strain point above the 28-day mean, never less for a light day", () => {
    expect(sleepPlan(input({ effort: effortValueFromWhoopStrain(16) })).parts.strainMin).toBeCloseTo(6 * 0.05 * 60, 8);
    expect(sleepPlan(input({ effort: effortValueFromWhoopStrain(4) })).parts.strainMin).toBe(0);
    expect(sleepPlan(input({ effort: null })).parts.strainMin).toBe(0);
  });
});

describe("sleepPlan bedtimes", () => {
  it("orders 100 % earliest, then 85 %, then 70 %", () => {
    const p = sleepPlan(input());
    expect(p.plans.map((x) => x.share)).toEqual(sleepPlannerConfig.shares);
    const [a, b, c] = p.plans.map((x) => x.bedtimeMin);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // 480 / 0.9 = 533.3 min in bed before 07:00: 22:07 the evening before.
    expect(a).toBeCloseTo(420 - 480 / 0.9, 8);
    expect(p.plans[0].inBedMin).toBeCloseTo(533.33, 1);
  });

  it("uses weekday and weekend wake times", () => {
    const weekday = sleepPlan(input({ wakeDay: "2026-10-01" }));
    const weekend = sleepPlan(input({ wakeDay: "2026-10-03" })); // a Saturday
    expect(weekday).toMatchObject({ weekend: false, wakeMin: 420 });
    expect(weekend).toMatchObject({ weekend: true, wakeMin: 540 });
    expect(weekend.plans[0].bedtimeMin - weekday.plans[0].bedtimeMin).toBeCloseTo(120, 10);
  });

  it("takes the median wake time and efficiency over the last 14 nights", () => {
    const older = Array.from({ length: 10 }, (_, i) => ({ day: iso(1 + i), wakeMin: 300, efficiency: 0.5 }));
    const odd = nights.map((n, i) => (i === 0 ? { ...n, wakeMin: 480, efficiency: null } : n));
    const p = sleepPlan(input({ nights: [...older, ...odd] }));
    expect(p.wakeMin).toBe(420);
    expect(p.efficiency).toBe(0.9);
  });

  it("falls back to all nights, then to no plan", () => {
    const weekdaysOnly = nights.filter((n) => !isWeekendDay(n.day));
    expect(sleepPlan(input({ nights: weekdaysOnly, wakeDay: "2026-10-03" })).wakeMin).toBe(420);
    const none = sleepPlan(input({ nights: [] }));
    expect(none).toMatchObject({ wakeMin: null, plans: [], efficiency: sleepPlannerConfig.defaultEfficiency });
    expect(none.needMin).toBeCloseTo(480, 10);
  });
});
