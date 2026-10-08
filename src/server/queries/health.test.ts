import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { dailyMetrics, dailyValues, healthRecords } from "../db/schema";
import { SEED_DAYS } from "../sources/seed/scenario";
import { copyDb, ctxFor, dayAt, seeded, USER } from "../testing";
import { getHealthspan, getMonitor } from "./health";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

const today = dayAt(SEED_DAYS - 1);

describe("getMonitor heart rhythm", () => {
  it("lists the seeded ECG readings newest first, with Fitbit's labels, and counts the notification", async () => {
    const { ecg, irn } = (await getMonitor(today, ctxFor(db))).heartRhythm;
    expect(ecg.map((e) => e.label)).toEqual(["Normal sinus rhythm", "Inconclusive: high heart rate", "Normal sinus rhythm"]);
    expect(ecg.map((e) => e.tone)).toEqual(["optimal", "neutral", "optimal"]);
    expect(ecg[0].at).toBeGreaterThan(ecg[1].at);
    expect(ecg[0].avgBpm).toBe(66);
    expect(irn).toMatchObject({ count: 1, latestDay: dayAt(SEED_DAYS - 22) });
  });

  it("shows only what had happened by the selected day", async () => {
    const { ecg, irn } = (await getMonitor(dayAt(SEED_DAYS - 30), ctxFor(db))).heartRhythm;
    expect(ecg).toHaveLength(1);
    expect(irn).toEqual({ count: 0, latestAt: null, latestDay: null });
  });

  it("reads an unknown classification as no result, never as normal", async () => {
    const db2 = await copyDb(db);
    await db2.insert(healthRecords).values({ userId: USER, id: "x", kind: "ecg", ts: 1, day: today, data: { result: "SOMETHING_NEW" } });
    const x = (await getMonitor(today, ctxFor(db2))).heartRhythm.ecg.find((e) => e.id === "x")!;
    expect(x).toMatchObject({ label: "No result", tone: "neutral", avgBpm: null });
  });
});

describe("getMonitor measurements", () => {
  it("shows weight and body fat against the readings of the 30 days before, and hides metrics never recorded", async () => {
    const m = (await getMonitor(today, ctxFor(db))).measurements;
    expect(m.map((x) => x.key)).toEqual(["weight", "body_fat"]);
    const w = async (d: string) =>
      (await db.select({ w: dailyMetrics.weightKg }).from(dailyMetrics).where(and(eq(dailyMetrics.userId, USER), eq(dailyMetrics.day, d))))[0].w;
    // Monthly weigh-ins on day indexes 2, 32, ... 152: the latest is 152, compared with 122.
    expect(m[0].metric.value).toBe(await w(dayAt(152)));
    expect(m[0].average).toBe(await w(dayAt(122)));
    expect(m[0].caption).toMatch(/^\w{3}, \w{3} \d+$/);
  });

  it("adds blood glucose and core temperature once there is a value, and says no data before the first", async () => {
    const db2 = await copyDb(db);
    await db2.insert(dailyValues).values([
      { userId: USER, day: dayAt(170), key: "glucose", value: 98 },
      { userId: USER, day: dayAt(175), key: "glucose", value: 104 },
      { userId: USER, day: dayAt(176), key: "core_temp", value: 36.8 },
    ]);
    const m = (await getMonitor(today, ctxFor(db2))).measurements;
    expect(m.map((x) => x.key)).toEqual(["weight", "body_fat", "glucose", "core_temp"]);
    expect(m[2]).toMatchObject({ metric: { value: 104 }, average: 98, unit: "mg/dL" });
    expect(m[3].average).toBeNull();
    const before = (await getMonitor(dayAt(160), ctxFor(db2))).measurements[2];
    expect(before.metric).toMatchObject({ value: null, reason: "no_data" });
  });
});

describe("getHealthspan factors", () => {
  it("each factor carries its 6-month and 30-day means, how it stands and its Trend View", async () => {
    const vm = await getHealthspan(dayAt(170), ctxFor(db));
    const shown = vm.contributors.filter((c) => c.metric.value !== null);
    expect(shown.length).toBeGreaterThan(5);
    for (const c of shown) {
      expect(c.recent, c.key).not.toBeNull();
      expect(c.state?.title, c.key).toMatch(/^(Outperforming|On track|Room to improve)$/);
    }
    expect(Object.fromEntries(vm.contributors.map((c) => [c.key, c.trendHref]))).toMatchObject({
      sleepHours: "/trend/hours",
      sri: "/trend/consistency",
      zone13: "/trend/zones13",
      restingHr: "/trend/rhr",
      vo2max: "/trend/vo2max",
      leanMass: "/trend/lean_mass",
    });
  });
});
