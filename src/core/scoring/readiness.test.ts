import { describe, expect, it } from "vitest";
import { acwrSignal, evaluate, evaluateWithTrainingLoad, mean, type ReadinessDay, sampleSD } from "./readiness";

const pad = (n: number) => String(n).padStart(2, "0");
const d = (i: number, hrv: number | null, rhr: number | null, effort: number | null, resp: number | null = null): ReadinessDay => ({
  day: `2024-03-${pad(i)}`,
  hrv,
  rhr,
  effort,
  resp,
});

/** 28 baseline days with gentle variation, then today as day 29. */
function baseline(todayHrv: number | null, todayRhr: number | null, todayEffort: number | null, todayResp: number | null = null) {
  const days: ReadinessDay[] = [];
  for (let i = 1; i <= 28; i++) days.push(d(i, i % 2 === 0 ? 62 : 58, i % 2 === 0 ? 54 : 50, 10, i % 2 === 0 ? 14.5 : 13.5));
  days.push(d(29, todayHrv, todayRhr, todayEffort, todayResp));
  return days;
}

const flagOf = (r: ReturnType<typeof evaluate>, key: string) => r.signals.find((s) => s.key === key)?.flag;

describe("ReadinessEngineTest", () => {
  it("insufficient when empty", () => {
    expect(evaluate([]).level).toBe("insufficient");
  });

  it("primed when signals aligned", () => {
    const r = evaluate(baseline(72, 46, 10));
    expect(r.level).toBe("primed");
    expect(flagOf(r, "hrv")).toBe("good");
    expect(flagOf(r, "rhr")).toBe("good");
    expect(flagOf(r, "acwr")).toBe("good");
  });

  it("rundown when two recovery signals down", () => {
    expect(evaluate(baseline(50, 60, 10)).level).toBe("rundown");
  });

  it("ACWR spike strains", () => {
    const days: ReadinessDay[] = [];
    for (let i = 1; i <= 21; i++) days.push(d(i, 60, 52, 5));
    for (let i = 22; i <= 28; i++) days.push(d(i, 60, 52, 15));
    days.push(d(29, 60, 52, 15));
    const r = evaluate(days);
    expect(flagOf(r, "acwr")).toBe("bad");
    expect(r.level).toBe("strained");
    expect(r.acwr!).toBeGreaterThan(1.5);
  });

  it("resp rate rise flags", () => {
    expect(evaluate(baseline(60, 52, 10, 18)).signals.some((s) => s.key === "respRate")).toBe(true);
  });

  it("implausible resp outlier produces no signal", () => {
    expect(evaluate(baseline(60, 52, 10, 40)).signals.some((s) => s.key === "respRate")).toBe(false);
  });

  it("explicit today without matching row is insufficient", () => {
    const days = baseline(72, 46, 10);
    expect(evaluate(days, "2026-06-08").level).toBe("insufficient");
    expect(evaluate(days, "2024-03-29").level).not.toBe("insufficient");
    expect(evaluate(days).level).not.toBe("insufficient");
  });

  it("stats helpers", () => {
    expect(mean([2, 4, 6])).toBeCloseTo(4, 12);
    expect(sampleSD([2, 4, 6])).toBeCloseTo(2, 4);
    expect(sampleSD([5])).toBeNull();
    expect(mean([])).toBeNull();
  });
});

describe("plan U6: ACWR bands and monotony", () => {
  it("classifies 0.8 / 1.3 / 1.5 as noop does (lower bound inclusive)", () => {
    expect(acwrSignal(0.79, 1, 1)).toMatchObject({ flag: "watch", detail: "LOAD_RAMPING_DOWN" });
    expect(acwrSignal(0.8, 1, 1)).toMatchObject({ flag: "good", detail: "LOAD_SWEET_SPOT" });
    expect(acwrSignal(1.3, 1, 1)).toMatchObject({ flag: "watch", detail: "LOAD_BUILDING_FAST" });
    expect(acwrSignal(1.5, 1, 1)).toMatchObject({ flag: "bad", detail: "LOAD_SPIKING" });
  });

  it("monotony ≥ 2.0 sets the watch flag; below does not", () => {
    // Last week 12,10,12,10,12,10,12 → mean 11.14 / SD 1.07 ≈ 10.4.
    const flat = Array.from({ length: 28 }, (_, i) => d(i + 1, 60, 52, i % 2 === 0 ? 10 : 12));
    const r = evaluate(flat);
    expect(r.monotony!).toBeGreaterThanOrEqual(2);
    expect(r.signals.find((s) => s.key === "monotony")?.flag).toBe("watch");

    // Last week 20,0,20,0,20,0,20 → mean 11.43 / SD 10.69 ≈ 1.07.
    const varied = Array.from({ length: 28 }, (_, i) => d(i + 1, 60, 52, i % 2 === 0 ? 0 : 20));
    const v = evaluate(varied);
    expect(v.monotony!).toBeLessThan(2);
    expect(v.signals.some((s) => s.key === "monotony")).toBe(false);
  });
});

describe("ReadinessTrainingLoadTest", () => {
  const metric = (day: number, effort: number | null, hrv = 60, rhr = 52): ReadinessDay => ({
    day: `2026-01-${pad(day)}`,
    rhr,
    hrv,
    effort,
    resp: 14,
  });
  const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

  it("paired API leaves readiness unchanged", () => {
    const days = range(28).map((i) => metric(i, i <= 21 ? 5 : 15, i % 2 === 0 ? 62 : 58, i % 2 === 0 ? 54 : 50));
    const paired = evaluateWithTrainingLoad(days);
    expect(paired.readiness).toEqual(evaluate(days));
    expect(paired.trainingLoad.state).toBe("building");
    expect(paired.trainingLoad.ctl).not.toBeNull();
    expect(paired.trainingLoad.atl).not.toBeNull();
    expect(paired.trainingLoad.tsb).not.toBeNull();
  });

  it("ACWR and monotony stay owned by readiness", () => {
    const paired = evaluateWithTrainingLoad(range(28).map((i) => metric(i, i <= 21 ? 5 : 12 + (i % 3))));
    expect(paired.readiness.acwr).not.toBeNull();
    expect(paired.readiness.monotony).not.toBeNull();
    expect(paired.trainingLoad.state).not.toBe("unavailable");
    expect(paired.trainingLoad.endDay).toBe("2026-01-28");
  });

  it("missing load breaks the training model without suppressing readiness", () => {
    const paired = evaluateWithTrainingLoad(range(28).map((i) => metric(i, i === 21 ? null : 10)));
    expect(paired.readiness.level).not.toBe("insufficient");
    expect(paired.trainingLoad.state).toBe("unavailable");
    expect(paired.trainingLoad.unavailableReason).toBe("NOT_ENOUGH_CONTIGUOUS_DAYS");
    expect(paired.trainingLoad.contiguousDays).toBe(7);
  });

  it("explicit missing today fails closed for both", () => {
    const paired = evaluateWithTrainingLoad(range(28).map((i) => metric(i, 10)), "2026-02-01");
    expect(paired.readiness.level).toBe("insufficient");
    expect(paired.trainingLoad.state).toBe("unavailable");
    expect(paired.trainingLoad.unavailableReason).toBe("MISSING_TARGET_DAY");
  });

  it("explicit today ignores future training rows", () => {
    const paired = evaluateWithTrainingLoad(range(28).map((i) => metric(i, i <= 20 ? 10 : 100)), "2026-01-20");
    expect(paired.trainingLoad.endDay).toBe("2026-01-20");
    expect(paired.trainingLoad.contiguousDays).toBe(20);
    expect(paired.trainingLoad.points.at(-1)!.load).toBe(10);
  });
});
