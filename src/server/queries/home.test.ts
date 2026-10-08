import { beforeAll, describe, expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import { dailyMetrics, dailyValues, dashboardMetrics, hrDays } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { DASHBOARD_DEFAULT, PHONE_DEFAULT } from "@/lib/dashboard";
import { recompute } from "../pipeline";
import { copyDb, ctxFor, dayAt, OPTS, seeded, USER } from "../testing";
import { getActivity } from "./activity";
import { getFitness, getHealthHub, getHealthspan, getMonitor, getStress } from "./health";
import { getHome } from "./home";
import { getJournal, getJournalInsights } from "./journal";
import { getRecovery } from "./recovery";
import { getReport } from "./reports";
import { getMore, getSettings, getShellStatus } from "./settings";
import { getSleep } from "./sleep";
import { getStrain } from "./strain";

const REASONS = ["calibrating", "no_hrv_last_night", "awaiting_sleep_sync", "insufficient_hr_data", "band_not_worn", "no_data"];
const BEFORE_WAKE = Date.parse("2026-10-02T05:00:00+05:30") / 1000;

/** Walks a view model: no NaN or ±Infinity anywhere, and every null metric carries a known reason. Collects reasons and tags. */
function inspect(vm: unknown, seen: Set<string>, path = "vm") {
  if (typeof vm === "number") {
    expect(Number.isFinite(vm), `${path} is ${vm}`).toBe(true);
    return;
  }
  if (!vm || typeof vm !== "object") return;
  if (Array.isArray(vm)) return vm.forEach((x, i) => inspect(x, seen, `${path}[${i}]`));
  const o = vm as Record<string, unknown>;
  if ("value" in o && "reason" in o && "provisional" in o) {
    if (o.value === null) {
      expect(REASONS, `${path}.reason`).toContain(o.reason);
      seen.add(o.reason as string);
    } else expect(o.reason, `${path}.reason`).toBeNull();
    if (o.provisional) seen.add("provisional");
    for (const t of (o.tags as string[] | undefined) ?? []) seen.add(t);
  }
  for (const [k, v] of Object.entries(o)) inspect(v, seen, `${path}.${k}`);
}

let db: Db;
let early: Db;
beforeAll(async () => {
  db = await seeded();
  early = await seeded([BEFORE_WAKE]);
});

describe("getHome", () => {
  it("has every Home section for today", async () => {
    const vm = await getHome(dayAt(179), ctxFor(db));
    expect(Object.keys(vm).sort()).toEqual(
      [
        "activities",
        "dashboard",
        "day",
        "dials",
        "energyBank",
        "insights",
        "isToday",
        "journalWeek",
        "keyStats",
        "monitor",
        "monitorAlert",
        "outlook",
        "phone",
        "plan",
        "strainRecovery",
        "stress",
        "stressChart",
        "strip",
        "today",
        "tonight",
        "weeklyTeaser",
      ].sort(),
    );
    expect(vm.isToday).toBe(true);
    // Stress Monitor is on the default dashboard, so its tile's line is loaded; no plan source exists yet.
    expect(vm.stressChart?.value?.points.length).toBeGreaterThan(0);
    expect(vm.plan).toBeNull();
    expect(vm.strip).toHaveLength(30);
    expect(vm.dials.recovery.value).toBeTypeOf("number");
    expect(vm.dials.strainTarget).toHaveLength(2);
    expect(vm.dials.soFar).toBe(true);
    expect(vm.keyStats.map((s) => s.label)).toEqual([
      "Heart rate variability",
      "Resting heart rate",
      "Respiratory rate",
      "Sleep performance",
      "Stress Monitor",
      "Calories",
      "Steps",
      "Blood oxygen",
      "Skin temperature",
    ]);
    expect(vm.keyStats.every((s) => s.average != null)).toBe(true);
    // Newest first: the night's sleep, which started the day, comes last.
    expect(vm.activities.items.at(-1)).toMatchObject({ kind: "sleep" });
    const starts = vm.activities.items.map((a) => a.start);
    expect(starts).toEqual([...starts].sort((a, b) => b - a));
    expect(vm.energyBank.value?.curve.length).toBeGreaterThan(50);
    expect(vm.tonight.value?.plans.map((p) => p.label)).toEqual(["Peak", "Perform", "Get by"]);
    const [peak, perform, getBy] = vm.tonight.value!.plans;
    expect(peak.bedtimeAt).toBeLessThan(perform.bedtimeAt);
    expect(perform.bedtimeAt).toBeLessThan(getBy.bedtimeAt);
    expect(vm.weeklyTeaser).toMatchObject({ period: "2026-W39", start: "2026-09-21", end: "2026-09-27" });
  });

  it("never holds NaN, and every missing metric says why, on every seeded day", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 180; i++) inspect((await getHome(dayAt(i), ctxFor(db))), seen);
    inspect((await getHome(dayAt(179), ctxFor(early, BEFORE_WAKE))), seen);
    expect([...seen].sort()).toEqual([...REASONS, "provisional", "stale_baseline"].sort());
  });

  it("shows the seeded reasons: calibrating with nights left, no HRV, band off, and today before wake", async () => {
    for (let i = 0; i < 7; i++) expect((await getHome(dayAt(i), ctxFor(db))).dials.recovery).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 7 - i });
    expect((await getHome(dayAt(7), ctxFor(db))).dials.recovery.value).toBeTypeOf("number");
    expect((await getHome(dayAt(164), ctxFor(db))).dials.recovery.reason).toBe("no_hrv_last_night");
    for (const i of [156, 157]) {
      const vm = await getHome(dayAt(i), ctxFor(db));
      expect(vm.dials.recovery.reason).toBe("band_not_worn");
      expect(vm.dials.sleep.reason).toBe("band_not_worn");
    }
    expect((await getHome(dayAt(156), ctxFor(db))).dials.strain.reason).toBe("band_not_worn");
    expect((await getHome(dayAt(157), ctxFor(db))).dials.strain.reason).toBe("insufficient_hr_data");

    const morning = await getHome(dayAt(179), ctxFor(early, BEFORE_WAKE));
    expect(morning.dials.recovery.reason).toBe("awaiting_sleep_sync");
    expect(morning.dials.sleep.reason).toBe("awaiting_sleep_sync");
    expect(morning.energyBank.reason).toBe("awaiting_sleep_sync");
    expect(morning.dials.reason).toEqual({ reason: "awaiting_sleep_sync" });
    expect(morning.keyStats.find((s) => s.key === "hrv")!.metric.reason).toBe("awaiting_sleep_sync");
  });

  it("builds extra metrics and body readings generically, against their 30-day averages", async () => {
    const c = await copyDb(db);
    const day = dayAt(179);
    await c.delete(dailyValues).where(and(eq(dailyValues.userId, USER), eq(dailyValues.key, "distance"))); // the demo seed writes its own; pin the window
    await c.insert(dailyValues).values([
      ...Array.from({ length: 10 }, (_, i) => ({ userId: USER, day: dayAt(179 - (i + 1)), key: "distance", value: (i + 1) % 2 ? 3 : 5 })),
      { userId: USER, day, key: "distance", value: 6.25 },
    ]);
    await c.update(dailyMetrics).set({ weightKg: 72.5 }).where(and(eq(dailyMetrics.userId, USER), eq(dailyMetrics.day, day)));
    await c.insert(dashboardMetrics).values(["distance", "weight", "glucose"].map((key, position) => ({ userId: USER, key, position })));
    const vm = await getHome(day, ctxFor(c));
    expect(vm.keyStats).toMatchObject([
      { key: "distance", label: "Distance", unit: "km", format: "decimal2", direction: "up", href: "/metric/distance", metric: { value: 6.25 }, average: 4 },
      { key: "weight", label: "Weight", unit: "kg", metric: { value: 72.5 } },
      { key: "glucose", label: "Blood glucose", metric: { value: null, reason: "no_data" }, average: null },
    ]);
    expect(vm.dashboard.empty).toContain("glucose");
    expect(vm.dashboard.empty).not.toContain("distance");
    expect(vm.dashboard.empty).not.toContain("hrv");
    expect(vm.dashboard.defaults).toEqual(DASHBOARD_DEFAULT);
    expect(vm.phone).toBeNull();
  });

  it("without a band, Home leads with the phone's stats and My Dashboard defaults to phone metrics", async () => {
    const c = await copyDb(db);
    await c.delete(hrDays).where(eq(hrDays.userId, USER));
    await c.execute(sql`insert into intraday_dirty (user_id, day) select user_id, day from daily_metrics where user_id = ${USER} on conflict do nothing`);
    await recompute(c, OPTS);
    const vm = await getHome(dayAt(170), ctxFor(c));
    expect(vm.dials.strain.value).toBeNull();
    // The demo seed writes the phone extras (distance, active minutes) beside steps and calories.
    expect(vm.phone?.map((s) => s.key)).toEqual(["steps", "distance", "calories", "active_minutes"]);
    expect(vm.phone?.[0]).toMatchObject({ label: "Steps", metric: { value: expect.any(Number) }, average: expect.any(Number) });
    expect(vm.dashboard.defaults).toEqual(PHONE_DEFAULT);
    expect(vm.keyStats.map((s) => s.key)).toEqual(PHONE_DEFAULT);
    // A band-off day with no phone data either keeps the plain empty state.
    expect((await getHome(dayAt(156), ctxFor(c))).phone).toBeNull();
  });

  it("orders My Dashboard as chosen, skipping unknown keys, and falls back to the default list", async () => {
    const set = async (keys: string[]) => {
      await db.delete(dashboardMetrics).where(eq(dashboardMetrics.userId, USER));
      if (keys.length) await db.insert(dashboardMetrics).values(keys.map((key, position) => ({ userId: USER, key, position })));
    };
    const keys = async () => (await getHome(dayAt(179), ctxFor(db))).keyStats.map((s) => s.key);
    const all = ["hrv", "rhr", "resp", "sleep", "stress", "calories", "steps", "spo2", "skin"];
    try {
      expect(await keys()).toEqual(all);
      await set(["steps", "vo2max", "hrv"]);
      expect(await keys()).toEqual(["steps", "hrv"]);
      expect((await getHome(dayAt(179), ctxFor(db))).keyStats[0]).toMatchObject({ label: "Steps", href: "/metric/steps", direction: "up" });
      await set(["vo2max"]);
      expect(await keys()).toEqual(all);
    } finally {
      await set([]);
    }
  });

  it("switches the day banner from outlook to review at 17:00, and past days always review", async () => {
    const at = (h: number) => Date.parse(`2026-10-02T${String(h).padStart(2, "0")}:00:00+05:30`) / 1000;
    const morning = (await getHome(dayAt(179), ctxFor(db, at(14)))).outlook;
    expect(morning).toMatchObject({ kind: "outlook", title: "Your daily outlook" });
    expect(morning!.body).toMatch(/^Your Recovery is \d+%, (green|yellow|red)\./);
    expect((await getHome(dayAt(179), ctxFor(db, at(17)))).outlook).toMatchObject({ kind: "review", title: "Your day in review" });
    const past = (await getHome(dayAt(170), ctxFor(db))).outlook!;
    expect(past.kind).toBe("review");
    expect(past.body).toMatch(/Day Strain was \d+\.\d/);
    // A day with no band data has nothing to summarise.
    expect((await getHome(dayAt(156), ctxFor(db))).outlook).toBeNull();
  });

  it("lists today's coach cards (strain first) and none on past days", async () => {
    const today = await getHome(dayAt(179), ctxFor(db));
    expect(today.insights.length).toBeGreaterThan(0);
    expect(today.insights[0].key).toBe("strain");
    for (const i of today.insights) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.body).not.toMatch(/the reference app|!/);
      expect(i.href).toMatch(/^\/(strain|recovery|sleep)$/);
    }
    expect((await getHome(dayAt(170), ctxFor(db))).insights).toEqual([]);
  });

  it("gives the journal week and the 7-day Strain and Recovery series ending on the day", async () => {
    const vm = await getHome(dayAt(170), ctxFor(db));
    expect(vm.journalWeek.map((w) => w.day)).toEqual([164, 165, 166, 167, 168, 169, 170].map(dayAt));
    expect(vm.journalWeek.some((w) => w.done)).toBe(true);
    expect(vm.strainRecovery.map((p) => p.day)).toEqual(vm.journalWeek.map((w) => w.day));
    for (const p of vm.strainRecovery) {
      if (p.strain !== null) expect(p.strain >= 0 && p.strain <= 21).toBe(true);
      if (p.recovery !== null) expect(p.recovery >= 0 && p.recovery <= 100).toBe(true);
    }
    // The band-off day has neither score.
    const off = (await getHome(dayAt(158), ctxFor(db))).strainRecovery.find((p) => p.day === dayAt(156))!;
    expect(off).toEqual({ day: dayAt(156), strain: null, recovery: null });
  });

  it("leaves today's Strain a gap in the 7-day series until it has a score, never a 0.0 dive", async () => {
    const morning = await getHome(dayAt(179), ctxFor(early, BEFORE_WAKE));
    expect(morning.dials.strain.value).toBe(0);
    const today = morning.strainRecovery.at(-1)!;
    expect(today.day).toBe(dayAt(179));
    expect(today.strain).toBeNull();
    // Past days keep their scores.
    expect(morning.strainRecovery.slice(0, -1).some((p) => p.strain !== null && p.strain > 0)).toBe(true);
    // Once effort accrues, today plots.
    const later = (await getHome(dayAt(170), ctxFor(db))).strainRecovery.at(-1)!;
    expect(later.strain).not.toBeNull();
  });

  it("raises the Health Monitor alert in the seeded illness week", async () => {
    const flagged = await Promise.all([118, 119, 120, 121, 122].map(async (i) => (await getHome(dayAt(i), ctxFor(db))).monitorAlert));
    expect(flagged.some((a) => a?.kind === "illness")).toBe(true);
    expect((await getHome(dayAt(60), ctxFor(db))).monitorAlert?.kind ?? null).not.toBe("illness");
  });
});

describe("every screen query", () => {
  it("returns NaN-free view models with reasons for a spread of days", async () => {
    const ctx = ctxFor(db);
    const seen = new Set<string>();
    for (const i of [0, 3, 7, 14, 30, 60, 100, 120, 156, 157, 164, 170, 178, 179]) {
      const d = dayAt(i);
      for (const vm of [(await getRecovery(d, ctx)), (await getStrain(d, ctx)), (await getSleep(d, ctx)), (await getMonitor(d, ctx)), (await getStress(d, ctx)), (await getHealthspan(d, ctx)), (await getJournal(d, ctx))]) {
        inspect(vm, seen);
      }
    }
    inspect([(await getHealthHub(ctx)), (await getFitness(ctx)), (await getMore(ctx)), (await getSettings(ctx)), (await getShellStatus(ctx))], seen);
    for (const m of ["recovery", "hrv", "sleep"] as const) inspect((await getJournalInsights(m, ctx)), seen);
    const periods = (await rows<{ period: string }>(db, sql`select period from reports where user_id = ${USER}`)).map((r) => r.period);
    for (const p of periods) inspect((await getReport(p, ctx)), seen);
    const ids = (await rows<{ id: string }>(db, sql`select id from exercises where user_id = ${USER} and day >= ${dayAt(150)}`)).map((r) => r.id);
    for (const id of ids) inspect((await getActivity(id, ctx)), seen);
    expect(seen).toContain("calibrating");
    expect((await getActivity("nope", ctx))).toBeNull();
    expect((await getReport("1999-W01", ctx))).toBeNull();
  });

  it("Stress Monitor gives the typical weekday minutes per level, and the hub a week-on-week pace change", async () => {
    const l = (await getStress(dayAt(170), ctxFor(db))).levels.value!;
    expect(l.typical).not.toBeNull();
    expect(l.typical!.highMin).toBeCloseTo(l.highMin - l.typicalDeltaMin!, 6);
    expect((await getStress(dayAt(3), ctxFor(db))).levels.value?.typical ?? null).toBeNull();
    const hs = (await getHealthHub(ctxFor(db))).healthspan.value;
    if (hs) expect(hs.paceDelta === null || Number.isFinite(hs.paceDelta)).toBe(true);
  });

  it("Journal Insights shows the seeded alcohol effect as negative", async () => {
    const vm = await getJournalInsights("recovery", ctxFor(db));
    const alcohol = vm.items.find((x) => x.key === "alcohol");
    expect(alcohol?.effect).toBe("negative");
    expect(alcohol!.avgWith!).toBeLessThan(alcohol!.avgWithout!);
  });

  it("Settings reports the demo source and the read-only profile", async () => {
    const vm = await getSettings(ctxFor(db));
    expect(vm.source).toEqual({ label: "Demo data", status: "demo" });
    expect(vm.sync).toEqual([expect.objectContaining({ key: "seed", label: "Demo generator", status: "ok" })]);
    expect(vm.profile).toMatchObject({ sex: "male", maxHr: 183, maxHrSource: "set", age: 36 });
    expect((await getShellStatus(ctxFor(db)))).toMatchObject({ mode: "demo", connection: "connected", today: dayAt(179), firstDay: dayAt(0) });
  });

  it("counts the wear streak back to the band-off day; early on, today does not count yet", async () => {
    // Day 156 had no heart rate at all; day 157 got the band back late in the evening.
    expect((await getShellStatus(ctxFor(db))).streak).toEqual({ days: 179 - 157 + 1, asOf: dayAt(179) });
    expect((await getShellStatus(ctxFor(early, BEFORE_WAKE))).streak).toEqual({ days: 178 - 157 + 1, asOf: dayAt(178) });
  });
});
