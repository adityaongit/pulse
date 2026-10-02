import { describe, expect, it } from "vitest";
import { FRIEND_TREADMILL, fitnessCategory, fitnessLevel, referenceVo2max, vo2maxPercentile } from "./fitnessLevel";

describe("vo2maxPercentile (FRIEND 2015 Table 2)", () => {
  it("returns the published percentile at sampled ages and sexes", () => {
    expect(vo2maxPercentile(48.0, 25, "male")).toBeCloseTo(50, 10);
    expect(vo2maxPercentile(49.2, 35, "male")).toBeCloseTo(75, 10);
    expect(vo2maxPercentile(31.9, 49, "male")).toBeCloseTo(25, 10);
    expect(vo2maxPercentile(16.3, 72, "male")).toBeCloseTo(5, 10);
    expect(vo2maxPercentile(51.3, 20, "female")).toBeCloseTo(90, 10);
    expect(vo2maxPercentile(23.4, 52, "female")).toBeCloseTo(50, 10);
    expect(vo2maxPercentile(23.8, 60, "female")).toBeCloseTo(75, 10);
  });

  it("interpolates linearly between published columns", () => {
    expect(vo2maxPercentile((48.0 + 55.2) / 2, 25, "male")).toBeCloseTo(62.5, 10);
    expect(vo2maxPercentile(30.2 + (36.1 - 30.2) * 0.2, 33, "female")).toBeCloseTo(55, 10);
  });

  it("clamps to [5, 95] and uses the edge decades outside 20–79", () => {
    expect(vo2maxPercentile(10, 30, "male")).toBeCloseTo(5, 10);
    expect(vo2maxPercentile(90, 30, "male")).toBeCloseTo(95, 10);
    expect(vo2maxPercentile(48.0, 18, "male")).toBeCloseTo(50, 10);
    expect(vo2maxPercentile(18.3, 85, "female")).toBeCloseTo(50, 10);
  });

  it("every published row increases", () => {
    for (const rows of Object.values(FRIEND_TREADMILL))
      for (const row of rows) for (let i = 1; i < row.length; i++) expect(row[i]).toBeGreaterThan(row[i - 1]);
  });
});

describe("fitnessCategory", () => {
  it("cuts at 20 / 40 / 60 / 80", () => {
    expect(fitnessCategory(19.99)).toBe("poor");
    expect(fitnessCategory(20)).toBe("fair");
    expect(fitnessCategory(39.99)).toBe("fair");
    expect(fitnessCategory(40)).toBe("good");
    expect(fitnessCategory(59.99)).toBe("good");
    expect(fitnessCategory(60)).toBe("excellent");
    expect(fitnessCategory(79.99)).toBe("excellent");
    expect(fitnessCategory(80)).toBe("superior");
  });

  it("fitnessLevel combines both", () => {
    expect(fitnessLevel(49.2, 35, "male").percentile).toBeCloseTo(75, 10);
    expect(fitnessLevel(49.2, 35, "male").category).toBe("excellent");
    expect(fitnessLevel(16.0, 45, "female")).toEqual({ percentile: 5, category: "poor" });
  });
});

describe("referenceVo2max", () => {
  it("is the 75th percentile at decade midpoints, linear between them, flat outside", () => {
    expect(referenceVo2max(35, "male")).toBeCloseTo(49.2, 10);
    expect(referenceVo2max(40, "male")).toBeCloseTo((49.2 + 45.0) / 2, 10);
    expect(referenceVo2max(20, "male")).toBeCloseTo(55.2, 10);
    expect(referenceVo2max(85, "female")).toBeCloseTo(20.8, 10);
  });
});
