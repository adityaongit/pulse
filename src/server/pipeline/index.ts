// The two-stage recompute (KTD6). Stage 1 (stage1.ts) reads the heavy per-sample tables for the days
// whose inputs changed and caches per-day results; stage 2 (stage2.ts, scorers in scores.ts) folds
// every day, oldest first, over daily rows and those cached results. Every value for day D depends
// only on D and earlier days, except where a feature is defined over the evening that follows (Energy
// Bank stops at tonight's bedtime, Stress leaves out tonight's sleep), so adding a later night never
// changes an earlier day's scores.
//
// Determinism: the same database gives byte-identical daily_scores, and writes only touch rows whose
// JSON differs, so an unchanged recompute writes nothing.
import { type Db, getDb, row, sql } from "../db";
import { getProfile } from "../profile";
import { load } from "./data";
import { stage1 } from "./stage1";
import { stage2 } from "./stage2";
import { type PipelineOptions, SCORING_VERSION } from "./types";

export * from "./types";

/** What the last run did, for tests and logs. */
export const lastRun = { stage1Days: [] as string[], stage2Days: 0, ms: 0, stage1Ms: 0, stage2Ms: 0 };

/** The worker's hook: recompute when a source changed something, a day is dirty, or the version moved. */
export async function recomputeIfNeeded(userId: number, changed: boolean): Promise<void> {
  const db = getDb();
  if (!changed && !(await needsRecompute(db, userId))) return;
  // Scores need age and sex: before onboarding, sync keeps importing and scoring waits.
  const profile = await getProfile(db, userId);
  if (!profile) return;
  await recompute(db, { userId, timeZone: profile.timeZone, profile });
  console.info(`[pipeline] user ${userId} recomputed in ${lastRun.ms} ms (stage 1: ${lastRun.stage1Days.length} days, stage 2: ${lastRun.stage2Days} days)`);
}

/** A dirty day, a row from another scoring version, or a newest daily row not yet scored. One round trip. */
export async function needsRecompute(db: Db, userId: number): Promise<boolean> {
  const r = await row<{ v: boolean }>(
    db,
    sql`select exists (select 1 from intraday_dirty where user_id = ${userId})
      or exists (select 1 from daily_scores where user_id = ${userId} and scoring_version <> ${SCORING_VERSION})
      or exists (
        select 1 from (select max(day) d from daily_metrics where user_id = ${userId}) m
        where m.d is not null and not exists (select 1 from daily_scores s where s.user_id = ${userId} and s.day = m.d)
      ) as v`,
  );
  return !!r?.v;
}

/** Runs both stages for one user. The worker never overlaps runs for a user. */
export async function recompute(db: Db, opts: PipelineOptions) {
  const t0 = performance.now();
  const data = await load(db, opts);
  if (!data) {
    Object.assign(lastRun, { stage1Days: [], stage2Days: 0, ms: Math.round(performance.now() - t0), stage1Ms: 0, stage2Ms: 0 });
    return lastRun;
  }
  const t1 = performance.now();
  lastRun.stage1Days = await stage1(db, data, opts);
  const t2 = performance.now();
  const s2 = await stage2(db, data, opts, lastRun.stage1Days);
  const t3 = performance.now();
  Object.assign(lastRun, { stage2Days: s2.days, stage1Ms: Math.round(t2 - t1), stage2Ms: Math.round(t3 - t2), ms: Math.round(t3 - t0) });
  return lastRun;
}
