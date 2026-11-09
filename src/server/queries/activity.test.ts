import { beforeAll, describe, expect, it } from "vitest";
import { getActivity, withTypical } from "./activity";
import type { Db } from "../db";
import { exercises } from "../db/schema";
import { ctxFor, seeded, USER } from "../testing";

const row = (zone: number, seconds: number) => ({ zone, label: `Z${zone}`, min: 100 + zone * 10, max: null, seconds });

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("withTypical", () => {
  it("adds each zone's interquartile share range over earlier activities", () => {
    const m = { value: [row(1, 600), row(2, 0)], reason: null, provisional: false };
    const out = withTypical(m, [
      [300, 300],
      [900, 0],
      [600, 200],
    ]);
    expect(out.value?.[0].typical).toEqual({ low: 0.625, high: 0.875 });
    expect(out.value?.[1].typical).toEqual({ low: 0.125, high: 0.375 });
  });
  it("leaves the rows alone with fewer than three earlier activities", () => {
    const m = { value: [row(1, 600)], reason: null, provisional: false };
    expect(withTypical(m, [])).toBe(m);
    expect(withTypical(m, [[1], [2]])).toBe(m);
  });
});

describe("getActivity", () => {
  it("preserves the custom workout name from the source", async () => {
    await db.insert(exercises).values({
      userId: USER,
      id: "ex-custom-name",
      day: "2026-10-01",
      startTs: 1727780000,
      endTs: 1727783600,
      type: "RUNNING",
      name: "Treadmill Run",
      calories: 300,
      distanceM: 5000,
      source: "google",
    }).onConflictDoNothing();

    const vm = await getActivity("ex-custom-name", ctxFor(db));
    expect(vm).not.toBeNull();
    expect(vm?.name).toBe("Treadmill Run");
  });

  it("falls back to the generic activity name when workout name is null", async () => {
    await db.insert(exercises).values({
      userId: USER,
      id: "ex-null-name",
      day: "2026-10-01",
      startTs: 1727790000,
      endTs: 1727793600,
      type: "RUNNING",
      name: null,
      calories: 300,
      distanceM: 5000,
      source: "google",
    }).onConflictDoNothing();

    const vm = await getActivity("ex-null-name", ctxFor(db));
    expect(vm).not.toBeNull();
    expect(vm?.name).toBe("Running");
  });
});
