// Strain's activity extras and the distance on activities (spec §11 EX1, EX3).
import { beforeAll, describe, expect, it } from "vitest";
import { type Db, row, sql } from "../db";
import { ctxFor, dayAt, seeded, USER } from "../testing";
import { getActivity } from "./activity";
import { activityItem, distanceOf, type ExerciseRow } from "./common";
import { getStrain, STRAIN_EXTRAS } from "./strain";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

const one = async <T>(q: ReturnType<typeof sql>) => Object.values((await row<Record<string, T>>(db, q))!)[0];

describe("getStrain summary", () => {
  it("lists the extras after Steps with the catalogue's unit, format and direction, and a 30-day average", async () => {
    const vm = await getStrain(dayAt(178), ctxFor(db));
    expect(vm.summary.map((k) => k.key)).toEqual(["zones13", "zones45", "strength", "steps", ...STRAIN_EXTRAS]);
    const distance = vm.summary.find((k) => k.key === "distance")!;
    expect(distance).toMatchObject({ label: "Distance", unit: "km", format: "decimal2", direction: "up" });
    expect(distance.metric.value).toBeGreaterThan(0);
    expect(distance.average).toBeGreaterThan(0);
    const avg = await one<number>(sql`select avg(value) from daily_values where user_id = ${USER} and key = 'azm' and day >= ${dayAt(148)} and day <= ${dayAt(177)}`);
    expect(vm.summary.find((k) => k.key === "azm")!.average).toBeCloseTo(avg, 6);
    expect(vm.summary.find((k) => k.key === "active_calories")!.direction).toBe("neutral");
  });

  it("is honest without a value: band_not_worn on the band-off day, no_data on a worn day the account has none", async () => {
    const off = (await getStrain(dayAt(156), ctxFor(db))).summary.find((k) => k.key === "floors")!;
    expect(off.metric).toMatchObject({ value: null, reason: "band_not_worn" });
    await db.execute(sql`delete from daily_values where user_id = ${USER} and day = ${dayAt(170)} and key = 'floors'`);
    const missing = (await getStrain(dayAt(170), ctxFor(db))).summary.find((k) => k.key === "floors")!;
    expect(missing.metric).toMatchObject({ value: null, reason: "no_data" });
  });
});

describe("activity distance", () => {
  const ex = (type: string, distanceM: number | null): ExerciseRow => ({ id: "x", day: dayAt(1), startTs: 0, endTs: 30 * 60, type, name: null, calories: null, distanceM });

  it("gives km for any recorded distance, pace only for runs and walks, nothing for none or zero", async () => {
    expect(distanceOf(ex("RUNNING", 6000))).toEqual({ distanceKm: 6, paceS: 300 });
    expect(distanceOf(ex("WALKING", 2500))).toEqual({ distanceKm: 2.5, paceS: 720 });
    expect(distanceOf(ex("BIKING", 15000))).toEqual({ distanceKm: 15, paceS: null });
    expect(distanceOf(ex("STRENGTH_TRAINING", null))).toEqual({ distanceKm: null, paceS: null });
    expect(distanceOf(ex("RUNNING", 0))).toEqual({ distanceKm: null, paceS: null });
    expect(activityItem(ex("RUNNING", 6000), undefined)).toMatchObject({ distanceKm: 6, paceS: 300 });
  });

  it("the activity screen adds Distance and Pace for a run, Distance for a ride, neither for strength", async () => {
    const ctx = ctxFor(db);
    const first = (type: string) => one<string>(sql`select id from exercises where user_id = ${USER} and type = ${type} order by start_ts desc limit 1`);
    const keys = async (type: string) => (await getActivity(await first(type), ctx))!.stats.map((k) => k.key);
    expect(await keys("RUNNING")).toEqual(["duration", "distance", "pace", "avgHr", "maxHr", "calories"]);
    expect(await keys("BIKING")).toEqual(["duration", "distance", "avgHr", "maxHr", "calories"]);
    expect(await keys("STRENGTH_TRAINING")).toEqual(["duration", "avgHr", "maxHr", "calories"]);
    const run = (await getActivity(await first("RUNNING"), ctx))!.stats;
    expect(run.find((k) => k.key === "pace")).toMatchObject({ unit: "/km", format: "pace" });
    expect(run.find((k) => k.key === "pace")!.metric.value).toBeGreaterThan(180);
    expect(run.find((k) => k.key === "pace")!.average).not.toBeNull();
  });
});
