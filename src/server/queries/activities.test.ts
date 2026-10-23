// The /activities journal: day groups newest first, today always present, and "Show older".
import { beforeAll, describe, expect, it } from "vitest";
import { type Db, row, sql } from "../db";
import { ctxFor, seeded, USER } from "../testing";
import { addDays } from "../time";
import { getActivities } from "./activities";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getActivities", () => {
  it("groups the window's workouts by day, newest first, with today leading", async () => {
    const vm = await getActivities(30, ctxFor(db));
    const days = vm.groups.map((g) => g.day);
    expect(days[0]).toBe(vm.today);
    expect([...days].sort().reverse()).toEqual(days);
    const { n } = (await row<{ n: number }>(db, sql`select count(*) n from exercises where user_id = ${USER} and day > ${addDays(vm.today, -30)}`))!;
    expect(vm.groups.reduce((a, g) => a + g.items.length, 0)).toBe(n);
    for (const g of vm.groups) for (const a of g.items) expect(a.day).toBe(g.day);
    expect(vm.older).toBe(true);
  });

  it("has nothing older once the window covers every workout", async () => {
    expect((await getActivities(3650, ctxFor(db))).older).toBe(false);
  });
});

it("deduplicates stored workouts consistently in lists, old detail links and pipeline inputs", async () => {
  const { freshDb, addUser, OPTS, TZ } = await import("../testing");
  const { exercises, dailyScores } = await import("../db/schema");
  const { recompute } = await import("../pipeline");
  const { exercisesBetween } = await import("./common");
  const { getActivity } = await import("./activity");
  const { load } = await import("../pipeline/data");
  const { localMidnight } = await import("../time");
  const testDb = await freshDb({ install: false });
  const other = await addUser(testDb);
  const startTs = localMidnight("2026-10-01", TZ) + 36000;
  const original = { userId: USER, id: "a", day: "2026-10-01", startTs, endTs: startTs + 1800, type: "WALKING", distanceM: 1900, source: "FITBIT" };
  await testDb.insert(exercises).values([
    original,
    { ...original, id: "b", endTs: original.endTs + 3 },
    { ...original, id: "c", startTs: startTs + 3600, endTs: startTs + 5400 },
    { ...original, userId: other, id: "0" },
  ]);
  const ctx = ctxFor(testDb);
  expect((await exercisesBetween(ctx, original.day, original.day)).map((e) => e.id)).toEqual(["a", "c"]);
  expect((await getActivities(30, ctx)).groups.flatMap((g) => g.items).map((e) => e.id).sort()).toEqual(["a", "c"]);
  expect((await getActivity("b", ctx))?.id).toBe("a");
  expect((await load(testDb, OPTS))?.exercises.map((e) => e.id)).toEqual(["a", "c"]);
  await recompute(testDb, OPTS);
  const [scored] = await testDb.select().from(dailyScores);
  expect(scored.activities).toMatchObject([{ id: "a" }, { id: "c" }]);
  expect((await testDb.select().from(exercises))).toHaveLength(4);
});
