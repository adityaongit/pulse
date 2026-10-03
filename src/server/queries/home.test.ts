import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db";
import { cleanup, ctxFor, dayAt, seeded } from "../testing";
import { getActivity } from "./activity";
import { getFitness, getHealthHub, getHealthspan, getMonitor, getStress } from "./health";
import { getHome } from "./home";
import { getJournal, getJournalInsights } from "./journal";
import { getRecovery } from "./recovery";
import { getReport } from "./reports";
import { getMore, getSettings, getShellStatus } from "./settings";
import { getSleep } from "./sleep";
import { getStrain } from "./strain";

afterAll(cleanup);

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
beforeAll(() => {
  db = seeded();
  early = seeded([BEFORE_WAKE]);
});

describe("getHome", () => {
  it("has every Home section for today", () => {
    const vm = getHome(dayAt(179), ctxFor(db));
    expect(Object.keys(vm).sort()).toEqual(
      [
        "activities",
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
        "strainRecovery",
        "stress",
        "strip",
        "today",
        "tonight",
        "weeklyTeaser",
      ].sort(),
    );
    expect(vm.isToday).toBe(true);
    expect(vm.strip).toHaveLength(30);
    expect(vm.dials.recovery.value).toBeTypeOf("number");
    expect(vm.dials.strainTarget).toHaveLength(2);
    expect(vm.dials.soFar).toBe(true);
    expect(vm.keyStats.map((s) => s.label)).toEqual([
      "Heart rate variability",
      "Resting heart rate",
      "Respiratory rate",
      "Sleep performance",
      "Calories",
      "Steps",
      "Blood oxygen",
      "Skin temperature",
    ]);
    expect(vm.keyStats.every((s) => s.average != null)).toBe(true);
    expect(vm.activities.items[0]).toMatchObject({ kind: "sleep" });
    expect(vm.energyBank.value?.curve.length).toBeGreaterThan(50);
    expect(vm.tonight.value?.plans.map((p) => p.label)).toEqual(["Peak", "Perform", "Get by"]);
    const [peak, perform, getBy] = vm.tonight.value!.plans;
    expect(peak.bedtimeAt).toBeLessThan(perform.bedtimeAt);
    expect(perform.bedtimeAt).toBeLessThan(getBy.bedtimeAt);
    expect(vm.weeklyTeaser).toMatchObject({ period: "2026-W39", start: "2026-09-21", end: "2026-09-27" });
  });

  it("never holds NaN, and every missing metric says why, on every seeded day", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 180; i++) inspect(getHome(dayAt(i), ctxFor(db)), seen);
    inspect(getHome(dayAt(179), ctxFor(early, BEFORE_WAKE)), seen);
    expect([...seen].sort()).toEqual([...REASONS, "provisional", "stale_baseline"].sort());
  });

  it("shows the seeded reasons: calibrating with nights left, no HRV, band off, and today before wake", () => {
    for (let i = 0; i < 7; i++) expect(getHome(dayAt(i), ctxFor(db)).dials.recovery).toMatchObject({ value: null, reason: "calibrating", nightsLeft: 7 - i });
    expect(getHome(dayAt(7), ctxFor(db)).dials.recovery.value).toBeTypeOf("number");
    expect(getHome(dayAt(164), ctxFor(db)).dials.recovery.reason).toBe("no_hrv_last_night");
    for (const i of [156, 157]) {
      const vm = getHome(dayAt(i), ctxFor(db));
      expect(vm.dials.recovery.reason).toBe("band_not_worn");
      expect(vm.dials.sleep.reason).toBe("band_not_worn");
    }
    expect(getHome(dayAt(156), ctxFor(db)).dials.strain.reason).toBe("band_not_worn");
    expect(getHome(dayAt(157), ctxFor(db)).dials.strain.reason).toBe("insufficient_hr_data");

    const morning = getHome(dayAt(179), ctxFor(early, BEFORE_WAKE));
    expect(morning.dials.recovery.reason).toBe("awaiting_sleep_sync");
    expect(morning.dials.sleep.reason).toBe("awaiting_sleep_sync");
    expect(morning.energyBank.reason).toBe("awaiting_sleep_sync");
    expect(morning.dials.reason).toEqual({ reason: "awaiting_sleep_sync" });
    expect(morning.keyStats.find((s) => s.key === "hrv")!.metric.reason).toBe("awaiting_sleep_sync");
  });

  it("switches the day banner from outlook to review at 17:00, and past days always review", () => {
    const at = (h: number) => Date.parse(`2026-10-02T${String(h).padStart(2, "0")}:00:00+05:30`) / 1000;
    const morning = getHome(dayAt(179), ctxFor(db, at(14))).outlook;
    expect(morning).toMatchObject({ kind: "outlook", title: "Your daily outlook" });
    expect(morning!.body).toMatch(/^Your Recovery is \d+%, (green|yellow|red)\./);
    expect(getHome(dayAt(179), ctxFor(db, at(17))).outlook).toMatchObject({ kind: "review", title: "Your day in review" });
    const past = getHome(dayAt(170), ctxFor(db)).outlook!;
    expect(past.kind).toBe("review");
    expect(past.body).toMatch(/Day Strain was \d+\.\d/);
    // A day with no band data has nothing to summarise.
    expect(getHome(dayAt(156), ctxFor(db)).outlook).toBeNull();
  });

  it("lists today's coach cards (strain first) and none on past days", () => {
    const today = getHome(dayAt(179), ctxFor(db));
    expect(today.insights.length).toBeGreaterThan(0);
    expect(today.insights[0].key).toBe("strain");
    for (const i of today.insights) {
      expect(i.title.length).toBeGreaterThan(0);
      expect(i.body).not.toMatch(/WHOOP|!/);
      expect(i.href).toMatch(/^\/(strain|recovery|sleep)$/);
    }
    expect(getHome(dayAt(170), ctxFor(db)).insights).toEqual([]);
  });

  it("gives the journal week and the 7-day Strain and Recovery series ending on the day", () => {
    const vm = getHome(dayAt(170), ctxFor(db));
    expect(vm.journalWeek.map((w) => w.day)).toEqual([164, 165, 166, 167, 168, 169, 170].map(dayAt));
    expect(vm.journalWeek.some((w) => w.done)).toBe(true);
    expect(vm.strainRecovery.map((p) => p.day)).toEqual(vm.journalWeek.map((w) => w.day));
    for (const p of vm.strainRecovery) {
      if (p.strain !== null) expect(p.strain >= 0 && p.strain <= 21).toBe(true);
      if (p.recovery !== null) expect(p.recovery >= 0 && p.recovery <= 100).toBe(true);
    }
    // The band-off day has neither score.
    const off = getHome(dayAt(158), ctxFor(db)).strainRecovery.find((p) => p.day === dayAt(156))!;
    expect(off).toEqual({ day: dayAt(156), strain: null, recovery: null });
  });

  it("raises the Health Monitor alert in the seeded illness week", () => {
    const flagged = [118, 119, 120, 121, 122].map((i) => getHome(dayAt(i), ctxFor(db)).monitorAlert);
    expect(flagged.some((a) => a?.kind === "illness")).toBe(true);
    expect(getHome(dayAt(60), ctxFor(db)).monitorAlert?.kind ?? null).not.toBe("illness");
  });
});

describe("every screen query", () => {
  it("returns NaN-free view models with reasons for a spread of days", () => {
    const ctx = ctxFor(db);
    const seen = new Set<string>();
    for (const i of [0, 3, 7, 14, 30, 60, 100, 120, 156, 157, 164, 170, 178, 179]) {
      const d = dayAt(i);
      for (const vm of [getRecovery(d, ctx), getStrain(d, ctx), getSleep(d, ctx), getMonitor(d, ctx), getStress(d, ctx), getHealthspan(d, ctx), getJournal(d, ctx)]) {
        inspect(vm, seen);
      }
    }
    inspect([getHealthHub(ctx), getFitness(ctx), getMore(ctx), getSettings(ctx), getShellStatus(ctx)], seen);
    for (const m of ["recovery", "hrv", "sleep"] as const) inspect(getJournalInsights(m, ctx), seen);
    const periods = db.$client.prepare("select period from reports").pluck().all() as string[];
    for (const p of periods) inspect(getReport(p, ctx), seen);
    const ids = db.$client.prepare("select id from exercises where day >= ?").pluck().all(dayAt(150)) as string[];
    for (const id of ids) inspect(getActivity(id, ctx), seen);
    expect(seen).toContain("calibrating");
    expect(getActivity("nope", ctx)).toBeNull();
    expect(getReport("1999-W01", ctx)).toBeNull();
  });

  it("Stress Monitor gives the typical weekday minutes per level, and the hub a week-on-week pace change", () => {
    const l = getStress(dayAt(170), ctxFor(db)).levels.value!;
    expect(l.typical).not.toBeNull();
    expect(l.typical!.highMin).toBeCloseTo(l.highMin - l.typicalDeltaMin!, 6);
    expect(getStress(dayAt(3), ctxFor(db)).levels.value?.typical ?? null).toBeNull();
    const hs = getHealthHub(ctxFor(db)).healthspan.value;
    if (hs) expect(hs.paceDelta === null || Number.isFinite(hs.paceDelta)).toBe(true);
  });

  it("Journal Insights shows the seeded alcohol effect as negative", () => {
    const vm = getJournalInsights("recovery", ctxFor(db));
    const alcohol = vm.items.find((x) => x.key === "alcohol");
    expect(alcohol?.effect).toBe("negative");
    expect(alcohol!.avgWith!).toBeLessThan(alcohol!.avgWithout!);
  });

  it("Settings reports the demo source and the read-only profile", () => {
    const vm = getSettings(ctxFor(db));
    expect(vm.source).toEqual({ label: "Demo data", status: "demo" });
    expect(vm.sync).toEqual([expect.objectContaining({ key: "seed", label: "Demo generator", status: "ok" })]);
    expect(vm.profile).toMatchObject({ sex: "male", maxHr: 183, maxHrSource: "set", age: 36 });
    expect(getShellStatus(ctxFor(db))).toMatchObject({ mode: "demo", connection: "connected", today: dayAt(179), firstDay: dayAt(0) });
  });

  it("counts the wear streak back to the band-off day; early on, today does not count yet", () => {
    // Day 156 had no heart rate at all; day 157 got the band back late in the evening.
    expect(getShellStatus(ctxFor(db)).streak).toEqual({ days: 179 - 157 + 1, asOf: dayAt(179) });
    expect(getShellStatus(ctxFor(early, BEFORE_WAKE)).streak).toEqual({ days: 178 - 157 + 1, asOf: dayAt(178) });
  });
});
