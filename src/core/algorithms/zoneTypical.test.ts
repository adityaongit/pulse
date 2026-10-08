import { describe, expect, it } from "vitest";
import { zoneShareRanges } from "./zoneTypical";

describe("zoneShareRanges", () => {
  it("is the interquartile range of each zone's share", () => {
    // Shares of zone 0: 0, 0.25, 0.5, 0.75, 1 → 25th 0.25, 75th 0.75.
    const prior = [
      [0, 100],
      [25, 75],
      [50, 50],
      [75, 25],
      [100, 0],
    ];
    expect(zoneShareRanges(prior, 2)).toEqual([
      { low: 0.25, high: 0.75 },
      { low: 0.25, high: 0.75 },
    ]);
  });

  it("interpolates between activities and pads missing zones with 0", () => {
    const r = zoneShareRanges([[10, 30], [20, 20], [30, 10]], 3)!;
    expect(r[0].low).toBeCloseTo(0.375);
    expect(r[0].high).toBeCloseTo(0.625);
    expect(r[2]).toEqual({ low: 0, high: 0 });
  });

  it("needs three activities with zone time", () => {
    expect(zoneShareRanges([[1, 1], [2, 2]], 2)).toBeNull();
    expect(zoneShareRanges([[1, 1], [2, 2], [0, 0]], 2)).toBeNull();
    expect(zoneShareRanges([], 2)).toBeNull();
  });
});
