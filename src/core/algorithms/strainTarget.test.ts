import { describe, expect, it } from "vitest";
import { effortValueFromWhoopStrain } from "../scoring/strain";
import { strainTarget, strainTargetConfig } from "./strainTarget";

/** `n` days at Day Strain `s` (0–21), as Effort. */
const days = (s: number, n = 28) => Array<number | null>(n).fill(effortValueFromWhoopStrain(s));
const GREEN = 80;
const YELLOW = 50;
const RED = 20;

describe("strainTarget", () => {
  it("green with a base of 12 gives [12, 15]", () => {
    const t = strainTarget(days(12), GREEN, 1.0);
    expect(t.base).toBeCloseTo(12, 10);
    expect(t.low).toBeCloseTo(12, 10);
    expect(t.high).toBeCloseTo(15, 10);
    expect(t).toMatchObject({ band: "green", coldStart: false, acwrRule: null });
  });

  it("yellow and red scale the base down", () => {
    const y = strainTarget(days(12), YELLOW, 1.0);
    expect([y.low, y.high]).toEqual([expect.closeTo(9.6, 10), expect.closeTo(12, 10)]);
    const r = strainTarget(days(12), RED, 1.0);
    expect([r.low, r.high]).toEqual([expect.closeTo(6, 10), expect.closeTo(9, 10)]);
  });

  it("ACWR 1.4 caps the upper bound at the base, keeping the minimum width below it", () => {
    const t = strainTarget(days(12), GREEN, 1.4);
    expect(t.high).toBeCloseTo(12, 10);
    expect(t.low).toBeCloseTo(10, 10);
    expect(t.acwrRule).toBe("capped");
  });

  it("ACWR under 0.8 lifts both bounds by 10 %", () => {
    const t = strainTarget(days(12), GREEN, 0.7);
    expect(t.low).toBeCloseTo(13.2, 10);
    expect(t.high).toBeCloseTo(16.5, 10);
    expect(t.acwrRule).toBe("lifted");
  });

  it("under 14 days of strain uses the band defaults", () => {
    const history = [...Array<null>(20).fill(null), ...days(12, 13)];
    expect(strainTarget(history, GREEN, 1.0)).toMatchObject({ low: 14, high: 18, coldStart: true, base: null });
    expect(strainTarget(history, YELLOW, null)).toMatchObject({ low: 10, high: 14 });
    expect(strainTarget([], RED, null)).toMatchObject({ low: 6, high: 10 });
    // 14 days is enough.
    expect(strainTarget(days(12, 14), GREEN, null).coldStart).toBe(false);
  });

  it("uses only the last 28 days", () => {
    expect(strainTarget([...days(20, 10), ...days(10)], GREEN, null).base).toBeCloseTo(10, 10);
  });

  it("keeps width ≥ 2 and bounds within [4, 19]", () => {
    const { min, max, minWidth } = strainTargetConfig;
    for (const s of [0, 1, 3, 6, 10, 14, 17, 19, 21]) {
      for (const rec of [GREEN, YELLOW, RED]) {
        for (const acwr of [null, 0.5, 1.0, 1.4, 2.0]) {
          const t = strainTarget(days(s), rec, acwr);
          expect(t.low).toBeGreaterThanOrEqual(min);
          expect(t.high).toBeLessThanOrEqual(max);
          expect(t.high - t.low).toBeGreaterThanOrEqual(minWidth - 1e-9);
        }
      }
    }
    expect(strainTarget(days(21), GREEN, null)).toMatchObject({ low: 17, high: 19 });
    expect(strainTarget(days(1), RED, null)).toMatchObject({ low: 4, high: 6 });
  });
});
