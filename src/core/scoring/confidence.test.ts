import { describe, expect, it } from "vitest";
import { coverageFraction, forCharge, forEffort, forRest, minCoverage, readiness } from "./confidence";
import type { BaselineState, BaselineStatus } from "./types";

const baseline = (nValid: number, status: BaselineStatus): BaselineState => ({
  baseline: 60,
  spread: 8,
  nValid,
  nightsSinceUpdate: 0,
  status,
});

describe("ChargeEffortRestScoringTest: confidence", () => {
  it("Charge tiers", () => {
    expect(forCharge(null, baseline(20, "trusted"))).toBe("calibrating");
    expect(forCharge(60, baseline(2, "calibrating"))).toBe("calibrating");
    expect(forCharge(60, baseline(5, "provisional"))).toBe("building");
    expect(forCharge(60, baseline(20, "trusted"))).toBe("solid");
    expect(forCharge(60, null)).toBe("calibrating");
  });

  it("Effort tiers", () => {
    expect(forEffort(null, 5000)).toBe("calibrating");
    expect(forEffort(40, 1200)).toBe("building");
    expect(forEffort(40, 5000)).toBe("solid");
  });

  it("Rest base tiers", () => {
    expect(forRest(false, false)).toBe("calibrating");
    expect(forRest(true, false)).toBe("building");
    expect(forRest(true, true)).toBe("solid");
  });

  const asleep = 8 * 3600;

  it("H9 downgrades a high-efficiency night with near-zero deep + REM", () => {
    expect(forRest(true, true, { asleepSeconds: asleep, restorativeSeconds: asleep * 0.03, efficiency: 0.95 })).toBe("building");
    expect(forRest(true, true, { asleepSeconds: asleep, restorativeSeconds: asleep * 0.45, efficiency: 0.95 })).toBe("solid");
    expect(forRest(true, true, { asleepSeconds: asleep, restorativeSeconds: asleep * 0.03, efficiency: 0.6 })).toBe("solid");
    expect(forRest(true, false, { asleepSeconds: asleep, restorativeSeconds: 0, efficiency: 0.95 })).toBe("building");
  });

  it("hypnogram coverage downgrades a holed timeline and fails open when unknown", () => {
    const night = { asleepSeconds: asleep, restorativeSeconds: asleep * 0.45, efficiency: 0.8 };
    expect(forRest(true, true, { ...night, stageCoverage: 0.23 })).toBe("building");
    expect(forRest(true, true, { ...night, stageCoverage: 1.0 })).toBe("solid");
    expect(forRest(true, true, { ...night, stageCoverage: null })).toBe("solid");
    const short = { asleepSeconds: 70 * 60, restorativeSeconds: 70 * 60 * 0.45, efficiency: 0.5 };
    expect(forRest(true, true, short)).toBe("solid");
    expect(forRest(true, true, { ...short, stageCoverage: 140 / 601 })).toBe("building");
  });
});

describe("readiness and coverage", () => {
  it("readiness tiers", () => {
    expect(readiness(false, 30, 30)).toBe("calibrating");
    expect(readiness(true, 12, 30)).toBe("building");
    expect(readiness(true, 30, 30)).toBe("solid");
  });

  it("coverageFraction is null when not measurable, clamped at 1", () => {
    expect(minCoverage).toBe(0.95);
    expect(coverageFraction(140 * 60, 601 * 60)).toBeCloseTo(140 / 601, 12);
    expect(coverageFraction(0, 600)).toBeNull();
    expect(coverageFraction(600, 0)).toBeNull();
    expect(coverageFraction(900, 600)).toBe(1);
  });
});
