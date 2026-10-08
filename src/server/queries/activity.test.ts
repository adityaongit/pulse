import { describe, expect, it } from "vitest";
import { withTypical } from "./activity";

const row = (zone: number, seconds: number) => ({ zone, label: `Z${zone}`, min: 100 + zone * 10, max: null, seconds });

describe("withTypical", () => {
  it("adds each zone's interquartile share range over earlier activities", () => {
    const m = { value: [row(1, 600), row(2, 0)], reason: null, provisional: false };
    const out = withTypical(m, [
      [300, 300],
      [900, 0],
      [600, 200],
    ]);
    expect(out.value?.[0].typical).toEqual({ low: 0.625, high: 0.875 });
    expect(out.value?.[1].typical).toEqual({ low: 0.125, high: 0.375 });
  });
  it("leaves the rows alone with fewer than three earlier activities", () => {
    const m = { value: [row(1, 600)], reason: null, provisional: false };
    expect(withTypical(m, [])).toBe(m);
    expect(withTypical(m, [[1], [2]])).toBe(m);
  });
});
