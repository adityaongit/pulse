import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { ctxFor, dayAt, seeded } from "../testing";
import { activityItem, dayStartOf, daySpans, type ExerciseRow, loadDays, ms } from "./common";
import { getStress } from "./health";
import { hrChart } from "./strain";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

const days = Array.from({ length: 170 }, (_, i) => dayAt(i + 8));

describe("daySpans", () => {
  it("clips the main sleep to the day start and keeps naps as stored", async () => {
    const ctx = ctxFor(db);
    const rows = await loadDays(ctx, days[0], days[days.length - 1]);
    const day = days.find((d) => {
      const s = rows.get(d)?.sleep;
      return s?.main && s.main.start < dayStartOf(ctx, d) && s.naps.length > 0;
    });
    expect(day).toBeDefined();
    const row = rows.get(day!)!;
    const start = dayStartOf(ctx, day!);
    const spans = await daySpans(ctx, row, day!, start);
    expect(spans.find((s) => s.kind === "sleep")).toEqual({ kind: "sleep", label: "Sleep", start: ms(start), end: ms(row.sleep!.main!.end) });
    expect(spans.filter((s) => s.kind === "nap")).toEqual(row.sleep!.naps.map((n) => ({ kind: "nap", label: "Nap", start: ms(n.start), end: ms(n.end) })));
  });

  it("the stress chart and the HR chart show the same spans for a day", async () => {
    const ctx = ctxFor(db);
    const rows = await loadDays(ctx, days[0], days[days.length - 1]);
    const day = days.find((d) => (rows.get(d)?.sleep?.naps.length ?? 0) > 0)!;
    const stress = (await getStress(day, ctx)).chart.value;
    const hr = (await hrChart(ctx, rows.get(day), day, false)).value;
    expect(stress?.spans.length).toBeGreaterThan(0);
    expect(stress?.spans).toEqual(hr?.spans);
  });

  it("an activity window marks workouts only, never the sleep or naps it overlaps", async () => {
    const ctx = ctxFor(db);
    const rows = await loadDays(ctx, days[0], days[days.length - 1]);
    const day = days.find((d) => (rows.get(d)?.sleep?.naps.length ?? 0) > 0)!;
    const start = dayStartOf(ctx, day);
    const hr = (await hrChart(ctx, rows.get(day), day, false, start, start + 86_400)).value;
    expect(hr?.spans.every((s) => s.kind === "workout")).toBe(true);
  });
});

describe("activityItem", () => {
  it("uses the stored exercise name when present", () => {
    const e: ExerciseRow = {
      id: "ex-run",
      day: "2026-10-01",
      startTs: 1727780000,
      endTs: 1727783600,
      type: "RUNNING",
      name: "Treadmill Run",
      calories: 300,
      distanceM: 5000,
    };
    const item = activityItem(e, undefined);
    expect(item.name).toBe("Treadmill Run");
  });

  it("uses the stored exercise name for strength workouts", () => {
    const e: ExerciseRow = {
      id: "ex-core",
      day: "2026-10-01",
      startTs: 1727780000,
      endTs: 1727783600,
      type: "STRENGTH_TRAINING",
      name: "Core Training",
      calories: 200,
      distanceM: null,
    };
    const item = activityItem(e, undefined);
    expect(item.name).toBe("Core Training");
  });

  it("falls back to the generic activity name when name is null or whitespace", () => {
    const eNull: ExerciseRow = {
      id: "ex-null",
      day: "2026-10-01",
      startTs: 1727780000,
      endTs: 1727783600,
      type: "RUNNING",
      name: null,
      calories: 300,
      distanceM: 5000,
    };
    expect(activityItem(eNull, undefined).name).toBe("Running");

    const eBlank: ExerciseRow = {
      ...eNull,
      name: "   ",
    };
    expect(activityItem(eBlank, undefined).name).toBe("Running");
  });
});
