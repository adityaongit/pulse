import { describe, expect, it } from "vitest";
import { foldHistory, hrvCfg } from "./baselines";
import {
  band,
  bandRedMax,
  gatedRecovery,
  logisticK,
  logisticZ0,
  minBaselineNights,
  parasympatheticSaturation,
  recovery,
  recoveryFromStates,
  satEnterZ,
  satMaxDampFraction,
  skinTempDevScale,
  sleepPerfCenter,
  wHRV,
  wResp,
  wRHR,
  wSkinTemp,
  wSleep,
  watchRecovery,
  zScore,
} from "./recovery";
import type { BaselineState, BaselineStatus } from "./types";

/** A baseline with a given mean and Gaussian σ (spread is abs-dev units). */
const baseline = (mean: number, sigma: number, nValid = 14): BaselineState => ({
  baseline: mean,
  spread: sigma / 1.253,
  nValid,
  nightsSinceUpdate: 0,
  status: nValid >= 14 ? "trusted" : "provisional",
});

describe("ChargeEffortRestScoringTest: Charge", () => {
  it("weight constants", () => {
    expect([wHRV, wRHR, wSleep, wResp, wSkinTemp, skinTempDevScale]).toEqual([0.55, 0.2, 0.15, 0.05, 0.05, 1.0]);
  });

  const hrvBase = { mean: 60, spread: 8 };
  const rhrBase = { mean: 55, spread: 4 };
  const chargeAt = (skinTempDev: number | null) =>
    recovery({ hrv: 60, rhr: 55, hrvBaseline: hrvBase, rhrBaseline: rhrBase, sleepPerf: sleepPerfCenter, skinTempDev })!;

  it("null skin temp is identical to a zero deviation at composite z 0", () => {
    expect(chargeAt(0)).toBeCloseTo(chargeAt(null), 9);
  });
  it("skin-temp deviation lowers Charge, symmetrically", () => {
    expect(chargeAt(1)).toBeLessThan(chargeAt(null));
    expect(chargeAt(1)).toBeCloseTo(chargeAt(-1), 9);
  });
  it("the cold-start gate is unaffected by skin temp", () => {
    const score = recovery({
      hrv: 60,
      rhr: 55,
      hrvBaseline: hrvBase,
      rhrBaseline: rhrBase,
      sleepPerf: 0.85,
      skinTempDev: 0.7,
      hrvBaselineUsable: false,
    });
    expect(score).toBeNull();
  });
});

describe("RecoveryRequiredHrvBaselineTest", () => {
  const rhrB = { mean: 55, spread: 3 / 1.253 };
  const respB = { mean: 14.5, spread: 1 / 1.253 };
  const effortB = { mean: 40, spread: 15 / 1.253 };
  const base = { hrv: 50, rhr: 60, hrvBaseline: null };

  it("refuses to score without the HRV baseline, whatever else is present", () => {
    expect(recovery({ ...base, sleepPerf: 0.85 })).toBeNull();
    expect(recovery({ ...base, rhrBaseline: rhrB })).toBeNull();
    expect(recovery({ ...base, resp: 14, respBaseline: respB })).toBeNull();
    expect(recovery({ ...base, skinTempDev: 0.4 })).toBeNull();
    expect(recovery({ ...base, recoveryIndexSlope: -1 })).toBeNull();
    expect(recovery({ ...base, effortBaseline: effortB, priorDayEffort: 80 })).toBeNull();
    expect(
      recovery({
        ...base,
        resp: 14,
        rhrBaseline: rhrB,
        respBaseline: respB,
        sleepPerf: 0.85,
        skinTempDev: 0.4,
        recoveryIndexSlope: -1,
        effortBaseline: effortB,
        priorDayEffort: 80,
      }),
    ).toBeNull();
  });

  it("preserves cold start and the Swift-oracle score", () => {
    const hrvB = { mean: 50, spread: 6 / 1.253 };
    expect(recovery({ hrv: 50, rhr: 60, hrvBaseline: hrvB, sleepPerf: 0.85, hrvBaselineUsable: false })).toBeNull();
    expect(recovery({ hrv: 50, rhr: 60, hrvBaseline: hrvB, sleepPerf: 0.85 })).toBeCloseTo(57.932425214874954, 12);
  });
});

describe("RecoverySaturationGuardTest", () => {
  const undamped = (hrv: number, rhr: number, hrvB: BaselineState, rhrB: BaselineState) => {
    const z = (wHRV * zScore(hrv, hrvB.baseline, hrvB.spread) + wRHR * zScore(rhrB.baseline, rhr, rhrB.spread)) / (wHRV + wRHR);
    return 100 / (1 + Math.exp(-logisticK * (z - logisticZ0)));
  };
  const hrvB = baseline(50, 6.265);
  const rhrB = baseline(55, 5.0);
  const score = (hrv: number, rhr: number) => recoveryFromStates({ hrv, rhr, hrvBaseline: hrvB, rhrBaseline: rhrB })!;

  it("fires on the saturation signature and would ease but never remove the penalty", () => {
    const s = parasympatheticSaturation(-1.5, 1.5);
    expect(s.active).toBe(true);
    expect(s.easedHrvZ).toBeGreaterThan(-1.5);
    expect(s.easedHrvZ).toBeLessThan(0);
    expect(s.dampFraction).toBeGreaterThan(0);
    expect(s.dampFraction).toBeLessThanOrEqual(satMaxDampFraction);
  });

  it("is silent on real fatigue, non-low HRV, no RHR signal, and marginal divergence", () => {
    expect(parasympatheticSaturation(-1.5, -1.5)).toEqual({ easedHrvZ: -1.5, active: false, dampFraction: 0 });
    expect(parasympatheticSaturation(1.5, 1.5).active).toBe(false);
    expect(parasympatheticSaturation(0, 1.5).active).toBe(false);
    expect(parasympatheticSaturation(-1.5, null)).toEqual({ easedHrvZ: -1.5, active: false, dampFraction: 0 });
    const below = satEnterZ - 0.05;
    expect(parasympatheticSaturation(-below, below)).toEqual({ easedHrvZ: -below, active: false, dampFraction: 0 });
  });

  it("damping is monotonic in corroboration and capped by the weaker arm", () => {
    const weak = parasympatheticSaturation(-0.8, 0.8).dampFraction;
    const strong = parasympatheticSaturation(-1.4, 1.4).dampFraction;
    expect(strong).toBeGreaterThan(weak);
    expect(parasympatheticSaturation(-3, 3).dampFraction).toBeCloseTo(satMaxDampFraction, 12);
    expect(parasympatheticSaturation(-3, 0.8).dampFraction).toBeLessThan(parasympatheticSaturation(-3, 3).dampFraction);
  });

  it("a firing night still scores the raw composite and stays red", () => {
    const sat = parasympatheticSaturation(zScore(41, hrvB.baseline, hrvB.spread), zScore(rhrB.baseline, 48, rhrB.spread));
    expect(sat.active).toBe(true);
    expect(sat.dampFraction).toBeGreaterThan(0.4);
    expect(score(41, 48)).toBeCloseTo(undamped(41, 48, hrvB, rhrB), 9);
    expect(score(41, 48)).toBeLessThan(bandRedMax);
  });

  it("fatigue and good nights are unchanged too", () => {
    expect(score(41, 62)).toBeLessThan(bandRedMax);
    expect(score(41, 62)).toBeCloseTo(undamped(41, 62, hrvB, rhrB), 9);
    expect(score(62, 49)).toBeCloseTo(undamped(62, 49, hrvB, rhrB), 9);
  });
});

describe("RecoveryRhrBaselineUsableTest", () => {
  const state = (mean: number, sigma: number, status: BaselineStatus, nValid: number): BaselineState => ({
    baseline: mean,
    spread: sigma / 1.253,
    nValid,
    nightsSinceUpdate: status === "stale" ? 20 : 0,
    status,
  });
  const hrvBase = state(55, 12, "trusted", 20);
  const score = (rhrBaseline: BaselineState | null) =>
    recoveryFromStates({ hrv: 55, rhr: 62, hrvBaseline: hrvBase, rhrBaseline, sleepPerf: 0.85 })!;

  it("synthetic and stale RHR baselines score like an absent one; a usable one contributes", () => {
    expect(score(state(75, 6, "calibrating", 0))).toBeCloseTo(score(null), 12);
    expect(score(state(52, 3, "stale", 20))).toBeCloseTo(score(null), 12);
    expect(Math.abs(score(state(52, 3, "provisional", 5)) - score(null))).toBeGreaterThan(1e-9);
  });
});

describe("RecoveryIndexActivityBalanceTest", () => {
  const args = { hrv: 50, rhr: 55, hrvBaseline: baseline(50, 6), rhrBaseline: baseline(55, 3), sleepPerf: sleepPerfCenter };

  it("omitted optional terms equal explicit nulls", () => {
    const a = { hrv: 55, rhr: 52, resp: 14, hrvBaseline: baseline(50, 6), rhrBaseline: baseline(55, 3), respBaseline: baseline(14.5, 1), sleepPerf: 0.9, skinTempDev: 0.4 };
    expect(recoveryFromStates({ ...a, recoveryIndexSlope: null, effortBaseline: null, priorDayEffort: null })).toBe(
      recoveryFromStates(a),
    );
  });

  it("a steeper overnight decline raises Charge more than flat or rising", () => {
    const s = (recoveryIndexSlope: number) => recoveryFromStates({ ...args, recoveryIndexSlope })!;
    expect(s(-4)).toBeGreaterThan(s(-1));
    expect(s(-1)).toBeGreaterThan(s(0));
    expect(s(0)).toBeGreaterThan(s(2));
  });

  it("activity balance: harder yesterday lowers Charge, and needs both value and baseline", () => {
    const s = (priorDayEffort: number | null, effortBaseline: BaselineState | null = baseline(40, 15)) =>
      recoveryFromStates({ hrv: 58, rhr: 50, hrvBaseline: baseline(50, 6), rhrBaseline: baseline(55, 3), sleepPerf: 0.92, effortBaseline, priorDayEffort })!;
    expect(s(40)).toBeLessThan(s(null));
    expect(s(10)).toBeGreaterThan(s(40));
    expect(s(40)).toBeGreaterThan(s(65));
    expect(s(65)).toBeGreaterThan(s(90));
    const t = (priorDayEffort: number | null, effortBaseline: BaselineState | null) =>
      recoveryFromStates({ ...args, effortBaseline, priorDayEffort })!;
    expect(t(80, null)).toBeCloseTo(t(null, null), 9);
    expect(t(null, baseline(40, 15))).toBeCloseTo(t(null, null), 9);
    expect(t(80, baseline(40, 15))).not.toBeCloseTo(t(null, null), 9);
  });
});

describe("WatchRecoveryTest", () => {
  const hist = Array<number>(14).fill(45);
  const rhrHist = Array<number>(14).fill(52);

  it("at baseline gives mid recovery, solid", () => {
    const out = watchRecovery(45, 52, hist, rhrHist);
    expect(out.recovery).toBeGreaterThanOrEqual(40);
    expect(out.recovery).toBeLessThanOrEqual(60);
    expect(out.confidence).toBe("solid");
  });
  it("high HRV with low RHR is high; low HRV with high RHR is low", () => {
    expect(watchRecovery(70, 46, hist, rhrHist).recovery).toBeGreaterThan(65);
    expect(watchRecovery(22, 62, hist, rhrHist).recovery).toBeLessThan(40);
  });
  it("insufficient history or missing HRV calibrates", () => {
    expect(watchRecovery(45, 52, [45, 46], [52, 51])).toEqual({ recovery: null, confidence: "calibrating" });
    expect(watchRecovery(null, 52, hist, hist)).toEqual({ recovery: null, confidence: "calibrating" });
  });
  it("the week gate counts accepted nights, not raw entries", () => {
    expect(watchRecovery(45, null, [45, 46, 47, 48, -1, 0, 999], []).recovery).toBeNull();
    expect(watchRecovery(45, null, [45, 46, 47, -1, 0, 999, 1000], []).recovery).toBeNull();
    expect(watchRecovery(45, null, [45, 46, 47, 48, 45, 46], []).recovery).toBeNull();
    const ok = watchRecovery(45, null, [45, 46, 47, 48, 45, 46, 47, -1, 999], []);
    expect(ok.recovery).not.toBeNull();
    expect(ok.confidence).not.toBe("calibrating");
  });
  it("an empty or junk RHR history scores like missing RHR (Swift oracle)", () => {
    const h7 = Array<number>(7).fill(45);
    const withRhr = watchRecovery(45, 52, h7, []).recovery!;
    expect(withRhr).toBeCloseTo(watchRecovery(45, null, h7, []).recovery!, 12);
    expect(withRhr).toBeCloseTo(57.932425214874954, 12);
    const junk = Array<number>(7).fill(300);
    expect(watchRecovery(45, 52, h7, junk).recovery!).toBeCloseTo(watchRecovery(45, null, h7, junk).recovery!, 12);
  });
  it("a usable RHR history still contributes", () => {
    const h7 = Array<number>(7).fill(45);
    const rhr4 = Array<number>(4).fill(52);
    expect(watchRecovery(45, 62, h7, rhr4).recovery!).toBeLessThan(watchRecovery(45, null, h7, rhr4).recovery! - 1);
  });
});

describe("plan scenarios", () => {
  it("band boundaries", () => {
    expect(band(66.9)).toBe("yellow");
    expect(band(67)).toBe("green");
    expect(band(33.9)).toBe("red");
    expect(band(34)).toBe("yellow");
  });

  it("an unusable or missing HRV baseline returns null", () => {
    const cold = foldHistory([50, 50, 50], hrvCfg);
    expect(recoveryFromStates({ hrv: 50, rhr: 55, hrvBaseline: cold })).toBeNull();
    expect(recovery({ hrv: 50, rhr: 55, hrvBaseline: null })).toBeNull();
  });

  it("fewer than 7 accepted prior nights is null with calibrating; 7 scores", () => {
    expect(minBaselineNights).toBe(7);
    const six = foldHistory(Array(6).fill(50), hrvCfg);
    expect(gatedRecovery({ hrv: 50, rhr: null, hrvBaseline: six })).toEqual({ recovery: null, confidence: "calibrating" });
    const seven = foldHistory(Array(7).fill(50), hrvCfg);
    expect(gatedRecovery({ hrv: 50, rhr: null, hrvBaseline: seven })).toMatchObject({ confidence: "building" });
    expect(gatedRecovery({ hrv: null, rhr: 55, hrvBaseline: seven })).toEqual({ recovery: null, confidence: "calibrating" });
  });

  it("skin-temp null equals the no-skin-temp model; ±0.5 °C gives the same penalty", () => {
    const a = { hrv: 58, rhr: 53, resp: 15, hrvBaseline: baseline(50, 6), rhrBaseline: baseline(55, 3), respBaseline: baseline(15.5, 1), sleepPerf: 0.8 };
    const noSkin = recoveryFromStates(a)!;
    expect(recoveryFromStates({ ...a, skinTempDev: null })).toBe(noSkin);
    const warm = recoveryFromStates({ ...a, skinTempDev: 0.5 })!;
    expect(warm).toBe(recoveryFromStates({ ...a, skinTempDev: -0.5 }));
    expect(warm).toBeLessThan(noSkin);
  });

  it("gatedRecovery uses every supplied term", () => {
    const hrvBaseline = baseline(50, 6);
    const terms = { hrv: 58, rhr: 53, resp: 15, rhrBaseline: baseline(55, 3), respBaseline: baseline(15.5, 1), sleepPerf: 0.8, skinTempDev: 0.2 };
    expect(gatedRecovery({ ...terms, hrvBaseline }).recovery).toBe(recoveryFromStates({ ...terms, hrvBaseline }));
    expect(gatedRecovery({ ...terms, hrvBaseline }).confidence).toBe("solid");
  });
});
