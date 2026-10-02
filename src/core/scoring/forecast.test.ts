import { describe, expect, it } from "vitest";
import {
  clamp,
  defaultNeedHours,
  forecast,
  leastSquaresSlope,
  mean,
  minBandPoints,
  minBaselineNights,
  sampleSD,
  solidNeedNights,
  strainAdjCap,
  thinBandPoints,
} from "./forecast";

const fill = (n: number, v: number) => Array<number>(n).fill(v);
const steadyCharge = fill(14, 60);
const steadyEffort = fill(14, 50);
const steady = { recentCharge: steadyCharge, recentEffort: steadyEffort };

describe("RecoveryForecastTest", () => {
  it("null until enough baseline", () => {
    expect(forecast({ recentCharge: fill(minBaselineNights - 1, 60), todayEffort: 50, plannedSleepHours: 8 })).toBeNull();
    expect(forecast({ recentCharge: fill(minBaselineNights, 60), todayEffort: null, plannedSleepHours: 8 })).not.toBeNull();
  });

  it("empty charge is null", () => {
    expect(forecast({ recentCharge: [], todayEffort: 50, plannedSleepHours: 8 })).toBeNull();
  });

  it("neutral day lands on baseline", () => {
    const f = forecast({ ...steady, todayEffort: 50, plannedSleepHours: defaultNeedHours })!;
    expect(f.baseline).toBeCloseTo(60, 9);
    expect(f.charge).toBeCloseTo(60, 9);
    expect(f.nights).toBe(14);
  });

  it("harder day lowers, easier day raises", () => {
    expect(forecast({ ...steady, todayEffort: 80, plannedSleepHours: defaultNeedHours })!.charge).toBeLessThan(60);
    expect(forecast({ ...steady, todayEffort: 20, plannedSleepHours: defaultNeedHours })!.charge).toBeGreaterThan(60);
  });

  it("strain adjustment is capped", () => {
    const f = forecast({ ...steady, todayEffort: 100, plannedSleepHours: defaultNeedHours })!;
    expect(f.charge).toBeGreaterThanOrEqual(60 - strainAdjCap);
  });

  it("strain term drops without effort history", () => {
    const f = forecast({ recentCharge: steadyCharge, recentEffort: [], todayEffort: 100, plannedSleepHours: defaultNeedHours })!;
    expect(f.charge).toBeCloseTo(60, 9);
  });

  it("short sleep lowers forecast", () => {
    expect(forecast({ ...steady, todayEffort: 50, plannedSleepHours: 4 })!.charge).toBeLessThan(60);
  });

  it("oversleep help is capped", () => {
    const plenty = forecast({ ...steady, todayEffort: 50, plannedSleepHours: 12 })!;
    const justOver = forecast({ ...steady, todayEffort: 50, plannedSleepHours: 10 })!;
    expect(plenty.charge).toBeCloseTo(justOver.charge, 9);
  });

  it("negative sleep treated as zero", () => {
    expect(forecast({ ...steady, todayEffort: 50, plannedSleepHours: -3 })!.plannedSleepHours).toBe(0);
  });

  it("charge and band stay in range", () => {
    const f = forecast({ recentCharge: fill(14, 8), recentEffort: steadyEffort, todayEffort: 100, plannedSleepHours: 0 })!;
    expect(f.charge).toBeGreaterThanOrEqual(0);
    expect(f.charge).toBeLessThanOrEqual(100);
    expect(f.low).toBeGreaterThanOrEqual(0);
    expect(f.high).toBeLessThanOrEqual(100);
  });

  it("thin baseline widens band and is building", () => {
    const f = forecast({ recentCharge: fill(6, 60), recentEffort: steadyEffort, todayEffort: 50, plannedSleepHours: 8 })!;
    expect(f.band).toBeCloseTo(minBandPoints + thinBandPoints, 9);
    expect(f.confidence).toBe("building");
  });

  it("full baseline with informed need is solid", () => {
    const f = forecast({ ...steady, todayEffort: 50, plannedSleepHours: 8, needNights: solidNeedNights })!;
    expect(f.confidence).toBe("solid");
    expect(f.band).toBeCloseTo(minBandPoints, 9);
  });

  it("full baseline but default need is building", () => {
    expect(forecast({ ...steady, todayEffort: 50, plannedSleepHours: 8, needNights: 0 })!.confidence).toBe("building");
  });

  it("downswing is damped", () => {
    const falling = Array.from({ length: 14 }, (_, i) => 80 - 2 * i);
    const f = forecast({ recentCharge: falling, recentEffort: steadyEffort, todayEffort: 50, plannedSleepHours: 8 })!;
    expect(f.charge).toBeGreaterThan(falling.at(-1)!);
  });

  it("stat helpers", () => {
    expect(mean([2, 4, 6])).toBeCloseTo(4, 9);
    expect(mean([])).toBe(0);
    expect(sampleSD([10])).toBe(0);
    expect(sampleSD([2, 4, 6])).toBeCloseTo(2, 9);
    expect(leastSquaresSlope([1, 2, 3, 4])).toBeCloseTo(1, 9);
    expect(leastSquaresSlope([5])).toBe(0);
  });

  it("clamp preserves the input's signed zero at inclusive bounds", () => {
    const cases: [number, number, number][] = [
      [+0, -0, 1],
      [-0, +0, 1],
      [+0, -1, -0],
      [-0, -1, +0],
    ];
    for (const [x, lo, hi] of cases) expect(Object.is(clamp(x, lo, hi), x)).toBe(true);
    expect(clamp(-1.01, -1, 1)).toBe(-1);
    expect(clamp(0.25, -1, 1)).toBe(0.25);
    expect(clamp(1.01, -1, 1)).toBe(1);
  });
});
