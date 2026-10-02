import fs from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../../db";
import {
  dailyMetrics,
  exercises,
  hrSamples,
  intradayDirty,
  oauthTokens,
  sleepSegments,
  sleepSessions,
  stepsMinutes,
  syncState,
} from "../../db/schema";
import { BACKFILL_DAYS, createGoogleSource } from "./sync";

const TZ = "Asia/Kolkata"; // fixed +05:30, which the stub's civil-time filter relies on
const NOW = Date.parse("2026-10-02T06:00:00Z"); // 11:30 local
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Obj = Record<string, unknown>;
const at = (v: unknown, p: string) => p.split(".").reduce<unknown>((o, k) => (o as Obj | undefined)?.[k], v);
const civil = (d: unknown) =>
  ["year", "month", "day"].map((k, i) => String(at(d, k)).padStart(i ? 2 : 4, "0")).join("-");
const fixture = (name: string): unknown[] => {
  const j = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "__fixtures__", `${name}.json`), "utf8"));
  return j.dataPoints ?? j.rollupDataPoints;
};
const LIST_TYPES = [
  "daily-heart-rate-variability",
  "daily-resting-heart-rate",
  "daily-respiratory-rate",
  "daily-sleep-temperature-derivations",
  "daily-oxygen-saturation",
  "daily-vo2-max",
  "run-vo2-max",
  "weight",
  "body-fat",
  "sleep",
  "exercise",
  "heart-rate",
  "steps",
];
const camel = (s: string) => s.replace(/[-_](\w)/g, (_, c: string) => c.toUpperCase());
const payload = (p: unknown, type: string) => at(p, camel(type)) as Obj;

/** The member value a filter compares, as a sortable number or civil date string. */
function memberValue(p: unknown, type: string, member: string): number | string {
  const o = payload(p, type);
  if (member === "date") return civil(o.date);
  if (member === "interval.civil_start_time") return Date.parse(String(at(o, "interval.startTime")));
  return Date.parse(String(at(o, camel(member))));
}
const bound = (member: string, s: string) =>
  member === "date" ? s : member === "interval.civil_start_time" ? Date.parse(`${s}+05:30`) : Date.parse(s);

let db: Db;
let data: Record<string, unknown[]>;
beforeEach(() => {
  db = openDb(":memory:");
  db.insert(oauthTokens)
    .values({ id: 1, accessToken: "at", refreshToken: "rt", expiresAt: NOW / 1000 + 86_400, scope: "s", updatedAt: NOW / 1000 })
    .run();
  data = Object.fromEntries(LIST_TYPES.map((t) => [t, fixture(t)]));
  data["steps:rollup"] = fixture("steps.dailyRollUp");
  data["total-calories:rollup"] = fixture("total-calories.dailyRollUp");
});

/** A source over a stubbed Google that answers each request from the fixtures inside its window. */
function setup(o: { failing?: string[]; onRequest?: (type: string, filter: string | null) => void } = {}) {
  let clock = NOW;
  const calls: { type: string; filter: string | null }[] = [];
  const fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const [, type, rollup] = /dataTypes\/([^/]+)\/dataPoints(:dailyRollUp)?$/.exec(url.pathname)!;
    const filter = url.searchParams.get("filter");
    calls.push({ type, filter });
    o.onRequest?.(type, filter);
    if (o.failing?.includes(type)) {
      return json({ error: { code: 400, status: "INVALID_ARGUMENT", message: "secret body text" } }, 400);
    }
    if (rollup) {
      const { range } = JSON.parse(String(init.body));
      const [lo, hi] = [civil(range.start.date), civil(range.end.date)];
      const pts = data[`${type}:rollup`].filter((p) => {
        const d = civil(at(p, "civilStartTime.date"));
        return d >= lo && d < hi;
      });
      return json({ rollupDataPoints: pts });
    }
    const [, member, lo, hi] = /^\w+\.(\S+) >= "([^"]+)" AND \S+ < "([^"]+)"$/.exec(filter!)!;
    const pts = data[type].filter((p) => {
      const v = memberValue(p, type, member);
      return v >= bound(member, lo) && v < bound(member, hi);
    });
    return json({ dataPoints: pts });
  }) as unknown as typeof globalThis.fetch;
  const log = { error: vi.fn() };
  const source = createGoogleSource({
    db,
    google: { clientId: "cid", clientSecret: "cs" },
    timeZone: TZ,
    fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log,
  });
  return {
    source,
    calls,
    log,
    advance: (ms: number) => (clock += ms),
  };
}

const counts = () =>
  Object.fromEntries(
    Object.entries({ dailyMetrics, sleepSessions, sleepSegments, exercises, hrSamples, stepsMinutes }).map(([k, t]) => [
      k,
      db.select({ n: sql<number>`count(*)` }).from(t).get()!.n,
    ]),
  );
const dirtyDays = () => db.select().from(intradayDirty).all().map((r) => r.day).sort();
const state = (type: string) => db.select().from(syncState).where(eq(syncState.type, type)).get();
const lowerBound = (f: string | null) => /"([^"]+)"/.exec(f!)![1];

describe("google sync", () => {
  it("does nothing before the account is connected", async () => {
    db.delete(oauthTokens).run();
    const { source, calls } = setup();
    expect(await source.pull()).toEqual({ changed: false });
    expect(calls).toEqual([]);
  });

  it("first connect backfills 180 days oldest first, with monotonic N-of-180 progress", async () => {
    const progress: [number | null, number | null][] = [];
    const { source, calls } = setup({
      onRequest: (type) => {
        if (type !== "heart-rate") return;
        const s = state("heart-rate");
        progress.push([s?.backfillDaysDone ?? null, s?.backfillDaysTotal ?? null]);
      },
    });
    expect(await source.pull()).toEqual({ changed: true });

    const hr = calls.filter((c) => c.type === "heart-rate");
    expect(hr).toHaveLength(BACKFILL_DAYS); // one local day per request
    expect(lowerBound(hr[0].filter)).toBe("2026-04-05T18:30:00.000Z"); // local midnight, 6 April
    const starts = hr.map((c) => Date.parse(lowerBound(c.filter)));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));

    expect(progress[0]).toEqual([0, 180]);
    progress.slice(1).forEach(([done], i) => expect(done).toBeGreaterThanOrEqual(progress[i][0]!));
    expect(progress.at(-1)).toEqual([179, 180]);
    expect(state("heart-rate")).toMatchObject({ backfillDaysDone: 180, backfillDaysTotal: 180, lastError: null });

    // The normalized tables are filled the way the seed fills them.
    expect(db.select().from(dailyMetrics).where(eq(dailyMetrics.day, "2026-10-01")).get()).toEqual({
      day: "2026-10-01",
      hrvMs: 41.5,
      hrvDeepMs: 47,
      rhrBpm: 57,
      rhrMethod: "WITH_SLEEP",
      respBpm: 14.2,
      nightlyTempC: 34.12,
      spo2Pct: 96.4,
      vo2maxDaily: null,
      vo2maxRun: 46.3,
      steps: 8421,
      calories: 2310.5,
      weightKg: null,
      bodyFatPct: null,
      source: "google",
    });
    expect(counts()).toEqual({ dailyMetrics: 3, sleepSessions: 4, sleepSegments: 9, exercises: 1, hrSamples: 5, stepsMinutes: 5 });
    expect(db.select().from(sleepSegments).all().map((s) => s.stage)).not.toContain("AWAKE");
    expect(dirtyDays()).toEqual(["2026-09-30", "2026-10-01", "2026-10-02"]);
  });

  it("re-importing the same payloads leaves row counts unchanged and reports no change", async () => {
    const { source } = setup();
    await source.pull();
    const before = counts();
    db.delete(intradayDirty).run();

    expect(await source.pull()).toEqual({ changed: false }); // incremental, overlapping every fixture
    db.delete(syncState).run();
    expect(await source.pull()).toEqual({ changed: false }); // a full second backfill
    expect(counts()).toEqual(before);
    expect(dirtyDays()).toEqual([]);
  });

  it("re-fetches heart rate from synced_through minus 1 hour and marks only today dirty", async () => {
    const { source, calls, advance } = setup();
    await source.pull();
    db.delete(intradayDirty).run();
    calls.length = 0;

    advance(15 * 60_000);
    data["heart-rate"].push({
      dataSource: { platform: "FITBIT", recordingMethod: "PASSIVELY_MEASURED" },
      heartRate: { beatsPerMinute: "70", sampleTime: { physicalTime: "2026-10-02T06:05:00Z" } },
    });
    expect(await source.pull()).toEqual({ changed: true });

    // The last stored sample (05:50) is older than synced_through, so the hour runs back from it.
    const hr = calls.filter((c) => c.type === "heart-rate");
    expect(hr.map((c) => lowerBound(c.filter))).toEqual(["2026-10-02T04:50:00.000Z"]);
    // daily-* re-fetch 3 local days before synced_through.
    expect(lowerBound(calls.find((c) => c.type === "daily-resting-heart-rate")!.filter)).toBe("2026-09-29");
    expect(dirtyDays()).toEqual(["2026-10-02"]);

    // Nothing new: nothing changes and nothing is dirty.
    db.delete(intradayDirty).run();
    advance(15 * 60_000);
    expect(await source.pull()).toEqual({ changed: false });
    expect(dirtyDays()).toEqual([]);
  });

  it("one failing type does not block the others, and records only the safe error", async () => {
    const { source, log } = setup({ failing: ["daily-oxygen-saturation"] });
    expect(await source.pull()).toEqual({ changed: true });

    const failed = state("daily-oxygen-saturation")!;
    expect(failed.lastError).toBe("[google] daily-oxygen-saturation: INVALID_ARGUMENT (HTTP 400)");
    expect(failed.syncedThrough).toBeNull();
    expect(JSON.stringify(log.error.mock.calls)).not.toContain("secret");

    expect(state("heart-rate")).toMatchObject({ lastError: null, backfillDaysDone: 180 });
    expect(state("daily-respiratory-rate")?.lastError).toBeNull();
    const day = db.select().from(dailyMetrics).where(eq(dailyMetrics.day, "2026-10-01")).get();
    expect(day).toMatchObject({ spo2Pct: null, respBpm: 14.2, hrvMs: 41.5 });
  });

  it("a failed backfill resumes from its last committed chunk", async () => {
    let fail = true;
    const { source, calls } = setup({
      onRequest: (type, filter) => {
        if (type === "heart-rate" && fail && lowerBound(filter) === "2026-07-01T18:30:00.000Z") throw new Error("offline");
      },
    });
    await source.pull();
    const stuck = state("heart-rate")!;
    expect(stuck.lastError).toBe("[google] heart-rate: network");
    expect(stuck.backfillDaysDone).toBeGreaterThan(0);
    expect(stuck.backfillDaysDone).toBeLessThan(180);

    fail = false;
    calls.length = 0;
    await source.pull();
    const hr = calls.filter((c) => c.type === "heart-rate");
    expect(lowerBound(hr[0].filter)).toBe("2026-07-01T18:30:00.000Z");
    expect(state("heart-rate")).toMatchObject({ backfillDaysDone: 180, lastError: null });
  });
});
