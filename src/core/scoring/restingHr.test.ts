import { describe, expect, it } from "vitest";
import { minHrMinutes, sessionRestingHR } from "./restingHr";
import type { HrSample } from "./types";

const hr = (ts: number, bpm: number): HrSample => ({ ts, bpm });
const run = (from: number, to: number, bpm: number) => Array.from({ length: to - from }, (_, i) => hr(from + i, bpm));
// noop's fixtures have well under 30 minutes of HR, so they run with the pulse coverage gate off.
const noop = (start: number, end: number, samples: HrSample[]) => sessionRestingHR(start, end, samples, 0);

describe("SleepStagerWindowEndpointTest: sessionRestingHR", () => {
  it("a sample on an aligned or non-aligned end reaches a bin", () => {
    expect(noop(0, 300, Array(5).fill(hr(300, 60)))).toBe(60);
    expect(noop(0, 450, Array(5).fill(hr(450, 60)))).toBe(60);
  });

  it("the endpoint sample lands in the final bin only", () => {
    expect(noop(0, 600, [...run(0, 300, 70), ...Array(5).fill(hr(600, 40))])).toBe(40);
  });

  it("a zero-length window is one closed bin", () => {
    expect(noop(1000, 1000, Array(5).fill(hr(1000, 58)))).toBe(58);
  });

  it("endpoint sweep matches the Swift oracle", () => {
    const expected = [
      62, 68, 69, 69, 70, 70, 70, 70, 70, 70, 70, 70, 70, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60,
      60, 60, 60, 60, 60, 60, 60,
    ];
    let i = 0;
    for (let endTs = 0; endTs <= 900; endTs += 25) {
      expect(noop(0, endTs, [...run(0, 300, 70), ...Array(5).fill(hr(endTs, 60))]), `end=${endTs}`).toBe(expected[i++]);
    }
  });

  it("thin and implausible bins cannot win the floor", () => {
    expect(noop(0, 600, [...run(0, 300, 60), hr(600, 38)])).toBe(60);
    expect(noop(0, 600, [...run(0, 300, 60), ...run(300, 600, 20)])).toBe(60);
    expect(noop(0, 600, [...run(0, 300, 70), ...Array(4).fill(hr(600, 40))])).toBe(70);
    expect(noop(0, 600, [...run(0, 300, 60), ...run(300, 600, 24)])).toBe(60);
  });

  it("all bins gated falls back to the ungated min; a dense night is unchanged", () => {
    expect(noop(0, 600, [hr(0, 40), hr(300, 50)])).toBe(40);
    expect(noop(0, 1800, run(0, 1800, 60))).toBe(60);
  });

  it("no samples in the window is null", () => {
    expect(noop(0, 600, [hr(700, 60)])).toBeNull();
  });
});

describe("plan scenarios", () => {
  // Fitbit cadence: one sample every 2 s.
  const night = (start: number, minutes: number, bpmAt: (t: number) => number) =>
    Array.from({ length: minutes * 30 }, (_, i) => hr(start + i * 2, bpmAt(start + i * 2)));

  it("the lowest gated 5-minute mean inside the main sleep", () => {
    const start = 1_000_000;
    // 8 h: 60 bpm, dipping to 50 for 20 minutes at hour 4; a 45 bpm dip just outside the window is ignored.
    const samples = [
      ...night(start - 1200, 20, () => 45),
      ...night(start, 480, (t) => (t >= start + 4 * 3600 && t < start + 4 * 3600 + 1200 ? 50 : 60)),
    ];
    expect(sessionRestingHR(start, start + 480 * 60, samples)).toBe(50);
  });

  it("a sleep with under 30 minutes of HR is null", () => {
    expect(minHrMinutes).toBe(30);
    const start = 0;
    expect(sessionRestingHR(start, 8 * 3600, night(start, 29, () => 55))).toBeNull();
    expect(sessionRestingHR(start, 8 * 3600, night(start, 30, () => 55))).toBe(55);
  });
});
