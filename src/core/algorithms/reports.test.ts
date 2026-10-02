import { describe, expect, it } from "vitest";
import type { TagImpact } from "./journalImpact";
import { buildReport, isoWeek, periodBounds, type ReportDay, reportPeriods } from "./reports";

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

const row = (day: string, recovery: number | null, extra: Partial<ReportDay> = {}): ReportDay => ({
  day,
  recovery,
  strain: 10,
  sleepPerf: 80,
  sleepHours: 7,
  hrv: 50,
  rhr: 55,
  acwr: null,
  sleepConsistency: 80,
  ...extra,
});

describe("ISO weeks and months", () => {
  it("weeks run Monday to Sunday and belong to the year of their Thursday", () => {
    expect(isoWeek("2026-09-28")).toBe("2026-W40"); // Monday
    expect(isoWeek("2026-10-04")).toBe("2026-W40"); // Sunday
    expect(isoWeek("2026-10-05")).toBe("2026-W41");
    expect(isoWeek("2026-01-01")).toBe("2026-W01"); // a Thursday
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
    expect(periodBounds("2026-W40")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(periodBounds("2026-W53")).toEqual({ start: "2026-12-28", end: "2027-01-03" });
    expect(periodBounds("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });
});

describe("buildReport", () => {
  // Week 39 (Sep 21–27) at recovery 50, week 40 (Sep 28–Oct 4) at 30, 40, … 90, then Oct 5–6 of week 41.
  const prev = Array.from({ length: 7 }, (_, i) => row(addDays("2026-09-21", i), 50, { strain: 8, hrv: 45 }));
  const week = Array.from({ length: 7 }, (_, i) => row(addDays("2026-09-28", i), 30 + 10 * i, { strain: 12, acwr: i === 6 ? 1.4 : 1 }));
  const tail = [row("2026-10-05", 60), row("2026-10-06", null)];
  const rows = [...tail, ...week, ...prev];

  it("a full week gives averages and deltas against the previous week", () => {
    const r = buildReport("2026-W40", rows);
    expect(r).toMatchObject({ kind: "week", start: "2026-09-28", end: "2026-10-04", partial: false, days: 7 });
    expect(r.averages.recovery).toBe(60);
    expect(r.deltas.recovery).toBe(10);
    expect(r.deltas.strain).toBe(4);
    expect(r.deltas.hrv).toBe(5);
    expect(r.deltas.sleepHours).toBe(0);
    expect(r.best).toEqual({ day: "2026-10-04", recovery: 90 });
    expect(r.worst).toEqual({ day: "2026-09-28", recovery: 30 });
    // The last day's ACWR: 1.4 is building fast.
    expect(r.trainingBalance).toEqual({ acwr: 1.4, status: "LOAD_BUILDING_FAST" });
    expect(r.sleepConsistency).toBe(80);
  });

  it("band counts add up to the days with recovery", () => {
    const r = buildReport("2026-W40", rows);
    // 30 red; 40, 50, 60 yellow; 70, 80, 90 green.
    expect(r.bands).toEqual({ red: 1, yellow: 3, green: 3 });
    const w41 = buildReport("2026-W41", rows);
    expect(w41.days).toBe(2);
    expect(w41.bands.red + w41.bands.yellow + w41.bands.green).toBe(1);
  });

  it("a week the data does not cover is partial", () => {
    expect(buildReport("2026-W41", rows).partial).toBe(true); // in progress
    expect(buildReport("2026-W39", rows).partial).toBe(false);
    expect(buildReport("2026-09", rows).partial).toBe(true); // history starts Sep 21
    expect(buildReport("2026-W39", rows).deltas.recovery).toBeNull(); // no previous week
  });

  it("months follow calendar boundaries", () => {
    const sep = buildReport("2026-09", rows);
    const oct = buildReport("2026-10", rows);
    expect(sep).toMatchObject({ kind: "month", start: "2026-09-01", end: "2026-09-30", days: 10 });
    expect(oct).toMatchObject({ end: "2026-10-31", days: 6, partial: true });
    // Sep: 7 × 50 + 30 + 40 + 50; Oct: 60 + 70 + 80 + 90 + 60 (Oct 6 has none).
    expect(sep.averages.recovery).toBeCloseTo(470 / 10, 10);
    expect(oct.averages.recovery).toBeCloseTo(360 / 5, 10);
    expect(oct.deltas.recovery).toBeCloseTo(72 - 47, 10);
    expect(reportPeriods(rows)).toEqual(["2026-W39", "2026-W40", "2026-W41", "2026-09", "2026-10"]);
  });

  it("keeps the top 3 clear recovery effects by |Δ|", () => {
    const impact = (tag: string, delta: number, label: string) =>
      ({ tag, effects: { recovery: { delta, label } } }) as unknown as TagImpact;
    const impacts = [impact("a", -3, "negative"), impact("b", 9, "no_clear_effect"), impact("c", 5, "positive"), impact("d", -12, "negative"), impact("e", 4, "positive")];
    expect(buildReport("2026-W40", rows, impacts).topImpacts.map((t) => t.tag)).toEqual(["d", "c", "e"]);
  });

  it("an empty period has nulls and zero counts", () => {
    const r = buildReport("2025-W01", rows);
    expect(r).toMatchObject({ days: 0, partial: true, best: null, worst: null, trainingBalance: null, sleepConsistency: null });
    expect(r.averages.recovery).toBeNull();
    expect(r.bands).toEqual({ red: 0, yellow: 0, green: 0 });
  });
});
