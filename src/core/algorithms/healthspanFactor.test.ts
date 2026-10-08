import { describe, expect, it } from "vitest";
import { factorCopy, factorState, ON_TRACK_YEARS } from "./healthspanFactor";

describe("factorState", () => {
  it("splits at ±ON_TRACK_YEARS, younger is outperforming", () => {
    expect(factorState(-ON_TRACK_YEARS)).toBe("outperforming");
    expect(factorState(-0.29)).toBe("on_track");
    expect(factorState(0)).toBe("on_track");
    expect(factorState(0.29)).toBe("on_track");
    expect(factorState(ON_TRACK_YEARS)).toBe("underperforming");
  });

  it("names the factor in the sentence", () => {
    expect(factorCopy("Hours of sleep", -1.1)).toMatchObject({ title: "Outperforming", body: expect.stringContaining("your hours of sleep") });
    expect(factorCopy("VO2 max", 0.8)).toMatchObject({ title: "Room to improve", body: expect.stringContaining("Your VO2 max") });
  });
});
