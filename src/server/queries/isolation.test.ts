// The multi-user leak net: every screen view model is built for one user only. User 1 is the seeded demo; user 2
// gets distinctive rows in every table the screens read. User 1's view models must be identical before and after
// user 2's rows exist (and never mention them), and user 2's must never show user 1's data.
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import {
  dailyMetrics,
  dailyScores,
  dailyValues,
  dashboardMetrics,
  exercises,
  healthRecords,
  intradaySeries,
  journalEntries,
  journalNotes,
  journalTags,
  loggedEntries,
  oauthTokens,
  profile,
  reports,
  sleepSessions,
  syncState,
} from "../db/schema";
import { writeSamples } from "../samples";
import { addUser, ctxFor, dayAt, NOW, seeded, USER } from "../testing";
import { getActivities } from "./activities";
import { getActivity } from "./activity";
import { getCalendarMonth } from "./calendar";
import type { QueryCtx } from "./common";
import { getFitness, getHealthHub, getHealthspan, getMonitor, getStress } from "./health";
import { dashboardKeys, getHome } from "./home";
import { getBehaviours, getJournal, getJournalInsights } from "./journal";
import { getLog } from "./log";
import { DETAIL_KEYS, getMetricDetail } from "./metric";
import { getRecovery } from "./recovery";
import { getReport, getReportArchive } from "./reports";
import { getMore, getSettings, getShellStatus, getWearStreak, getYourData } from "./settings";
import { getSleep } from "./sleep";
import { getStrain } from "./strain";
import { getTrends } from "./trends";
import { getTrendView } from "./trendView";

const TODAY = dayAt(179);
const PAST = dayAt(170);
const NIGHT = dayAt(150);
/** Strings only user 2's rows contain. */
const MARKERS = ["INTRUDER", "777.7", "177.7", "1999-01-04"];

/** Every screen's view model for one user (and a google-mode context, so Settings reads the user's grant). */
async function screens(ctx: QueryCtx, activityId: string | null, period: string | null) {
  const g = { ...ctx, mode: "google" as const };
  const out: Record<string, unknown> = {};
  for (const d of [TODAY, PAST, NIGHT]) {
    out[`home@${d}`] = await getHome(d, ctx);
    out[`recovery@${d}`] = await getRecovery(d, ctx);
    out[`strain@${d}`] = await getStrain(d, ctx);
    out[`sleep@${d}`] = await getSleep(d, ctx);
    out[`monitor@${d}`] = await getMonitor(d, ctx);
    out[`stress@${d}`] = await getStress(d, ctx);
    out[`healthspan@${d}`] = await getHealthspan(d, ctx);
    out[`journal@${d}`] = await getJournal(d, ctx);
  }
  for (const key of DETAIL_KEYS) out[`metric:${key}`] = await getMetricDetail(key, TODAY, ctx);
  for (const m of ["recovery", "hrv", "steps", "weight", "glucose"] as const) out[`trends:${m}`] = await getTrends(m, ctx);
  for (const m of ["hrv", "zones13", "strength", "time_in_bed"] as const) out[`trendView:${m}`] = await getTrendView(m, TODAY, "m", 0, ctx);
  for (const m of ["recovery", "hrv", "sleep"] as const) out[`insights:${m}`] = await getJournalInsights(m, ctx);
  Object.assign(out, {
    hub: await getHealthHub(ctx),
    fitness: await getFitness(ctx),
    activities: await getActivities(3650, ctx),
    activity: activityId && (await getActivity(activityId, ctx)),
    calendar: await getCalendarMonth("2026-09", ctx),
    calendarJan: await getCalendarMonth("2026-01", ctx),
    report: period && (await getReport(period, ctx)),
    intruderReport: await getReport("1999-W01", ctx),
    archive: await getReportArchive(ctx),
    behaviours: await getBehaviours(ctx),
    log: await getLog(ctx),
    more: await getMore(ctx),
    yourData: await getYourData(ctx),
    settings: await getSettings(ctx),
    settingsGoogle: await getSettings(g),
    shell: await getShellStatus(ctx),
    shellGoogle: await getShellStatus(g),
    streak: await getWearStreak(ctx),
    dashboard: await dashboardKeys(ctx.db, ctx.userId),
  });
  return out;
}

let db: Db;
let u2: number;
let before: Record<string, unknown>;
let user1ExerciseIds: string[];
let run: string;
let period: string;

beforeAll(async () => {
  db = await seeded();
  user1ExerciseIds = (await rows<{ id: string }>(db, sql`select id from exercises where user_id = ${USER}`)).map((r) => r.id);
  run = (await rows<{ id: string }>(db, sql`select id from exercises where user_id = ${USER} and type = 'RUNNING' order by start_ts desc limit 1`))[0].id;
  period = (await rows<{ period: string }>(db, sql`select period from reports where user_id = ${USER} and period like '____-W__' order by period desc limit 1 offset 1`))[0].period;
  before = await screens(ctxFor(db), run, period);

  u2 = await addUser(db, "intruder@pulse.test", "INTRUDER");
  const user = { userId: u2 };
  const [r1] = await db.select({ data: reports.data }).from(reports).where(and(eq(reports.userId, USER), eq(reports.period, period)));
  await db.insert(profile).values({ ...user, birthDate: "1977-07-07", sex: "female", maxHr: 199, heightCm: 177.7, timeZone: "America/New_York", updatedAt: NOW });
  await db.insert(dailyMetrics).values(
    [TODAY, dayAt(178), PAST, NIGHT].map((day) => ({ ...user, day, hrvMs: 777.7, rhrBpm: 77.7, steps: 77777, weightKg: 177.7, bodyFatPct: 7.77, source: "INTRUDER" })),
  );
  await db.insert(dailyValues).values([
    { ...user, day: TODAY, key: "glucose", value: 777.7 },
    { ...user, day: TODAY, key: "distance", value: 777.7 },
    { ...user, day: "latest", key: "height_cm", value: 177.7 },
  ]);
  await db.insert(dailyScores).values({ ...user, day: "2026-01-01", scoringVersion: 1 });
  await db.insert(exercises).values({
    ...user,
    id: "INTRUDER-run",
    day: PAST,
    startTs: NOW - 9 * 86400,
    endTs: NOW - 9 * 86400 + 3600,
    type: "RUNNING",
    name: "INTRUDER",
    calories: 777.7,
    distanceM: 7777,
    source: "INTRUDER",
  });
  await db.insert(sleepSessions).values({
    ...user,
    id: "INTRUDER-sleep",
    day: NIGHT,
    startTs: NOW - 30 * 86400,
    endTs: NOW - 30 * 86400 + 8 * 3600,
    isMain: true,
    processed: true,
    source: "INTRUDER",
  });
  // A night of heart rate and a day of steps overlapping user 1's: per-minute charts must not average them in.
  const lo = NOW - 29 * 86400 - 12 * 3600;
  await writeSamples(db, "hr", u2, Array.from({ length: 24 * 60 }, (_, k) => ({ ts: lo + k * 60, v: 199 })));
  await writeSamples(db, "steps", u2, Array.from({ length: 24 * 60 }, (_, k) => ({ ts: NOW - 86400 * 9 + k * 60, v: 777 })));
  await db.insert(intradaySeries).values(["hr", "stress", "energy_bank"].map((kind) => ({ ...user, day: TODAY, kind, data: Array(1440).fill(777.7) })));
  await db.insert(journalTags).values([
    { ...user, tag: "alcohol", label: "INTRUDER Alcohol", isDefault: true },
    { ...user, tag: "intruder_tag", label: "INTRUDER tag" },
  ]);
  await db.insert(journalEntries).values([
    { ...user, day: TODAY, tag: "intruder_tag", value: 1 },
    { ...user, day: PAST, tag: "alcohol", value: 1, detail: 777 },
  ]);
  await db.insert(journalNotes).values({ ...user, day: TODAY, text: "INTRUDER note" });
  await db.insert(reports).values({ ...user, period: "1999-W01", data: { ...(r1.data as object), start: "1999-01-04", end: "1999-01-10" } });
  await db.insert(healthRecords).values([
    { ...user, id: "INTRUDER-ecg", kind: "ecg", ts: NOW - 86400, day: dayAt(178), data: { result: "ATRIAL_FIBRILLATION", avgBpm: 177.7 } },
    { ...user, id: "INTRUDER-irn", kind: "irn", ts: NOW - 86400, day: dayAt(178), data: { count: 7 } },
  ]);
  await db.insert(loggedEntries).values([
    { ...user, id: "INTRUDER-water", type: "hydration-log", ts: NOW - 3600, day: TODAY, data: { ml: 777 }, createdAt: NOW },
    { ...user, id: "INTRUDER-food", type: "nutrition-log", ts: NOW - 3600, day: TODAY, data: { meal: "lunch", kcal: 777, proteinG: 77 }, createdAt: NOW },
  ]);
  await db.insert(dashboardMetrics).values(["glucose", "distance"].map((key, position) => ({ ...user, key, position })));
  await db.insert(syncState).values([
    { ...user, type: "heart-rate", lastSuccessAt: NOW, backfillDaysDone: 7, backfillDaysTotal: 777, lastError: "[google] heart-rate: INTRUDER (HTTP 500)" },
    { ...user, type: "seed", lastSuccessAt: NOW - 777, lastError: "[seed] INTRUDER" },
  ]);
  await db.insert(oauthTokens).values({ ...user, accessToken: "INTRUDER", refreshToken: "INTRUDER", expiresAt: NOW, scope: "INTRUDER", revokedAt: NOW, updatedAt: NOW });
});

describe("screen queries are scoped to one user", () => {
  it("user 1's view models are unchanged by another user's rows and never mention them", async () => {
    const after = await screens(ctxFor(db), run, period);
    for (const [key, vm] of Object.entries(after)) {
      const json = JSON.stringify(vm);
      for (const m of MARKERS) expect(json.includes(m), `${key} contains ${m}`).toBe(false);
      expect(vm, key).toEqual(before[key]);
    }
    // The intruder's activity and report don't resolve for user 1.
    expect(await getActivity("INTRUDER-run", ctxFor(db))).toBeNull();
    expect(after.intruderReport).toBeNull();
  });

  it("user 2's view models show only user 2's data", async () => {
    const ctx = ctxFor(db, NOW, u2);
    const vms = await screens(ctx, run, period);
    for (const [key, vm] of Object.entries(vms)) {
      const json = JSON.stringify(vm);
      for (const id of user1ExerciseIds) expect(json.includes(id), `${key} contains user 1's exercise ${id}`).toBe(false);
    }
    // User 1's activity and report are not there for user 2.
    expect(vms.activity).toBeNull();
    expect(vms.report).toBeNull();

    const acts = vms.activities as Awaited<ReturnType<typeof getActivities>>;
    expect(acts.groups.flatMap((g) => g.items.map((i) => i.id))).toEqual(["INTRUDER-run"]);
    expect(acts.older).toBe(false);
    const trends = vms["trends:hrv"] as Awaited<ReturnType<typeof getTrends>>;
    expect(new Set(trends.points.value!.flatMap((p) => (p.value === null ? [] : [p.value])))).toEqual(new Set([777.7]));
    const archive = vms.archive as Awaited<ReturnType<typeof getReportArchive>>;
    expect(archive.weeks.map((w) => w.period)).toEqual(["1999-W01"]);
    expect(archive.months).toEqual([]);
    const behaviours = vms.behaviours as Awaited<ReturnType<typeof getBehaviours>>;
    expect(behaviours.tags.map((t) => [t.tag, t.label, t.answers])).toEqual([
      ["alcohol", "INTRUDER Alcohol", 1],
      ["intruder_tag", "INTRUDER tag", 1],
    ]);
    const yourData = vms.yourData as Awaited<ReturnType<typeof getYourData>>;
    expect(yourData).toMatchObject({ first: "2026-01-01", days: 1, answers: 2 });
    const shell = vms.shellGoogle as Awaited<ReturnType<typeof getShellStatus>>;
    expect(shell).toMatchObject({ connection: "auth_revoked", firstDay: "2026-01-01", streak: null });
    const settings = vms.settingsGoogle as Awaited<ReturnType<typeof getSettings>>;
    expect(settings.source.status).toBe("revoked");
    expect(vms.dashboard).toEqual(["glucose", "distance"]);
    const monitor = vms[`monitor@${TODAY}`] as Awaited<ReturnType<typeof getMonitor>>;
    expect(monitor.heartRhythm.ecg.map((e) => e.id)).toEqual(["INTRUDER-ecg"]);
    expect(monitor.measurements.find((m) => m.key === "weight")!.metric.value).toBe(177.7);
    const log = vms.log as Awaited<ReturnType<typeof getLog>>;
    expect(log.recent.map((e) => e.id).sort()).toEqual(["INTRUDER-food", "INTRUDER-water"]);
  });

  it("user 1's settings and shell still read user 1's own sync rows and grant", async () => {
    const g = { ...ctxFor(db), mode: "google" as const };
    expect((await getSettings(g)).source.status).toBe("not_connected");
    // User 1 has seeded data and no Google grant of their own, so the shell shows it as demo data (seed:demo
    // accounts, 34d2c67), not the intruder's revoked grant.
    expect(await getShellStatus(g)).toMatchObject({ mode: "demo", connection: "connected" });
    expect((await getSettings(ctxFor(db))).sync).toEqual([expect.objectContaining({ key: "seed", status: "ok", error: null })]);
  });
});
