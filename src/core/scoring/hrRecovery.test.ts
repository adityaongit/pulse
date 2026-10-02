import { describe, expect, it } from "vitest";
import { hrRecovery } from "./hrRecovery";
import type { HrSample } from "./types";

const end = 10_000;
const s = (ts: number, bpm: number): HrSample => ({ ts, bpm });
const span = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

const denseEligible = (endHr = 170) => span(end - 300, end).map((ts) => s(ts, ts >= end - 30 ? endHr : 145));
const window = (minutes: number, values: number[]) => {
  const target = end + minutes * 60;
  return values.map((bpm, i) => s(target - Math.floor(values.length / 2) + i, bpm));
};
const result = (eligibility: HrSample[]) => hrRecovery([...eligibility, ...window(1, [140, 140, 140])], end - 300, end, 200);

describe("HeartRateRecoveryTest", () => {
  it("calculates 1, 2 and 5 minute drops from robust readings", () => {
    const samples = [
      ...denseEligible(),
      ...window(1, [146, 146, 220, 146, 146]),
      ...window(2, [132, 132, 132]),
      ...window(5, [112, 112, 112]),
    ];
    expect(hrRecovery(samples.reverse(), end - 300, end, 200)).toEqual({
      endHr: 170,
      after1Minute: 24,
      after2Minutes: 38,
      after5Minutes: 58,
    });
  });

  it("requires sustained high intensity rather than one peak", () => {
    const samples = [...span(end - 300, end).map((ts) => s(ts, 120)), s(end, 190), ...window(1, [140, 140, 140])];
    expect(hrRecovery(samples, end - 300, end, 200)).toBeNull();
  });

  it("rejects disconnected high-intensity fragments", () => {
    const sparse = span(end - 300, end, 15).map((ts) => s(ts, 170));
    expect(hrRecovery([...sparse, ...window(1, [140, 140, 140])], end - 300, end, 200)).toBeNull();
  });

  it("rejects three separated forty-second high-intensity runs", () => {
    const bpms: [number, number][] = [
      [140, 170], [130, 170], [120, 170], [110, 170], [100, 120],
      [90, 170], [80, 170], [70, 170], [60, 170], [50, 120],
      [40, 170], [30, 170], [20, 170], [10, 170], [0, 120],
    ];
    expect(result(bpms.map(([back, bpm]) => s(end - back, bpm)))).toBeNull();
  });

  it("gap exactly at cap uses the left sample; exact minimum is accepted", () => {
    const samples = [...span(end - 120, end - 10, 10).map((ts) => s(ts, 170)), s(end, 120)];
    expect(result(samples)).toEqual({ endHr: 170, after1Minute: 30, after2Minutes: null, after5Minutes: null });
  });

  it("gap over cap resets the qualifying run", () => {
    const beforeGap = span(end - 180, end - 110, 10).map((ts) => s(ts, 170));
    const afterGap = [...span(end - 99, end - 9, 10).map((ts) => s(ts, 170)), s(end, 170)];
    expect(result([...beforeGap, ...afterGap])).toBeNull();
  });

  it("below-threshold interval resets the qualifying run", () => {
    expect(result(span(end - 130, end, 10).map((ts) => s(ts, ts === end - 60 ? 120 : 170)))).toBeNull();
  });

  it("duplicate timestamp does not break an otherwise continuous run", () => {
    const samples = [...span(end - 120, end, 10).map((ts) => s(ts, 170)), s(end - 60, 120)];
    expect(result(samples)).toEqual({ endHr: 170, after1Minute: 30, after2Minutes: null, after5Minutes: null });
  });

  it("does not credit pre-workout HR toward eligibility", () => {
    expect(hrRecovery([...denseEligible(), ...window(1, [140, 140, 140])], end - 60, end, 200)).toBeNull();
  });

  it("returns only measurements with real coverage", () => {
    const samples = [...denseEligible(), ...window(1, [150, 150, 150]), ...window(5, [110, 110])];
    expect(hrRecovery(samples, end - 300, end, 200)).toEqual({ endHr: 170, after1Minute: 20, after2Minutes: null, after5Minutes: null });
  });

  it("no post-workout coverage returns null", () => {
    expect(hrRecovery(denseEligible(), end - 300, end, 200)).toBeNull();
  });

  it("a HR rise stays signed instead of clamped", () => {
    expect(hrRecovery([...denseEligible(160), ...window(1, [165, 165, 165])], end - 300, end, 200)?.after1Minute).toBe(-5);
  });
});

describe("plan U6: HRR60", () => {
  // A 2 s cadence, as Fitbit intraday HR runs.
  const workout = span(end - 300, end, 2).map((ts) => s(ts, 170));

  it("170 → 140 at +60 s gives HRR60 = 30", () => {
    const post = span(end + 2, end + 90, 2).map((ts) => s(ts, ts >= end + 45 ? 140 : 155));
    expect(hrRecovery([...workout, ...post], end - 300, end, 200)?.after1Minute).toBe(30);
  });

  it("40 s of post-workout data returns null", () => {
    const post = span(end + 2, end + 40, 2).map((ts) => s(ts, 150));
    expect(hrRecovery([...workout, ...post], end - 300, end, 200)).toBeNull();
  });
});
