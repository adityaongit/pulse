import { describe, expect, it } from "vitest";
import { sleepRegularityIndex, sriConsistency, sriDisplay } from "./sleepRegularity";

const H = 3600;
const DAY = 24 * H;
const ws = 1_790_000_000 - (1_790_000_000 % DAY); // a UTC midnight
/** A session on day i from hour a to hour b (b may pass 24). */
const at = (i: number, a: number, b: number) => ({ start: ws + i * DAY + a * H, end: ws + i * DAY + b * H });

describe("sleepRegularityIndex", () => {
  it("an identical schedule every day gives 100", () => {
    // 23:00–07:00, including the night that runs into the first day.
    const sessions = Array.from({ length: 8 }, (_, i) => at(i - 1, 23, 31));
    expect(sleepRegularityIndex(sessions, ws)).toBe(100);
  });

  it("schedules 12 h apart on alternate days give SRI ≤ 0, shown as 0", () => {
    const sessions = Array.from({ length: 7 }, (_, i) => (i % 2 === 0 ? at(i, 0, 8) : at(i, 12, 20)));
    const sri = sleepRegularityIndex(sessions, ws)!;
    // Both awake 08–12 and 20–24 only: P = 8/24.
    expect(sri).toBeCloseTo(-100 / 3, 10);
    expect(sriDisplay(sri)).toBe(0);
    expect(sriConsistency(sri)).toBe(0);
  });

  it("pairs touching a day without data are excluded", () => {
    const sessions = [0, 1, 2, 4, 5, 6].map((i) => at(i, 0, 8));
    const covered = [true, true, true, false, true, true, true];
    expect(sleepRegularityIndex(sessions, ws, covered)).toBe(100);
    // Treated as worn, the missing night counts as awake: 2 of 6 pairs differ for 8 h.
    expect(sleepRegularityIndex(sessions, ws)).toBeCloseTo(-100 + 200 * (1 - 960 / (6 * 1440)), 10);
  });

  it("no pair of consecutive covered days gives null", () => {
    expect(sleepRegularityIndex([at(0, 0, 8)], ws, [true, false, true])).toBeNull();
    expect(sleepRegularityIndex([], ws, [true])).toBeNull();
  });

  it("a nap counts as sleep", () => {
    const nights = Array.from({ length: 7 }, (_, i) => at(i, 0, 8));
    const sri = sleepRegularityIndex([...nights, at(3, 14, 15)], ws)!;
    expect(sri).toBeCloseTo(-100 + 200 * (1 - 120 / (6 * 1440)), 10);
  });

  it("sessions outside the window are ignored", () => {
    const sessions = [...Array.from({ length: 7 }, (_, i) => at(i, 0, 8)), at(-3, 10, 12), at(9, 10, 12)];
    expect(sleepRegularityIndex(sessions, ws)).toBe(100);
  });
});

describe("display helpers", () => {
  it("clip at 0 and scale to [0, 1]", () => {
    expect(sriDisplay(-20)).toBe(0);
    expect(sriDisplay(85)).toBe(85);
    expect(sriConsistency(85)).toBe(0.85);
    expect(sriConsistency(null)).toBeNull();
  });
});
