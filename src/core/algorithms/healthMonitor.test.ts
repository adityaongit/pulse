import { describe, expect, it } from "vitest";
import { EFFECTS } from "../../server/sources/seed/scenario";
import { healthMonitor, type HealthMonitorDay } from "./healthMonitor";

const iso = (i: number) => new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10);
/** Deterministic ±1 wobble. */
const wobble = (i: number) => Math.sin(i * 2.399);
/** 40 ordinary nights; `last` overrides the newest. */
const history = (last: Partial<HealthMonitorDay> = {}, n = 40): HealthMonitorDay[] =>
  Array.from({ length: n }, (_, i) => ({
    day: iso(i),
    rhr: 55 + wobble(i),
    hrv: 60 + 3 * wobble(i + 1),
    resp: 14.5 + 0.2 * wobble(i + 2),
    spo2: 97 + 0.4 * wobble(i + 3),
    skinTempDev: 0.1 * wobble(i + 4),
    ...(i === n - 1 ? last : {}),
  }));
const status = (days: HealthMonitorDay[]) => Object.fromEntries(healthMonitor(days).vitals.map((v) => [v.key, v.status]));

describe("healthMonitor", () => {
  it("an ordinary night is 5 of 5 in range with a quiet illness signal", () => {
    const r = healthMonitor(history());
    expect(r.inRange).toBe(5);
    expect(r.flagged).toBe(0);
    expect(r.illness.level).toBe("quiet");
    for (const v of r.vitals) expect(v.range!.low).toBeLessThan(v.range!.high);
  });

  it("flags a vital outside mean ± 2σ, high or low", () => {
    expect(status(history({ rhr: 64 }))).toMatchObject({ restingHr: "high", hrv: "in_range" });
    expect(status(history({ hrv: 35 }))).toMatchObject({ hrv: "low" });
    expect(status(history({ resp: 16.5 }))).toMatchObject({ resp: "high" });
    expect(status(history({ skinTempDev: -1.2 }))).toMatchObject({ skinTempDev: "low" });
    const r = healthMonitor(history({ rhr: 64 }));
    expect(r.inRange).toBe(4);
    expect(r.flagged).toBe(1);
  });

  it("the range is the baseline mean ± 2σ", () => {
    const rhr = healthMonitor(history()).vitals.find((v) => v.key === "restingHr")!;
    // RHR's floor spread is 2 bpm, so σ ≥ 2.506 and the range is at least ±5.01 around ~55.
    expect(rhr.range!.high - rhr.range!.low).toBeGreaterThanOrEqual(4 * 1.253 * 2 - 1e-9);
    expect((rhr.range!.high + rhr.range!.low) / 2).toBeCloseTo(55, 0);
  });

  it("SpO2 94 is flagged even inside the personal range, and SpO2 is never high", () => {
    const wide = history({}, 40).map((d, i) => ({ ...d, spo2: i % 2 ? 92 : 98 }));
    const r = healthMonitor([...wide, { ...wide[0], day: iso(40), spo2: 94 }]);
    const spo2 = r.vitals.find((v) => v.key === "spo2")!;
    expect(spo2.status).toBe("low");
    expect(spo2.range).toEqual({ low: 95, high: 100 });
    expect(status(history({ spo2: 100 })).spo2).toBe("in_range");
  });

  it("missing values and unusable baselines are no_data, not in range", () => {
    expect(status(history({ spo2: null })).spo2).toBe("no_data");
    const short = history({}, 3);
    expect(healthMonitor(short).vitals.every((v) => v.status === "no_data" && v.range == null)).toBe(true);
    expect(healthMonitor([]).inRange).toBe(0);
  });

  it("the seeded illness peak flags at least 3 of 5 and raises the illness signal", () => {
    const ill = EFFECTS.illness;
    const base = history();
    const peak = base.at(-1)!;
    const r = healthMonitor([
      ...base.slice(0, -1),
      {
        ...peak,
        rhr: 55 + ill.rhr,
        hrv: 60 * (1 + ill.hrv),
        resp: 14.5 + ill.resp,
        spo2: 97 + ill.spo2,
        skinTempDev: ill.tempC,
      },
    ]);
    expect(r.flagged).toBeGreaterThanOrEqual(3);
    expect(r.inRange).toBeLessThanOrEqual(2);
    expect(r.illness.level).toBe("raised");
    expect(r.illness.baselineTrusted).toBe(true);
  });
});
