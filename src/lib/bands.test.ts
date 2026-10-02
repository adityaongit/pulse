import { describe, expect, it } from "vitest";
import { acwrTone, deltaTone, dialColor, GOOD_DIRECTION, recoveryBand, stressLevel } from "./bands";

describe("recoveryBand", () => {
  it("bands at 67 and 34", () => {
    expect(recoveryBand(67)).toBe("green");
    expect(recoveryBand(66.9)).toBe("yellow");
    expect(recoveryBand(34)).toBe("yellow");
    expect(recoveryBand(33.9)).toBe("red");
    expect(recoveryBand(0)).toBe("red");
    expect(recoveryBand(100)).toBe("green");
  });
});

describe("dialColor", () => {
  it("bands Recovery, never Strain or Sleep", () => {
    expect(dialColor("recovery", 80)).toBe("recovery-green");
    expect(dialColor("recovery", 20)).toBe("recovery-red");
    for (const v of [0, 5, 14, 21]) expect(dialColor("strain", v)).toBe("strain");
    for (const v of [10, 50, 90]) expect(dialColor("sleep", v)).toBe("sleep");
  });
});

describe("deltaTone", () => {
  it("HRV 8% above average is good", () => {
    expect(deltaTone(GOOD_DIRECTION.hrv, 108, 100, 5)).toEqual({ dir: "up", tone: "good" });
  });
  it("resting HR 3 bpm above average is bad", () => {
    expect(deltaTone(GOOD_DIRECTION.resting_hr, 52, 49, 2)).toEqual({ dir: "up", tone: "bad" });
    expect(deltaTone(GOOD_DIRECTION.resting_hr, 45, 49, 2)).toEqual({ dir: "down", tone: "good" });
  });
  it("inside ±1 σ is neutral", () => {
    expect(deltaTone("up", 104, 100, 5)).toEqual({ dir: "flat", tone: "neutral" });
    expect(deltaTone("down", 95, 100, 5)).toEqual({ dir: "flat", tone: "neutral" });
  });
  it("neutral metrics keep the arrow but never a tone", () => {
    expect(deltaTone(GOOD_DIRECTION.respiratory_rate, 16, 14.5, 0.5)).toEqual({ dir: "up", tone: "neutral" });
  });
  it("skin temperature is good toward zero", () => {
    expect(deltaTone("toward_zero", 0.1, 0.6, 0.2).tone).toBe("good");
    expect(deltaTone("toward_zero", -0.9, -0.2, 0.2).tone).toBe("bad");
  });
});

describe("stress and training load", () => {
  it("stress levels at 1 and 2", () => {
    expect(stressLevel(0.9)).toBe("low");
    expect(stressLevel(1)).toBe("medium");
    expect(stressLevel(1.9)).toBe("medium");
    expect(stressLevel(2)).toBe("high");
  });
  it("ACWR tones", () => {
    expect(acwrTone(0.7)).toBe("neutral");
    expect(acwrTone(1.1)).toBe("optimal");
    expect(acwrTone(1.4)).toBe("warning");
    expect(acwrTone(1.6)).toBe("alert");
  });
});
