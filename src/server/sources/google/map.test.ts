import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mapDaily, mapExercises, mapHeartRate, mapRollup, mapSleep, mapStepsMinutes } from "./map";

const TZ = "Asia/Kolkata"; // UTC+5:30: a night's UTC date and its local wake day differ
const fixture = (name: string): { dataPoints?: unknown[]; rollupDataPoints?: unknown[] } =>
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", `${name}.json`), "utf8"));
const points = (name: string) => fixture(name).dataPoints ?? fixture(name).rollupDataPoints ?? [];
const ts = (iso: string) => Date.parse(iso) / 1000;

describe("daily mappers", () => {
  it("map each daily type's fields to daily_metrics columns, casting int64 strings", () => {
    expect(mapDaily("daily-heart-rate-variability", points("daily-heart-rate-variability"), TZ)).toEqual([
      { day: "2026-10-02", hrvMs: 44.5, hrvDeepMs: 49.25 },
      { day: "2026-10-01", hrvMs: 41.5, hrvDeepMs: 47 },
    ]);
    expect(mapDaily("daily-resting-heart-rate", points("daily-resting-heart-rate"), TZ)).toContainEqual({
      day: "2026-10-01",
      rhrBpm: 57,
      rhrMethod: "WITH_SLEEP",
    });
    expect(mapDaily("daily-respiratory-rate", points("daily-respiratory-rate"), TZ)).toEqual([{ day: "2026-10-01", respBpm: 14.2 }]);
    // Raw nightly temperature, not a deviation from Google's baseline.
    expect(mapDaily("daily-sleep-temperature-derivations", points("daily-sleep-temperature-derivations"), TZ)).toEqual([
      { day: "2026-10-01", nightlyTempC: 34.12 },
    ]);
    expect(mapDaily("daily-oxygen-saturation", points("daily-oxygen-saturation"), TZ)).toEqual([{ day: "2026-10-01", spo2Pct: 96.4 }]);
    expect(mapDaily("daily-vo2-max", points("daily-vo2-max"), TZ)).toEqual([{ day: "2026-09-30", vo2maxDaily: 44.1 }]);
  });

  it("sample types land on their local day, the latest reading of the day winning", () => {
    expect(mapDaily("weight", points("weight"), TZ)).toEqual([{ day: "2026-09-30", weightKg: 72.1 }]);
    expect(mapDaily("body-fat", points("body-fat"), TZ)).toEqual([{ day: "2026-09-30", bodyFatPct: 18.2 }]);
    // 13:10Z is 18:40 local, still 1 October.
    expect(mapDaily("run-vo2-max", points("run-vo2-max"), TZ)).toEqual([{ day: "2026-10-01", vo2maxRun: 46.3 }]);
  });

  it("dailyRollUp gives step totals and calories by civil day, skipping a day with no value", () => {
    expect(mapRollup("steps", points("steps.dailyRollUp"))).toEqual([
      { day: "2026-10-02", steps: 1200 },
      { day: "2026-10-01", steps: 8421 },
    ]);
    expect(mapRollup("total-calories", points("total-calories.dailyRollUp"))).toEqual([{ day: "2026-10-01", calories: 2310.5 }]);
  });

  it("ignores points without the type's payload", () => {
    expect(mapDaily("daily-respiratory-rate", [{ dataSource: {} }, null, 3], TZ)).toEqual([]);
  });
});

describe("intraday mappers", () => {
  it("heart rate: band only, int64 cast, a repeated second keeps the last point", () => {
    const hr = mapHeartRate(points("heart-rate"));
    expect(hr.get(ts("2026-10-01T00:00:00Z"))).toBe(53);
    expect(hr.get(ts("2026-10-01T00:00:02Z"))).toBe(51);
    expect(hr.has(ts("2026-10-01T12:45:01Z"))).toBe(false); // HEALTH_CONNECT
    expect(hr.size).toBe(5);
  });

  it("steps per minute: maximum across sources, a long interval spread over its minutes", () => {
    const steps = mapStepsMinutes(points("steps"));
    expect(steps.get(ts("2026-10-01T03:00:00Z"))).toBe(55); // band 40, phone 55
    expect([1, 2, 3].map((m) => steps.get(ts("2026-10-01T03:00:00Z") + 60 * m))).toEqual([33, 33, 34]);
    expect(steps.get(ts("2026-10-02T05:40:00Z"))).toBe(12);
  });
});

describe("sleep", () => {
  const { sessions, segments } = mapSleep(points("sleep"), TZ);
  const byId = (s: string) => sessions.find((x) => x.id.endsWith(s))!;

  it("a session from 23:30 to 07:10 maps to its local wake day, with its summary and lowercase stages", () => {
    const a = byId("sleep-a");
    expect(a).toMatchObject({
      day: "2026-10-01",
      startTs: ts("2026-09-30T18:00:00Z"),
      endTs: ts("2026-10-01T01:40:00Z"),
      isMain: true,
      processed: true,
      stagesStatus: "SUCCEEDED",
      asleepMin: 440,
      awakeMin: 20,
      deepMin: 60,
      lightMin: 320,
      remMin: 60,
      source: "FITBIT",
    });
    const mine = segments.filter((g) => g.sessionId === a.id);
    expect(mine.map((g) => g.stage)).toEqual(["awake", "light", "deep", "rem", "light", "awake"]);
    expect(mine[0]).toEqual({ sessionId: a.id, startTs: ts("2026-09-30T18:00:00Z"), endTs: ts("2026-09-30T18:10:00Z"), stage: "awake" });
  });

  it("when two sessions overlap, the one flagged mainSleep wins even if shorter", () => {
    expect(byId("sleep-b")).toMatchObject({ day: "2026-10-02", isMain: true });
    expect(byId("sleep-c")).toMatchObject({ day: "2026-10-02", isMain: false, processed: false, stagesStatus: null });
    expect(byId("sleep-c").endTs - byId("sleep-c").startTs).toBeGreaterThan(byId("sleep-b").endTs - byId("sleep-b").startTs);
  });

  it("a session whose stages did not succeed keeps its summary minutes and has no segments", () => {
    const d = byId("sleep-d");
    expect(d).toMatchObject({ day: "2026-09-30", isMain: true, stagesStatus: "FAILED", asleepMin: 350, awakeMin: 40, deepMin: null });
    expect(segments.filter((g) => g.sessionId === d.id)).toEqual([]);
  });

  it("with no mainSleep flag on the day, the longer session is main, whatever the order", () => {
    const unflag = (p: unknown) => {
      const c = structuredClone(p) as { sleep: { metadata?: unknown } };
      delete c.sleep.metadata;
      return c;
    };
    const day2 = points("sleep").slice(1, 3).map(unflag); // b (shorter) and c (longer)
    for (const order of [day2, [...day2].reverse()]) {
      const main = mapSleep(order, TZ).sessions.filter((s) => s.isMain);
      expect(main.map((s) => s.id)).toEqual(["users/me/dataTypes/sleep/dataPoints/sleep-c"]);
    }
  });

  it("an explicit mainSleep false on every session of a day leaves the day with no main sleep", () => {
    const nap = structuredClone(points("sleep")[1]) as { sleep: { metadata: { mainSleep: boolean } } };
    nap.sleep.metadata.mainSleep = false;
    expect(mapSleep([nap], TZ).sessions[0].isMain).toBe(false);
  });

  it("an unrecognised stage type drops the whole hypnogram", () => {
    const odd = structuredClone(points("sleep")[0]) as { sleep: { stages: { type: string }[] } };
    odd.sleep.stages[2].type = "RESTLESS";
    expect(mapSleep([odd], TZ).segments).toEqual([]);
  });
});

describe("exercises", () => {
  it("map to their local start day with type, name, calories and metres", () => {
    expect(mapExercises(points("exercise"), TZ)).toEqual([
      {
        id: "users/me/dataTypes/exercise/dataPoints/exercise-a",
        day: "2026-10-01",
        startTs: ts("2026-10-01T12:30:00Z"),
        endTs: ts("2026-10-01T13:10:00Z"),
        type: "RUNNING",
        name: "Run",
        calories: 410.5,
        distanceM: 6543,
        source: "FITBIT",
      },
    ]);
  });
});
