// The pipeline tests that seed their own databases, apart from pipeline.test.ts so the two files run in parallel.
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import { dailyMetrics, foldCheckpoints, intradayDirty, sleepSegments, sleepSessions } from "../db/schema";
import { lastRun, recompute, type RecoveryRow } from ".";
import { seedPull } from "../sources/seed/generate";
import { localMidnight } from "../time";
import { copyDb, DAY_S, dayAt, dump, NOW, OPTS, PROFILE, seeded, TZ, USER } from "../testing";

const recovery = async (db: Db, day: string) =>
  (await rows<{ v: RecoveryRow }>(db, sql`select recovery v from daily_scores where user_id = ${USER} and day = ${day}`))[0].v;

describe("recovery updates", () => {
  it("a score that gains a term later is flagged Updated", async () => {
    // Today's skin temperature lands 90 minutes after the rest of the night.
    const early = await seeded([Date.parse("2026-10-02T08:00:00+05:30") / 1000]);
    const before = await recovery(early, dayAt(179));
    expect(before.value).toBeTypeOf("number");
    expect(before.terms).not.toContain("skinTemp");
    await seedPull(early, { userId: USER, now: Date.parse("2026-10-02T10:00:00+05:30") / 1000, timeZone: TZ, maxHr: PROFILE.maxHr });
    await recompute(early, OPTS);
    const after = await recovery(early, dayAt(179));
    expect(after.terms).toContain("skinTemp");
    expect(after.updated).toBe(true);
    expect((await recovery(early, dayAt(178))).updated).toBe(false);
  });
});

describe("incremental equals full on 220 days", () => {
  it("a change older than the checkpoint replays everything; nothing changed replays only the tail", async () => {
    const db = await seeded([NOW]); // the seed's own run folded the whole history and wrote the checkpoint at day 148
    await recompute(db, OPTS);
    expect(lastRun.stage2Days).toBe(31); // from the day after the checkpoint to the newest (day 179)
    await db.insert(intradayDirty).values({ userId: USER, day: dayAt(100) });
    await recompute(db, OPTS);
    expect(lastRun.stage2Days).toBe(180);
  });

  it("a change before the checkpoint rewrites it, so the next tail replay still equals a from-scratch run", async () => {
    const late = await seeded([NOW]);
    const m = dailyMetrics;
    const change = async (db: Db) => {
      await db.update(m).set({ hrvMs: 99 }).where(and(eq(m.userId, USER), eq(m.day, dayAt(100))));
      await db.insert(intradayDirty).values({ userId: USER, day: dayAt(100) });
    };
    const full = await copyDb(late);
    await change(late);
    await recompute(late, OPTS); // full fold, new checkpoint
    await late.insert(intradayDirty).values({ userId: USER, day: dayAt(179) });
    await recompute(late, OPTS); // tail, from the rewritten checkpoint
    expect(lastRun.stage2Days).toBe(31);
    await change(full);
    await full.delete(foldCheckpoints).where(eq(foldCheckpoints.userId, USER));
    await recompute(full, OPTS);
    expect(await dump(late, "daily_scores", "1, 2")).toBe(await dump(full, "daily_scores", "1, 2"));
    expect(await dump(late, "reports", "1, 2")).toBe(await dump(full, "reports", "1, 2"));
  });


  it("a late night for day 200 then an incremental recompute matches a from-scratch recompute byte for byte", async () => {
    const base = await seeded([NOW - 40 * DAY_S, NOW], { compute: false });
    const metricDays = await base.select({ day: dailyMetrics.day }).from(dailyMetrics).where(eq(dailyMetrics.userId, USER)).orderBy(dailyMetrics.day);
    expect(metricDays).toHaveLength(220);
    const full = await copyDb(base);
    const late = await copyDb(base);
    const first = metricDays[0].day;
    const at = (i: number) => new Date(Date.parse(first) + i * DAY_S * 1000).toISOString().slice(0, 10);
    const day = at(200);

    // Hold back night 200: its session, stages and nightly metrics.
    const s = sleepSessions;
    const [session] = await late.select().from(s).where(and(eq(s.userId, USER), eq(s.day, day), eq(s.isMain, true)));
    const segments = await late.select().from(sleepSegments).where(and(eq(sleepSegments.userId, USER), eq(sleepSegments.sessionId, session.id)));
    const m = dailyMetrics;
    const [metrics] = await late
      .select({ hrvMs: m.hrvMs, hrvDeepMs: m.hrvDeepMs, rhrBpm: m.rhrBpm, rhrMethod: m.rhrMethod, respBpm: m.respBpm, nightlyTempC: m.nightlyTempC, spo2Pct: m.spo2Pct })
      .from(m)
      .where(and(eq(m.userId, USER), eq(m.day, day)));
    await late.delete(s).where(and(eq(s.userId, USER), eq(s.id, session.id)));
    await late.delete(sleepSegments).where(and(eq(sleepSegments.userId, USER), eq(sleepSegments.sessionId, session.id)));
    const cleared = Object.fromEntries(Object.keys(metrics).map((k) => [k, null]));
    await late.update(m).set(cleared).where(and(eq(m.userId, USER), eq(m.day, day)));
    await recompute(late, OPTS);
    expect((await recovery(late, day)).reason).toBe("band_not_worn");

    // The night syncs late: the source writes the rows (no HR changed, so nothing is marked dirty).
    await late.insert(s).values(session);
    if (segments.length) await late.insert(sleepSegments).values(segments);
    await late.update(m).set(metrics).where(and(eq(m.userId, USER), eq(m.day, day)));
    await recompute(late, OPTS);
    // Only the days the night touches rerun stage 1: the morning it ended, and the evening before if it started then.
    const startedBefore = session.startTs < localMidnight(day, TZ);
    expect(lastRun.stage1Days).toEqual(startedBefore ? [at(199), day] : [day]);
    // Stage 2 replayed from the checkpoint (day 188, 31 days before the newest) rather than from day 0.
    expect(lastRun.stage2Days).toBe(220 - 189);
    const ck = await rows<{ day: string }>(late, sql`select day from fold_checkpoints where user_id = ${USER}`);
    expect(ck).toEqual([{ day: at(188) }]);

    await recompute(full, OPTS);
    expect(await dump(late, "daily_scores", "1, 2")).toBe(await dump(full, "daily_scores", "1, 2"));
    expect(await dump(late, "intraday_series", "1, 2, 3")).toBe(await dump(full, "intraday_series", "1, 2, 3"));
    expect(await dump(late, "reports", "1, 2")).toBe(await dump(full, "reports", "1, 2"));
  }, 120_000);
});
