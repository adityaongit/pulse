import { describe, expect, it } from "vitest";
import { energyBank, energyBankConfig, minuteLoad, type EnergyBankInput } from "./energyBank";

const start = 1_790_000_000 - (1_790_000_000 % 86_400);
const N = 1440;
const ts = (h: number, min = 0) => start + (h * 60 + min) * 60;
const fill = <T>(v: T, f: (m: number) => T | undefined = () => undefined): T[] => Array.from({ length: N }, (_, m) => f(m) ?? v);
/** Medium stress all day (neither drains nor recharges), no load: only the basal drain. */
const day = (over: Partial<EnergyBankInput> = {}): EnergyBankInput => ({
  start,
  wake: ts(7),
  until: ts(23),
  recovery: 70,
  sleepPerformance: 80,
  load: fill<number | null>(0),
  stress: fill<number | null>(1.5),
  naps: [],
  ...over,
});
const inHour = (h: number) => (m: number) => m >= h * 60 && m < (h + 1) * 60;

describe("energyBank", () => {
  it("starts at wake at 0.6·recovery + 0.4·sleep performance", () => {
    const r = energyBank(day());
    expect(r.startLevel).toBeCloseTo(0.6 * 70 + 0.4 * 80, 10);
    expect(r.curve[7 * 60 - 1]).toBeNull();
    expect(r.curve[7 * 60]).toBeCloseTo(74 - energyBankConfig.k0, 10);
    expect(r.curve[23 * 60]).toBeNull();
    expect(r.current).toBeCloseTo(74 - 16 * 60 * energyBankConfig.k0, 8);
  });

  it("a rest day drains less than a workout day", () => {
    const rest = energyBank(day());
    const load = fill<number | null>(0, (m) => (inHour(18)(m) ? 3 : undefined));
    const workout = energyBank(day({ load, workouts: [{ start: ts(18), end: ts(19), label: "Tempo run" }] }));
    expect(workout.current).toBeLessThan(rest.current);
    expect(rest.current - workout.current).toBeCloseTo(60 * 3 * energyBankConfig.k1, 8);
    expect(workout.topDrains[0]).toMatchObject({ label: "Tempo run", kind: "workout", start: ts(18), end: ts(19) });
  });

  it("high stress drains and calm still minutes recharge", () => {
    const base = energyBank(day()).current;
    expect(energyBank(day({ stress: fill<number | null>(1.5, (m) => (inHour(10)(m) ? 2.5 : undefined)) })).current).toBeLessThan(base);
    expect(energyBank(day({ stress: fill<number | null>(1.5, (m) => (inHour(10)(m) ? 0.3 : undefined)) })).current).toBeGreaterThan(base);
    // Unscored minutes (null) only carry the basal drain.
    expect(energyBank(day({ stress: fill<number | null>(null) })).current).toBeCloseTo(base, 10);
  });

  it("a nap raises the curve", () => {
    const nap = { start: ts(14), end: ts(14, 30) };
    const without = energyBank(day());
    const withNap = energyBank(day({ naps: [nap] }));
    expect(withNap.current).toBeGreaterThan(without.current);
    expect(withNap.curve[14 * 60 + 29]!).toBeGreaterThan(withNap.curve[14 * 60 - 1]!);
  });

  it("never leaves [0, 100]", () => {
    const drained = energyBank(day({ load: fill<number | null>(5), stress: fill<number | null>(3) }));
    expect(drained.current).toBe(0);
    const full = energyBank(day({ recovery: 100, sleepPerformance: 100, naps: [{ start: ts(7), end: ts(23) }] }));
    expect(full.current).toBe(100);
    for (const r of [drained, full]) for (const v of r.curve) if (v != null) expect(v >= 0 && v <= 100).toBe(true);
  });

  it("stops at `until` and reports the level there", () => {
    const r = energyBank(day({ until: ts(12) }));
    expect(r.curve[12 * 60 - 1]).toBe(r.current);
    expect(r.curve[12 * 60]).toBeNull();
  });

  it("lists at most three drains, largest first, joining close minutes into one episode", () => {
    const load = fill<number | null>(0, (m) =>
      // Activity 09:00–09:09 and 09:13–09:19 (one episode), a 3-min walk at 15:00, a workout at 18:00.
      (m >= 540 && m < 550) || (m >= 553 && m < 560) ? 1 : m >= 900 && m < 903 ? 1 : inHour(18)(m) ? 4 : undefined,
    );
    const stress = fill<number | null>(1.5, (m) => (m >= 600 && m < 640 ? 2.5 : undefined));
    const r = energyBank(day({ load, stress, workouts: [{ start: ts(18), end: ts(19), label: "Intervals" }] }));
    expect(r.topDrains.map((d) => d.label)).toEqual(["Intervals", "Stress", "Activity"]);
    expect(r.topDrains[2]).toMatchObject({ start: ts(9), end: ts(9, 20) });
    expect(r.topDrains[2].amount).toBeCloseTo(17 * energyBankConfig.k1, 10);
  });
});

describe("minuteLoad", () => {
  it("gives the Edwards zone weight by %HRR", () => {
    // RHR 60, HRmax 160: 50 % HRR is 110 bpm, 90 % is 150.
    expect(minuteLoad([null, 100, 110, 125, 150, 170], 60, 160)).toEqual([null, 0, 1, 2, 5, 5]);
  });
});
