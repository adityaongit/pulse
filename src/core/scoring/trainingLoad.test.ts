import { describe, expect, it } from "vitest";
import { type DailyLoad, evaluate, evaluateDense } from "./trainingLoad";

const fill = (n: number, v: number) => Array<number>(n).fill(v);
const pad = (n: number) => String(n).padStart(2, "0");

describe("TrainingLoadEngineTest", () => {
  it("constant load converges exactly to load and zero balance", () => {
    const r = evaluateDense(fill(42, 50));
    expect(r.state).toBe("established");
    expect(r.unavailableReason).toBeNull();
    expect(r.contiguousDays).toBe(42);
    expect(r.points).toHaveLength(36);
    expect(r.ctl).toBeCloseTo(50, 12);
    expect(r.atl).toBeCloseTo(50, 12);
    expect(r.tsb).toBeCloseTo(0, 12);
  });

  it("step up raises acute load faster than chronic", () => {
    const r = evaluateDense([...fill(7, 50), ...fill(7, 100)]);
    expect(r.state).toBe("building");
    expect(r.ctl).toBeCloseTo(57.67591375546929, 10);
    expect(r.atl).toBeCloseTo(81.6060279414279, 10);
    expect(r.tsb).toBeCloseTo(-23.930114185958608, 10);
    expect(r.atl!).toBeGreaterThan(r.ctl!);
    expect(r.tsb!).toBeLessThan(0);
  });

  it("step down produces positive balance", () => {
    const r = evaluateDense([...fill(7, 100), ...fill(14, 20)]);
    expect(r.ctl!).toBeGreaterThan(r.atl!);
    expect(r.tsb!).toBeGreaterThan(0);
  });

  it("minimum and established boundaries", () => {
    const thirteen = evaluateDense(fill(13, 40));
    expect(thirteen.state).toBe("unavailable");
    expect(thirteen.unavailableReason).toBe("NOT_ENOUGH_CONTIGUOUS_DAYS");
    expect(thirteen.points).toEqual([]);
    expect(evaluateDense(fill(14, 40)).state).toBe("building");
    expect(evaluateDense(fill(42, 40)).state).toBe("established");
  });

  it("zero is a real rest day but missing load breaks history", () => {
    const loads = fill(14, 50);
    loads[13] = 0;
    const zero = evaluateDense(loads);
    expect(zero.state).not.toBe("unavailable");
    expect(zero.points.at(-1)!.load).toBe(0);
    expect(zero.atl!).toBeLessThan(50);

    const days: DailyLoad[] = Array.from({ length: 20 }, (_, i) => ({ day: `2026-07-${pad(i + 1)}`, load: i + 1 === 12 ? null : 50 }));
    const missing = evaluate(days);
    expect(missing.state).toBe("unavailable");
    expect(missing.contiguousDays).toBe(8);
    expect(missing.startDay).toBe("2026-07-13");
  });

  it("missing calendar day breaks suffix", () => {
    const days = Array.from({ length: 20 }, (_, i) => i + 1)
      .filter((d) => d !== 15)
      .map((d) => ({ day: `2026-06-${pad(d)}`, load: 50 }));
    const r = evaluate(days);
    expect(r.contiguousDays).toBe(5);
    expect(r.startDay).toBe("2026-06-16");
    expect(r.unavailableReason).toBe("NOT_ENOUGH_CONTIGUOUS_DAYS");
  });

  it("explicit target ignores future rows; missing target fails closed", () => {
    const days = Array.from({ length: 25 }, (_, i) => ({ day: `2026-05-${pad(i + 1)}`, load: i + 1 }));
    const r = evaluate(days, "2026-05-20");
    expect(r.contiguousDays).toBe(20);
    expect(r.endDay).toBe("2026-05-20");
    expect(r.points.at(-1)!.day).toBe("2026-05-20");
    expect(evaluate(days, "2026-05-30").unavailableReason).toBe("MISSING_TARGET_DAY");
  });

  it("input order does not change result", () => {
    const days = Array.from({ length: 20 }, (_, i) => ({ day: `2026-03-${pad(i + 1)}`, load: 21 + i }));
    expect(evaluate([...days].reverse())).toEqual(evaluate(days));
  });

  it("invalid inputs fail closed", () => {
    expect(evaluate([{ day: "2026-02-30", load: 10 }]).unavailableReason).toBe("INVALID_DAY");
    expect(
      evaluate([
        { day: "2026-02-01", load: 10 },
        { day: "2026-02-01", load: 11 },
      ]).unavailableReason,
    ).toBe("DUPLICATE_DAY");
    expect(evaluate([{ day: "2026-02-01", load: -1 }]).unavailableReason).toBe("INVALID_LOAD");
    expect(evaluate([{ day: "2026-02-01", load: NaN }]).unavailableReason).toBe("INVALID_LOAD");
    expect(
      evaluateDense(fill(42, 50), {
        chronicTimeConstantDays: 0,
        acuteTimeConstantDays: 7,
        primeDays: 7,
        minimumDays: 14,
        establishedDays: 42,
      }).unavailableReason,
    ).toBe("INVALID_CONFIGURATION");
  });

  it("leap day and month boundary stay contiguous", () => {
    const dates = [
      "2024-02-22", "2024-02-23", "2024-02-24", "2024-02-25", "2024-02-26", "2024-02-27", "2024-02-28",
      "2024-02-29", "2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04", "2024-03-05", "2024-03-06",
    ];
    const r = evaluate(dates.map((day) => ({ day, load: 30 })));
    expect(r.state).toBe("building");
    expect(r.contiguousDays).toBe(14);
    expect(r.ctl).toBeCloseTo(30, 12);
    expect(r.atl).toBeCloseTo(30, 12);
  });

  it("dense day labels cross leap day and year boundary", () => {
    const r = evaluateDense(fill(367, 30));
    expect(r.startDay).toBe("2000-01-01");
    expect(r.endDay).toBe("2001-01-01");
    expect(r.points[0].day).toBe("2000-01-07");
    expect(r.points[52].day).toBe("2000-02-28");
    expect(r.points[53].day).toBe("2000-02-29");
    expect(r.points[54].day).toBe("2000-03-01");
    expect(r.points[359].day).toBe("2000-12-31");
    expect(r.points.at(-1)!.day).toBe("2001-01-01");
  });
});
