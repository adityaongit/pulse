import { describe, expect, it } from "vitest";
import {
  cutoffKey,
  deviation,
  earlyHalfLifeB,
  foldHistory,
  freshestCarried,
  hrvCfg,
  isoEpochDay,
  isTrusted,
  isUsable,
  lambda,
  metricCfg,
  nightsSinceNewestValidNight,
  recentHrvCoverage,
  respCfg,
  restingHRCfg,
  rollingMeanSD,
  update,
} from "./baselines";
import { recoveryFromStates } from "./recovery";

const repeat = (v: number | null, n: number) => Array.from({ length: n }, () => v);

describe("plan scenarios", () => {
  it("3 nights unusable, 4 usable, 14 trusted", () => {
    expect(foldHistory(repeat(50, 3), hrvCfg).status).toBe("calibrating");
    expect(isUsable(foldHistory(repeat(50, 3), hrvCfg))).toBe(false);
    expect(foldHistory(repeat(50, 4), hrvCfg).status).toBe("provisional");
    expect(isUsable(foldHistory(repeat(50, 4), hrvCfg))).toBe(true);
    expect(foldHistory(repeat(50, 13), hrvCfg).status).toBe("provisional");
    expect(isTrusted(foldHistory(repeat(50, 14), hrvCfg))).toBe(true);
  });

  it("young regime: half-life 3, spread × 2.5 clamp, no hard reject", () => {
    const young = foldHistory(repeat(50, 4), hrvCfg); // baseline 50, spread at the 5 ms floor
    expect(young).toMatchObject({ baseline: 50, spread: 5, nValid: 4 });
    // 80 is 6× spread away: past the hard gate, but young, so it folds at the fast centre half-life.
    const s = update(young, 80, hrvCfg);
    const lb = 1 - 0.5 ** (1 / earlyHalfLifeB);
    const ls = 1 - 0.5 ** (1 / 21);
    expect(s.nValid).toBe(5);
    expect(s.baseline).toBeCloseTo(50 + 30 * lb, 12);
    expect(s.spread).toBeCloseTo(Math.max(5, ls * Math.abs(80 - s.baseline) + (1 - ls) * 5), 12);
    // Clamp widens to ±3 × 2.5 × spread = ±37.5 while young.
    expect(update(young, 100, hrvCfg).baseline).toBeCloseTo(50 + 37.5 * lb, 12);
  });

  it("after 8 nights a value 6× spread away is rejected and leaves the baseline unchanged", () => {
    const settled = foldHistory(repeat(50, 8), hrvCfg);
    const s = update(settled, 80, hrvCfg);
    expect(s).toEqual({ ...settled, nightsSinceUpdate: 0 });
    // The window-fold mode (Readiness) folds it instead, clamped at ±3 × spread.
    const lb = lambda(hrvCfg.halfLifeB);
    expect(update(settled, 80, hrvCfg, false).baseline).toBeCloseTo(lb * 65 + (1 - lb) * 50, 12);
  });

  it("stale after more than 14 missing nights; back to trusted when data resumes", () => {
    const trusted = foldHistory(repeat(50, 14), hrvCfg);
    expect(foldHistory([...repeat(50, 14), ...repeat(null, 14)], hrvCfg).status).toBe("trusted");
    let s = foldHistory([...repeat(50, 14), ...repeat(null, 15)], hrvCfg);
    expect(s.status).toBe("stale");
    expect(isUsable(s)).toBe(false);
    s = update(s, 50, hrvCfg);
    expect(s.status).toBe("trusted");
    expect(s.nValid).toBe(trusted.nValid + 1);
  });

  it("stale with fewer than 14 valid nights returns to provisional", () => {
    const s = foldHistory([...repeat(50, 5), ...repeat(null, 15)], hrvCfg);
    expect(s.status).toBe("stale");
    expect(update(s, 50, hrvCfg).status).toBe("provisional");
  });

  it("out-of-range values skip and hold; the empty history is the config midpoint", () => {
    const s = foldHistory([45, -1, 0, 999], hrvCfg);
    expect(s).toMatchObject({ baseline: 45, nValid: 1, nightsSinceUpdate: 3 });
    expect(foldHistory([], restingHRCfg)).toEqual({
      baseline: 75,
      spread: 2,
      nValid: 0,
      nightsSinceUpdate: 0,
      status: "calibrating",
    });
  });
});

describe("BaselineSeedingTest", () => {
  const hrvBase4 = () => foldHistory([58, 61, 60, 59], hrvCfg);
  const rhrBase4 = () => foldHistory([52, 51, 53, 52], restingHRCfg);

  it("below seed is not usable, recovery null", () => {
    const hrvBase = foldHistory([58, 61, 60], hrvCfg);
    expect(isUsable(hrvBase)).toBe(false);
    const score = recoveryFromStates({
      hrv: 60,
      rhr: 52,
      hrvBaseline: hrvBase,
      rhrBaseline: foldHistory([52, 51, 53], restingHRCfg),
      sleepPerf: 0.9,
    });
    expect(score).toBeNull();
  });

  it("at seed is usable, recovery non-null and in [0, 100]", () => {
    expect(isUsable(hrvBase4())).toBe(true);
    const score = recoveryFromStates({ hrv: 60, rhr: 52, hrvBaseline: hrvBase4(), rhrBaseline: rhrBase4(), sleepPerf: 0.9 });
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });

  it("null nights skip and hold and do not count", () => {
    expect(isUsable(foldHistory([58, null, 61, null, 60], hrvCfg))).toBe(false);
  });

  const withResp = (resp: number | null, respBaseline: ReturnType<typeof foldHistory> | null) =>
    recoveryFromStates({ hrv: 59.5, rhr: 52, resp, hrvBaseline: hrvBase4(), rhrBaseline: rhrBase4(), respBaseline, sleepPerf: 0.9 })!;

  it("resp above baseline lowers recovery, below raises it", () => {
    const respBase = foldHistory([14.5, 14.4, 14.6, 14.5, 14.5], respCfg);
    expect(isUsable(respBase)).toBe(true);
    const neutral = withResp(null, respBase);
    expect(withResp(17.5, respBase)).toBeLessThan(neutral);
    expect(withResp(12.0, respBase)).toBeGreaterThan(neutral);
  });

  it("null resp renormalizes to the pre-wiring score", () => {
    const respBase = foldHistory([14.5, 14.4, 14.6, 14.5, 14.5], respCfg);
    expect(withResp(null, respBase)).toBeCloseTo(withResp(null, null), 9);
  });
});

describe("deviation and rollingMeanSD", () => {
  it("z is (value − baseline) / (1.253 × spread)", () => {
    const s = { baseline: 50, spread: 4, nValid: 14, nightsSinceUpdate: 0, status: "trusted" as const };
    const d = deviation(55, s);
    expect(d.z).toBeCloseTo(5 / (1.253 * 4), 12);
    expect(d.delta).toBe(5);
    expect(d.ratio).toBeCloseTo(0.1, 12);
    expect(d.inNormalRange).toBe(true);
  });

  it("trailing mean and sample SD, σ floored then stored in abs-dev units", () => {
    const s = rollingMeanSD([10, null, 12, 14, 400], hrvCfg); // 400 is out of range
    expect(s.baseline).toBe(12);
    expect(s.spread).toBeCloseTo(5 / 1.253, 12); // SD 2 is under the 5 ms floor
    const wide = rollingMeanSD([20, 40, 60], hrvCfg);
    expect(wide.spread).toBeCloseTo(20 / 1.253, 12);
    expect(rollingMeanSD([20, 40, 60], hrvCfg, 2).baseline).toBe(50);
  });

  it("keeps every noop metric config", () => {
    expect(Object.keys(metricCfg).sort()).toEqual(
      ["daytime_hr", "daytime_rmssd", "hrv", "readiness_hrv_ln", "resp", "resting_hr", "skin_temp", "strain"].sort(),
    );
    expect(metricCfg.resp.floorSpread).toBe(0.5);
    expect(metricCfg.resting_hr.floorSpread).toBe(2);
  });
});

describe("isoEpochDay", () => {
  it("is Hinnant's days-from-civil", () => {
    expect(isoEpochDay("1970-01-01")).toBe(0);
    expect(isoEpochDay("2000-03-01")).toBe(11017);
    expect(isoEpochDay("1969-12-31")).toBe(-1);
    expect(isoEpochDay("2026-10-02")).toBe(Date.UTC(2026, 9, 2) / 86_400_000);
    expect(isoEpochDay("0000-03-01")).toBe(-719468); // the algorithm's own anchor
    expect(isoEpochDay("0000-01-01")).toBe(-719528); // yy = −1 exercises the floor division
    expect(isoEpochDay("2026-13-01")).toBeNull();
    expect(isoEpochDay("not-a-date")).toBeNull();
  });
});

describe("NightsSinceNewestValidNightTest", () => {
  it("days since the newest night carrying a valid hrv", () => {
    expect(nightsSinceNewestValidNight(["2026-07-01", "2026-07-02", "2026-07-03"], [60, null, 62], "2026-07-17")).toBe(14);
  });
  it("a null-hrv newer night does not count", () => {
    expect(nightsSinceNewestValidNight(["2026-07-01", "2026-07-10"], [55, null], "2026-07-17")).toBe(16);
  });
  it("null when there is no valid night", () => {
    expect(nightsSinceNewestValidNight(["2026-07-01"], [null], "2026-07-17")).toBeNull();
  });
  it("null when today precedes the newest night", () => {
    expect(nightsSinceNewestValidNight(["2026-07-20"], [60], "2026-07-17")).toBeNull();
  });
  it("crosses month and year boundaries", () => {
    expect(nightsSinceNewestValidNight(["2025-12-31"], [50], "2026-01-01")).toBe(1);
    expect(nightsSinceNewestValidNight(["2026-01-31"], [50], "2026-03-03")).toBe(31);
  });
  it("null on an unparseable day key", () => {
    expect(nightsSinceNewestValidNight(["not-a-date"], [50], "2026-07-17")).toBeNull();
  });
});

describe("RecentHrvCoverageTest", () => {
  it("counts observed nights and the empty ones among them", () => {
    const days = ["2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"];
    expect(recentHrvCoverage(days, [44, null, null, 47, null], "2026-09-06")).toEqual({ observed: 5, missing: 3 });
  });
  it("a day outside the window is not observed", () => {
    expect(recentHrvCoverage(["2026-08-01", "2026-09-06"], [null, null], "2026-09-06", 14)).toEqual({ observed: 1, missing: 1 });
  });
  it("a day after today is ignored", () => {
    expect(recentHrvCoverage(["2026-09-07"], [null], "2026-09-06")).toEqual({ observed: 0, missing: 0 });
  });
  it("a complete window reports nothing missing", () => {
    expect(recentHrvCoverage(["2026-09-05", "2026-09-06"], [50, 51], "2026-09-06")).toEqual({ observed: 2, missing: 0 });
  });
  it("empty and unparseable inputs are zero", () => {
    expect(recentHrvCoverage([], [], "2026-09-06").observed).toBe(0);
    expect(recentHrvCoverage(["2026-09-06"], [null], "not-a-day").observed).toBe(0);
  });
});

describe("VitalCarryStalenessTest", () => {
  it("cutoffKey is today minus carry days, across months, years and leap days", () => {
    expect(cutoffKey("2026-08-13", 7)).toBe("2026-08-06");
    expect(cutoffKey("2026-08-13", 0)).toBe("2026-08-13");
    expect(cutoffKey("2026-03-03", 7)).toBe("2026-02-24");
    expect(cutoffKey("2026-01-03", 7)).toBe("2025-12-27");
    expect(cutoffKey("2028-03-05", 7)).toBe("2028-02-27");
    expect(cutoffKey("not-a-day", 7)).toBe("not-a-day");
  });

  it("freshestCarried judges only the newest point, inclusive at the edge", () => {
    expect(freshestCarried([["2026-08-01", 16.0], ["2026-08-10", 15.6]], "2026-08-13", 7)).toEqual(["2026-08-10", 15.6]);
    expect(freshestCarried([["2026-07-28", 16.0], ["2026-07-29", 16.2], ["2026-07-30", 15.6]], "2026-08-13", 7)).toBeNull();
    expect(freshestCarried([["2026-08-06", 15.6]], "2026-08-13", 7)?.[1]).toBe(15.6);
    expect(freshestCarried([["2026-08-05", 15.6]], "2026-08-13", 7)).toBeNull();
    expect(freshestCarried([["2026-07-30", 15.6], ["2026-08-12", 14.1]], "2026-08-13", 7)?.[1]).toBe(14.1);
    expect(freshestCarried([["2026-08-13", 14.1]], "2026-08-13", 7)?.[1]).toBe(14.1);
    expect(freshestCarried([], "2026-08-13")).toBeNull();
  });
});
