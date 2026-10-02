import { describe, expect, it } from "vitest";
import type { BaselineState, HrSample } from "../scoring/types";
import { minuteMeanHr, stress, stressConfig, stressLevel, type StressInput } from "./stress";

const start = 1_790_000_000 - (1_790_000_000 % 86_400); // a UTC midnight
const N = 1440;
/** Four readings a minute at `bpm(m)`; null skips the minute. */
const hrFrom = (bpm: (m: number) => number | null): HrSample[] =>
  Array.from({ length: N }, (_, m) => bpm(m)).flatMap((b, m) =>
    b == null ? [] : [0, 15, 30, 45].map((s) => ({ ts: start + m * 60 + s, bpm: b })),
  );
const trusted: BaselineState = { baseline: 70, spread: 4 / 1.253, nValid: 30, nightsSinceUpdate: 0, status: "trusted" };
const run = (over: Partial<StressInput> = {}) =>
  stress({ start, end: start + N * 60, hr: hrFrom(() => 70), steps: [], excluded: [], baseline: trusted, ...over });
const at = (h: number, min = 0) => h * 60 + min;

describe("stressLevel", () => {
  it("maps z = 0 near 0 and +3σ above 2, within (0, 3)", () => {
    expect(stressLevel(0)).toBeCloseTo(0.286, 3);
    expect(stressLevel(3)).toBeCloseTo(2.714, 3);
    expect(stressLevel(stressConfig.z0)).toBe(1.5);
    expect(stressLevel(-50)).toBeGreaterThanOrEqual(0);
    expect(stressLevel(50)).toBeLessThanOrEqual(3);
  });
});

describe("stress", () => {
  it("a still minute at baseline HR reads near 0", () => {
    const r = run();
    expect(r.minutes[at(10)]).toBeLessThan(0.5);
    expect(r.provisional).toBe(false);
    expect(r.sigmaBpm).toBeCloseTo(4, 10);
  });

  it("a still minute at +3σ reads at least 2", () => {
    const r = run({ hr: hrFrom((m) => (m === at(10) ? 82 : 70)) });
    expect(r.minutes[at(10)]).toBeGreaterThanOrEqual(2);
  });

  it("excludes minutes with steps within ±2 minutes", () => {
    const steps: number[] = [];
    steps[at(12)] = 30;
    const r = run({ steps });
    for (let d = -2; d <= 2; d++) expect(r.minutes[at(12) + d]).toBeNull();
    expect(r.minutes[at(12) - 3]).not.toBeNull();
    expect(r.minutes[at(12) + 3]).not.toBeNull();
  });

  it("excludes workout and sleep minutes, including partly covered ones", () => {
    const workout = { start: start + at(18) * 60 + 30, end: start + at(19) * 60 };
    const sleep = { start: start, end: start + at(7) * 60 };
    const r = run({ excluded: [workout, sleep] });
    expect(r.minutes[at(18)]).toBeNull();
    expect(r.minutes[at(18, 59)]).toBeNull();
    expect(r.minutes[at(19)]).not.toBeNull();
    expect(r.minutes.slice(0, at(7)).every((v) => v == null)).toBe(true);
    expect(r.minutes[at(7)]).not.toBeNull();
  });

  it("minutes without HR are not scored", () => {
    const r = run({ hr: hrFrom((m) => (m < at(9) ? null : 70)) });
    expect(r.minutes[at(8, 59)]).toBeNull();
    expect(r.hourly[8]).toBeNull();
    expect(r.hourly[9]).toBeCloseTo(stressLevel(0), 10);
  });

  it("falls back to the fixed σ, marked provisional, while the baseline is not usable", () => {
    const calibrating: BaselineState = { ...trusted, nValid: 2, status: "calibrating" };
    const r = run({ baseline: calibrating, hr: hrFrom((m) => (m === at(10) ? 82 : 70)) });
    expect(r.provisional).toBe(true);
    expect(r.sigmaBpm).toBeCloseTo(15 / 1.96, 10);
    expect(r.referenceHr).toBe(70);
    expect(r.minutes[at(10)]).toBeCloseTo(stressLevel(12 / (15 / 1.96)), 10);
  });

  it("with no accepted baseline day, scores against today's own aggregate", () => {
    const empty: BaselineState = { baseline: 97.5, spread: 3, nValid: 0, nightsSinceUpdate: 1, status: "calibrating" };
    // Waking hours 06–21 at 60 + hour: P10 of 66..81 is 67.5.
    const r = run({ baseline: empty, hr: hrFrom((m) => 60 + Math.floor(m / 60)) });
    expect(r.dayAggregate).toBeCloseTo(67.5, 10);
    expect(r.referenceHr).toBeCloseTo(67.5, 10);
    expect(r.provisional).toBe(true);
  });

  it("dayAggregate is P10 of waking hours with enough still minutes", () => {
    const steps: number[] = [];
    // Hour 6 has HR 50 but is mostly moving, so it drops out.
    for (let m = at(6); m < at(6, 50); m++) steps[m] = 10;
    const r = run({ steps, hr: hrFrom((m) => (m < at(7) ? 50 : 70)) });
    expect(r.dayAggregate).toBe(70);
  });

  it("summarises minutes by band, the hourly means and the average", () => {
    // 10:00–10:29 at +3σ (high), 10:30–10:59 at +1.5σ (1.5, medium), the rest at baseline (low).
    const hr = hrFrom((m) => (m >= at(10) && m < at(10, 30) ? 82 : m >= at(10, 30) && m < at(11) ? 76 : 70));
    const r = run({ hr });
    expect(r.highMin).toBe(30);
    expect(r.mediumMin).toBe(30);
    expect(r.lowMin).toBe(N - 60);
    expect(r.hourly).toHaveLength(24);
    expect(r.hourly[10]).toBeCloseTo((stressLevel(3) + 1.5) / 2, 10);
    expect(r.average).toBeCloseTo((30 * stressLevel(3) + 30 * 1.5 + (N - 60) * stressLevel(0)) / N, 10);
  });

  it("an empty day scores nothing", () => {
    const r = run({ hr: [] });
    expect(r.average).toBeNull();
    expect(r.lowMin + r.mediumMin + r.highMin).toBe(0);
    expect(r.dayAggregate).toBeNull();
  });
});

describe("minuteMeanHr", () => {
  it("averages each minute and ignores samples outside the grid", () => {
    const hr = [
      { ts: start - 1, bpm: 200 },
      { ts: start, bpm: 60 },
      { ts: start + 59, bpm: 70 },
      { ts: start + 120, bpm: 80 },
      { ts: start + 180, bpm: 200 },
    ];
    expect(minuteMeanHr(hr, start, start + 180)).toEqual([65, null, 80]);
  });
});
