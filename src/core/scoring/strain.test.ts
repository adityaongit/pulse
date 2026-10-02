import { describe, expect, it } from "vitest";
import {
  banisterBaseline,
  banisterBMen,
  banisterBWomen,
  banisterDailyCeiling,
  edwardsTRIMP,
  effectiveEffort,
  effortValueFromWhoopStrain,
  estimateHRmax,
  fallbackSampleMin,
  logMapDenominator,
  maxSampleGapMin,
  maxStrain,
  minSpanSeconds,
  percentile,
  sampleDurationsMinutes,
  strain,
  strainDenominator,
  toWhoopStrain,
  trimpToStrain,
  whoopMaxStrain,
  zoneMinutes,
  zoneWeight,
} from "./strain";
import type { HrSample } from "./types";

const EPS = 9; // toBeCloseTo digits ≈ 1e-9
const every = (bpm: number, n: number, stepS = 1): HrSample[] => Array.from({ length: n }, (_, i) => ({ ts: i * stepS, bpm }));

describe("ChargeEffortRestScoringTest: Effort", () => {
  it("scale constants are a pure rescale", () => {
    expect([maxStrain, whoopMaxStrain, strainDenominator]).toEqual([100, 21, 7201]);
  });

  it("WHOOP axis values map proportionally onto 0–100", () => {
    const cases: [number, number][] = [
      [0, 0], [1, 4.761904761904762], [3.5, 16.666666666666668], [7, 33.333333333333336], [10.5, 50],
      [12.5, 59.523809523809526], [14, 66.66666666666667], [17.5, 83.33333333333333], [20, 95.23809523809524], [21, 100],
    ];
    for (const [whoop, effort] of cases) expect(effortValueFromWhoopStrain(whoop)).toBe(effort);
  });

  it("trimpToStrain maps onto 0–100 at 2 dp", () => {
    expect(trimpToStrain(0)).toBe(0);
    expect(trimpToStrain(-5)).toBe(0);
    expect(trimpToStrain(100)).toBeCloseTo(51.96, EPS);
    expect(trimpToStrain(500)).toBeCloseTo(69.99, EPS);
    expect(trimpToStrain(1000)).toBeCloseTo(77.78, EPS);
    expect(trimpToStrain(3600)).toBeCloseTo(92.2, EPS);
    expect(trimpToStrain(7200)).toBeCloseTo(100, EPS);
    expect(Math.abs(trimpToStrain(1000) - (21 * Math.log(1001)) / Math.log(7201) * (100 / 21))).toBeLessThan(0.02);
  });

  it("Edwards zone goldens: 115 / 135 / 155 bpm at RHR 60, HRmax 160", () => {
    expect(strain(every(115, 600), 160, 60)).toBeCloseTo(27.0, EPS);
    expect(strain(every(135, 600), 160, 60)).toBeCloseTo(38.66, EPS);
    expect(strain(every(155, 600), 160, 60)).toBeCloseTo(44.27, EPS);
  });

  it("null with too few samples or an invalid reserve", () => {
    expect(strain(every(135, 599), 160, 60)).toBeNull();
    expect(strain(every(135, 600), 60, 60)).toBeNull();
  });

  it("sparse streams score once they span enough time, never under the sample floor", () => {
    const sparse = every(155, 30, 30);
    expect(sparse.at(-1)!.ts - sparse[0].ts).toBeGreaterThanOrEqual(minSpanSeconds);
    expect(strain(sparse, 160, 60)).not.toBeNull();
    expect(strain(every(155, 5, 200), 160, 60)).toBeNull();
  });

  it("a light day honestly scores zero; a sparse real workout scores", () => {
    expect(strain(every(105, 1200), 184, 60)).toBe(0);
    expect(strain(every(105, 40, 30), 184, 60)).toBe(0);
    expect(strain(every(175, 40, 30), 184, 60)!).toBeGreaterThan(0);
  });
});

describe("StrainSampleDurationTest", () => {
  const rest = 60;
  const max = 190;
  const reserve = max - rest;
  const hard = Math.trunc(rest + 0.85 * reserve);
  const at = (...ts: number[]): HrSample[] => ts.map((t) => ({ ts: t, bpm: hard }));

  it("a uniform series equals the old single-factor TRIMP", () => {
    const hr = every(hard, 120, 30);
    const old = hr.reduce((w, s) => w + zoneWeight(s.bpm, rest, reserve), 0) * ((hr[1].ts - hr[0].ts) / 60);
    const now = edwardsTRIMP(hr, rest, reserve, sampleDurationsMinutes(hr));
    expect(now).toBeCloseTo(old, EPS);
    expect(now).toBeCloseTo(240, EPS);
  });

  it("mixed cadence no longer collapses the window", () => {
    const hr = [...every(hard, 10), ...Array.from({ length: 120 }, (_, i) => ({ ts: 60 + i * 30, bpm: hard }))];
    expect(edwardsTRIMP(hr, rest, reserve, sampleDurationsMinutes(hr))).toBeGreaterThan(230);
  });

  it("adding context around a window never shrinks its TRIMP", () => {
    const workout = Array.from({ length: 120 }, (_, i) => ({ ts: 1000 + i * 30, bpm: hard }));
    const day = [...every(55, 60), ...workout];
    const w = edwardsTRIMP(workout, rest, reserve, sampleDurationsMinutes(workout));
    const d = edwardsTRIMP(day, rest, reserve, sampleDurationsMinutes(day));
    expect(d).toBeGreaterThanOrEqual(w - 1e-9);
  });

  it("a dropout gap is clamped; a 30 s cadence is not", () => {
    expect(sampleDurationsMinutes(at(0, 3 * 3600))).toEqual([maxSampleGapMin, maxSampleGapMin]);
    expect(sampleDurationsMinutes(every(hard, 3, 30))).toEqual([0.5, 0.5, 0.5]);
  });

  it("edges match the old fallbacks", () => {
    expect(sampleDurationsMinutes([])).toEqual([]);
    expect(sampleDurationsMinutes(at(5))).toEqual([fallbackSampleMin]);
    expect(sampleDurationsMinutes(at(7, 7))).toEqual([fallbackSampleMin, fallbackSampleMin]);
  });
});

describe("StrainBanisterDenominatorTest", () => {
  const b = (sex: string) => (sex === "female" ? banisterBWomen : banisterBMen);

  it("the daily ceiling is 24 h at full reserve", () => {
    expect(banisterDailyCeiling(banisterBMen)).toBeCloseTo(1440 * 0.64 * Math.exp(1.92), EPS);
    expect(banisterDailyCeiling(banisterBWomen)).toBeCloseTo(1440 * 0.64 * Math.exp(1.67), EPS);
  });

  it("the denominator is ceiling minus a sedentary day plus one, and a maximum day is 100 either way", () => {
    expect(trimpToStrain(7200, strainDenominator)).toBeCloseTo(100, 6);
    for (const sex of ["male", "female"]) {
      const d = logMapDenominator("banister", sex);
      expect(d).toBeCloseTo(banisterDailyCeiling(b(sex)) - banisterBaseline(1440, b(sex)) + 1, EPS);
      expect(trimpToStrain(banisterDailyCeiling(b(sex)) - banisterBaseline(1440, b(sex)), d)).toBeCloseTo(100, 6);
    }
  });

  it("the female denominator is smaller, for any spelling", () => {
    const female = logMapDenominator("banister", "female");
    expect(female).toBeLessThan(logMapDenominator("banister", "male"));
    for (const s of ["f", "F", "Female", "female"]) expect(logMapDenominator("banister", s)).toBe(female);
  });

  it("Edwards' denominator would cap Banister below full", () => {
    for (const sex of ["male", "female"]) {
      const wrong = trimpToStrain(banisterDailyCeiling(b(sex)), strainDenominator);
      expect(wrong).toBeLessThan(99);
      expect(wrong).toBeGreaterThan(90);
    }
  });

  it("Edwards is unchanged and still the default", () => {
    expect(logMapDenominator("edwards", "male")).toBe(strainDenominator);
    expect(logMapDenominator("edwards", "female")).toBe(strainDenominator);
    const s = every(150, 900);
    expect(strain(s, 190, 60)).toBe(strain(s, 190, 60, "edwards"));
    expect(strain(s, 190, 60)).not.toBeNull();
  });

  it("intermittent work fares better under Banister", () => {
    const rest = 60;
    const max = 190;
    const bpm = (pct: number) => Math.round(rest + ((max - rest) * pct) / 100);
    const lifting = Array.from({ length: 3600 }, (_, i) => ({ ts: i, bpm: i % 180 < 30 ? bpm(85) : bpm(40) }));
    const walking = every(bpm(58), 3600);
    const liftEd = strain(lifting, max, rest, "edwards")!;
    const walkEd = strain(walking, max, rest, "edwards")!;
    const liftBa = strain(lifting, max, rest, "banister")!;
    const walkBa = strain(walking, max, rest, "banister")!;
    expect(walkEd).toBeGreaterThan(liftEd);
    expect(liftBa / walkBa).toBeGreaterThan(liftEd / walkEd);
  });

  it("a session below the 50% floor scores nothing under Edwards", () => {
    const hour = every(Math.round(60 + 130 * 0.45), 3600);
    expect(strain(hour, 190, 60, "edwards")).toBe(0);
    expect(strain(hour, 190, 60, "banister")!).toBeGreaterThan(40);
  });
});

describe("EffectiveEffortTest", () => {
  it("resolves live against stored with a never-drop max", () => {
    expect(effectiveEffort(2.3, 0.5)).toBe(2.3);
    expect(effectiveEffort(0.0, 38.3)).toBe(38.3);
    expect(effectiveEffort(null, 12.5)).toBe(12.5);
    expect(effectiveEffort(4.0, null)).toBe(4.0);
    expect(effectiveEffort(null, null)).toBeNull();
    expect(effectiveEffort(0, 0)).toBe(0);
    expect(effectiveEffort(null, 0)).toBe(0);
    expect(effectiveEffort(7.25, 7.25)).toBe(7.25);
  });

  it("two present zeros canonicalize to +0; a single source passes through", () => {
    for (const [l, s] of [[0, 0], [0, -0], [-0, 0], [-0, -0]]) expect(Object.is(effectiveEffort(l, s), 0)).toBe(true);
    for (const v of [0, -0, 7.25, -7.25, Infinity, -Infinity]) {
      expect(Object.is(effectiveEffort(v, null), v)).toBe(true);
      expect(Object.is(effectiveEffort(null, v), v)).toBe(true);
    }
    expect(Number.isNaN(effectiveEffort(NaN, null))).toBe(true);
  });

  it("non-zero and NaN pairs keep max semantics", () => {
    expect(effectiveEffort(Infinity, 12)).toBe(Infinity);
    expect(effectiveEffort(12, Infinity)).toBe(Infinity);
    expect(effectiveEffort(-Infinity, -Infinity)).toBe(-Infinity);
    expect(Number.isNaN(effectiveEffort(NaN, 1))).toBe(true);
    expect(Number.isNaN(effectiveEffort(1, NaN))).toBe(true);
  });
});

describe("plan scenarios and helpers", () => {
  it("under 20 readings is null even over a long span; 20 under 600 s is null; 20 over 600 s scores", () => {
    expect(strain(every(150, 19, 60), 190, 60)).toBeNull();
    expect(strain(every(150, 20, 30), 190, 60)).toBeNull(); // spans 570 s
    expect(strain(every(150, 20, 32), 190, 60)).not.toBeNull(); // spans 608 s
  });

  it("a 10-minute gap is credited as 2 minutes", () => {
    expect(sampleDurationsMinutes([{ ts: 0, bpm: 150 }, { ts: 30, bpm: 150 }, { ts: 630, bpm: 150 }, { ts: 660, bpm: 150 }])).toEqual([
      0.5, 2, 0.5, 0.5,
    ]);
  });

  it("toWhoopStrain is effort × 21 / 100", () => {
    expect(toWhoopStrain(100)).toBe(21);
    expect(toWhoopStrain(50)).toBe(10.5);
    expect(toWhoopStrain(0)).toBe(0);
  });

  it("zone minutes sum to the credited duration", () => {
    const hr = [...every(100, 60), ...every(150, 60).map((s) => ({ ...s, ts: s.ts + 60 }))];
    const z = zoneMinutes(hr, 60, 130, sampleDurationsMinutes(hr));
    expect(z).toHaveLength(6);
    expect(z.reduce((a, b) => a + b, 0)).toBeCloseTo(2, EPS);
    expect(z[0]).toBeCloseTo(1, EPS); // 100 bpm is 31% HRR
    expect(z[2]).toBeCloseTo(1, EPS); // 150 bpm is 69% HRR
  });

  it("HRmax estimate: observed 99.5th percentile once 600 samples, else Tanaka", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    const hist = Array.from({ length: 600 }, (_, i) => 100 + (i % 50)); // observed tops out under Tanaka
    expect(estimateHRmax(hist, 30)).toEqual({ hrmax: 187, source: "tanaka" });
    expect(estimateHRmax(hist, null).source).toBe("observed");
    expect(estimateHRmax([150], 40)).toEqual({ hrmax: 180, source: "tanaka" });
    expect(estimateHRmax([150], null)).toEqual({ hrmax: 0, source: "unknown" });
  });
});
