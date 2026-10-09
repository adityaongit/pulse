import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { hrDays } from "./db/schema";
import { lastRun, recompute } from "./pipeline";
import { bucketOf, COMPACT_BATCH, compactHr, mergeSamples, readHr, writeSamples } from "./samples";
import { dump, freshDb, NOW, OPTS, seeded, USER, addUser } from "./testing";

const DAY = 86_400;

describe("compactHr", () => {
  it("folds a raw day to one rounded mean per minute, leaves recent days raw, and is idempotent", async () => {
    const db = await freshDb();
    const user = await addUser(db);
    const old = 1_000 * DAY;
    const recent = old + 10 * DAY;
    // Minute 0: three samples at 5, 20, 40 s (60, 62, 65 → 62.33 → 62); minute 2: one sample.
    await writeSamples(db, "hr", user, [
      { ts: old + 5, v: 60 }, { ts: old + 20, v: 62 }, { ts: old + 40, v: 65 }, { ts: old + 125, v: 70 },
      { ts: recent + 5, v: 80 }, { ts: recent + 20, v: 81 },
    ]);
    expect(await compactHr(db, user, bucketOf(recent))).toBe(1);
    expect(await readHr(db, user, old, old + DAY)).toEqual([{ ts: old, bpm: 62 }, { ts: old + 120, bpm: 70 }]);
    expect(await readHr(db, user, recent, recent + DAY)).toEqual([{ ts: recent + 5, bpm: 80 }, { ts: recent + 20, bpm: 81 }]);
    const flags = await db.select({ b: hrDays.bucket, m: hrDays.minute }).from(hrDays).where(eq(hrDays.userId, user)).orderBy(hrDays.bucket);
    expect(flags).toEqual([{ b: bucketOf(old), m: true }, { b: bucketOf(recent), m: false }]);
    expect(await compactHr(db, user, bucketOf(recent))).toBe(0);
  });

  it("a raw re-fetch of a compacted day clears the flag, so it is compacted again", async () => {
    const db = await freshDb();
    const user = await addUser(db);
    const old = 1_000 * DAY;
    await writeSamples(db, "hr", user, [{ ts: old + 5, v: 60 }, { ts: old + 20, v: 62 }]);
    await compactHr(db, user, bucketOf(old) + 1);
    await mergeSamples(db, "hr", user, { start: old, end: old + 3600 }, new Map([[old + 5, 60], [old + 20, 62]]), "replace");
    const [r] = await db.select({ m: hrDays.minute, n: hrDays.offsets }).from(hrDays).where(and(eq(hrDays.userId, user), eq(hrDays.bucket, bucketOf(old))));
    expect(r).toEqual({ m: false, n: [5, 20] });
    expect(await compactHr(db, user, bucketOf(old) + 1)).toBe(1);
  });

  it("works through the history in batches and never triggers a recompute of the days it touches", async () => {
    const db = await seeded([NOW]);
    const before = await dump(db, "daily_scores", "1, 2");
    const cutoff = bucketOf(NOW) - 30;
    let total = 0;
    for (let n = await compactHr(db, USER, cutoff); n > 0; n = await compactHr(db, USER, cutoff)) {
      expect(n).toBeLessThanOrEqual(COMPACT_BATCH);
      total += n;
    }
    expect(total).toBeGreaterThan(100);
    const raw = await db.select({ b: hrDays.bucket }).from(hrDays).where(and(eq(hrDays.userId, USER), eq(hrDays.minute, false)));
    expect(raw.every((r) => r.b >= cutoff)).toBe(true);
    await recompute(db, OPTS);
    expect(lastRun.stage1Days).toEqual([]);
    expect(await dump(db, "daily_scores", "1, 2")).toBe(before);
  });
});
