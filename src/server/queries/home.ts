import { BODY_METRICS, DASHBOARD_DEFAULT, DASHBOARD_LABEL, DASHBOARD_METRICS, type DashboardKey, isDashboardKey, PHONE_DEFAULT, PHONE_STATS } from "@/lib/dashboard";
import { EXTRA_METRICS, type ExtraKey, type ExtraMetric } from "@/lib/extraMetrics";
import { hmm } from "@/lib/format";
import { metricHref } from "@/lib/url";
import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import type { Db } from "../db";
import { dashboardMetrics, hrDays, journalEntries, reports } from "../db/schema";
import { addDays, localMinutes } from "../time";
import { insightOf as recoveryInsight } from "./recovery";
import { insightOf as sleepInsight } from "./sleep";
import { coach } from "./strain";
import {
  activityKind,
  type DayRow,
  hrReason,
  loadDays,
  loadSeries,
  maybe,
  minutePoints,
  ms,
  none,
  nightReason,
  ok,
  planVM,
  priorStats,
  type QueryCtx,
  recoveryMetric,
  sleepMetric,
  strainMetric,
  stressNow,
  stressChartOf,
  exercisesBetween,
  timelineOf,
  todayOf,
  vitalReason,
  dayStartOf,
  finite,
  recoveryBand,
  toStrain,
} from "./common";
import type { ActivityKind, EnergyBankVM, HomeVM, KeyStat, Metric, VitalKey } from "./types";

export const VITAL_LABEL: Record<VitalKey, string> = {
  resp: "Respiratory rate",
  spo2: "Blood oxygen",
  restingHr: "Resting heart rate",
  hrv: "Heart rate variability",
  skinTempDev: "Skin temperature",
};

export async function getHome(day: string, ctx: QueryCtx): Promise<HomeVM> {
  const today = todayOf(ctx);
  const isToday = day === today;
  const stripStart = day < addDays(today, -29) ? day : addDays(today, -29);
  const [rows, exs, keys, defaults, weeklyTeaser, journal, ebSeries] = await Promise.all([
    loadDays(ctx, addDays(stripStart, -30), today),
    exercisesBetween(ctx, day, day),
    dashboardKeys(ctx.db, ctx.userId),
    dashboardDefault(ctx.db, ctx.userId),
    latestReport(ctx, "week"),
    journalWeek(ctx, day),
    loadSeries(ctx, day, "energy_bank"),
  ]);
  // The tile's line is a minute series: read it only when the tile is on the dashboard.
  const stressSeries = keys.includes("stress") ? await loadSeries(ctx, day, "stress") : null;
  const row = rows.get(day);

  const recovery = recoveryMetric(row, isToday);
  const sleep = sleepMetric(row, isToday);
  const strain = strainMetric(row);
  const target = row?.strainTarget?.reason === null ? ([row.strainTarget.low, row.strainTarget.high] as [number, number]) : null;
  const firstReason = [recovery, sleep, strain].find((m) => m.value == null);

  const strip: HomeVM["strip"] = [];
  for (let d = stripStart; d <= today; d = addDays(d, 1)) strip.push({ day: d, recovery: rows.get(d)?.recovery?.value ?? null });

  return {
    day,
    today,
    isToday,
    strip,
    dials: {
      sleep,
      recovery,
      strain,
      strainTarget: target,
      soFar: isToday,
      reason: firstReason ? { reason: firstReason.reason!, ...(firstReason.nightsLeft !== undefined && { nightsLeft: firstReason.nightsLeft }) } : null,
    },
    monitorAlert: monitorAlert(row),
    monitor: monitorSummary(row, isToday),
    stress: stressNow(row, isToday),
    plan: null,
    stressChart: keys.includes("stress") ? stressChartOf(ctx, row, day, isToday, stressSeries, exs) : null,
    activities: { title: isToday ? "Today’s activities" : "Activities", items: timelineOf(row, day, exs) },
    energyBank: energyBankVM(ctx, row, day, isToday, ebSeries),
    tonight: planVM(ctx, row, isToday),
    keyStats: keyStats(rows, day, isToday, keys),
    dashboard: { defaults, empty: emptyKeys(rows, day, isToday) },
    phone: phoneDay(rows, day, isToday),
    weeklyTeaser,
    outlook: outlookOf(ctx, row, { recovery, strain, target }, isToday),
    insights: isToday ? insightsOf(ctx, rows, row, day, { strain, target }) : [],
    journalWeek: journal,
    strainRecovery: Array.from({ length: 7 }, (_, k) => {
      const d = addDays(day, k - 6);
      const r = rows.get(d);
      const e = r?.s1?.effort;
      const rec = r?.recovery?.value;
      // A day without accrued effort is a gap; zero would show a misleading drop in Strain.
      const scored = finite(e) && (d !== today || e > 0);
      return { day: d, strain: scored ? toStrain(e) : null, recovery: finite(rec) ? rec : null };
    }),
  };
}

export const REVIEW_FROM_MIN = 17 * 60;
const f1 = (x: number) => x.toFixed(1);

type DayScores = { recovery: Metric<number>; strain: Metric<number>; target: [number, number] | null };

export function outlookOf(ctx: QueryCtx, row: DayRow | undefined, s: DayScores, isToday: boolean): HomeVM["outlook"] {
  const review = !isToday || localMinutes(ctx.now, ctx.timeZone) >= REVIEW_FROM_MIN;
  const rec = s.recovery.value;
  const target = s.target ? `${f1(s.target[0])} - ${f1(s.target[1])}` : null;
  const parts: string[] = [];
  if (!review) {
    if (rec != null) parts.push(`Your Recovery is ${Math.round(rec)}%, ${recoveryBand(rec)}.`);
    if (target) parts.push(`Today’s Strain Target is ${target}.`);
    const main = row?.sleep?.main;
    if (main && row?.sleep?.needHours) parts.push(`You slept ${hmm(main.asleepMin)} of the ${hmm(row.sleep.needHours * 60)} you needed.`);
  } else {
    const n = row?.activities.length ?? 0;
    const acts = n ? `, with ${n} ${n === 1 ? "activity" : "activities"}` : "";
    if (s.strain.value != null) parts.push(`Day Strain ${isToday ? "is" : "was"} ${f1(s.strain.value)}${target ? ` against a target of ${target}` : ""}${acts}.`);
    if (rec != null) parts.push(`Recovery ${isToday ? "is" : "was"} ${Math.round(rec)}%.`);
    const st = row?.stress;
    if (st && st.average != null) parts.push(`You spent ${hmm(st.highMin)} in high stress.`);
  }
  if (!parts.length) return null;
  return { kind: review ? "review" : "outlook", title: review ? "Your day in review" : "Your daily outlook", body: parts.join(" ") };
}

const RECOVERY_TITLE = { green: "Ready for strain", yellow: "A steady day", red: "Time to recover" } as const;

function insightsOf(ctx: QueryCtx, rows: Map<string, DayRow>, row: DayRow | undefined, day: string, s: Pick<DayScores, "strain" | "target">): HomeVM["insights"] {
  const out: HomeVM["insights"] = [];
  const target = s.target ? { low: s.target[0], high: s.target[1] } : null;
  const c = coach(s.strain, target, row);
  if (c && target && s.strain.value != null) {
    const v = s.strain.value;
    const red = row?.recovery?.value != null && row.recovery.value < 34;
    const title = red ? "Keep strain light" : v < target.low ? "Room for more strain" : v <= target.high ? "Reaching optimal strain" : "Past your target";
    out.push({ key: "strain", title, body: c, href: "/strain" });
  }
  const r = row?.recovery;
  if (r?.value != null) out.push({ key: "recovery", title: RECOVERY_TITLE[recoveryBand(r.value)], body: recoveryInsight(r.drivers), href: "/recovery" });
  const sl = sleepInsight(rows, day, ctx.timeZone);
  if (sl) out.push({ key: "sleep", title: "Last night’s sleep", body: sl, href: "/sleep" });
  return out;
}

async function journalWeek(ctx: QueryCtx, day: string): Promise<HomeVM["journalWeek"]> {
  const from = addDays(day, -6);
  const j = journalEntries;
  const done = new Set(
    (await ctx.db
      .selectDistinct({ day: j.day })
      .from(j)
      .where(and(eq(j.userId, ctx.userId), gte(j.day, from), lte(j.day, day)))).map((r) => r.day),
  );
  return Array.from({ length: 7 }, (_, k) => {
    const d = addDays(from, k);
    return { day: d, done: done.has(d) };
  });
}

/** Raised (or agreeing with a logged illness) counts as the illness flag. */
export const illnessRaised = (hm: DayRow["healthMonitor"]) =>
  !!hm && hm.reason === null && (hm.illness.level === "raised" || (hm.illness.level === "alreadyUnwell" && hm.illness.score >= 50 && hm.illness.signalCount >= 2));

function monitorAlert(row: DayRow | undefined): HomeVM["monitorAlert"] {
  const hm = row?.healthMonitor;
  if (!hm || hm.reason !== null) return null;
  const flagged = hm.vitals.filter((v) => v.status === "high" || v.status === "low");
  const illness = illnessRaised(hm);
  if (!illness && !flagged.length) return null;
  return { kind: illness ? "illness" : "flagged", count: flagged.length, names: flagged.map((v) => VITAL_LABEL[v.key]) };
}

function monitorSummary(row: DayRow | undefined, isToday: boolean): HomeVM["monitor"] {
  const hm = row?.healthMonitor;
  if (!hm) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (hm.reason !== null) return none(nightReason(hm.reason, isToday));
  return ok({ inRange: hm.inRange, total: hm.vitals.length, flagged: hm.flagged });
}

/** `series` is the day's stored energy_bank minute series (loadSeries), fetched by the caller alongside its other reads. */
export function energyBankVM(ctx: QueryCtx, row: DayRow | undefined, day: string, isToday: boolean, series: (number | null)[] | null): Metric<EnergyBankVM> {
  const eb = row?.energyBank;
  if (!eb) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (eb.value == null) return none(nightReason(eb.reason, isToday), row?.recovery?.nightsLeft);
  const start = dayStartOf(ctx, day);
  const wakeM = Math.max(0, Math.floor((eb.wake - start) / 60));
  const untilM = Math.ceil((eb.until - start) / 60);
  const curve = minutePoints(series, start, 5, wakeM, untilM).filter((p) => p.v != null);
  return ok(
    {
      current: eb.value,
      startLevel: eb.startLevel,
      startAt: ms(eb.wake),
      until: ms(eb.until),
      charged: eb.charged,
      drained: eb.drained,
      curve,
      drains: eb.topDrains.map((d) => ({ label: d.label, kind: d.kind, start: ms(d.start), amount: d.amount })),
      naps: eb.naps.map((n) => ({ start: ms(n.start), end: ms(n.end) })),
    },
    eb.provisional,
  );
}

/** True once any heart rate has synced: a phone-only account (no Fitbit band) has none. */
const hasBand = async (db: Db, userId: number) =>
  (await db.select({ b: hrDays.bucket }).from(hrDays).where(eq(hrDays.userId, userId)).limit(1)).length > 0;

export const dashboardDefault = async (db: Db, userId: number): Promise<DashboardKey[]> => ((await hasBand(db, userId)) ? DASHBOARD_DEFAULT : PHONE_DEFAULT);

/** My Dashboard's chosen metrics in order. Keys no longer in the catalogue are skipped; none chosen means the default list. */
export async function dashboardKeys(db: Db, userId: number): Promise<DashboardKey[]> {
  const t = dashboardMetrics;
  const keys = (await db.select({ key: t.key }).from(t).where(eq(t.userId, userId)).orderBy(t.position)).map((r) => r.key).filter(isDashboardKey);
  return keys.length ? keys : dashboardDefault(db, userId);
}

type StatSpec = Omit<KeyStat, "key" | "label" | "average" | "sd"> & { pick: (r: DayRow) => number | null | undefined };

const spec = (
  pick: StatSpec["pick"],
  metric: Metric<number>,
  unit: string | undefined,
  direction: KeyStat["direction"],
  href?: string,
  format?: KeyStat["format"],
): StatSpec => ({ pick, metric, ...(unit && { unit }), direction, ...(href && { href }), ...(format && { format }) });

function statSpecs(row: DayRow | undefined, isToday: boolean): Record<DashboardKey, StatSpec> {
  const m = row?.metrics;
  const rhr = (r: DayRow) => r.metrics?.rhrBpm ?? r.sessionRhr ?? null;
  const skin = (r: DayRow) => r.recovery?.inputs.skinTempDev ?? null;
  const skinReason = m?.nightlyTempC != null ? "calibrating" : vitalReason(row, isToday);
  const dailyReason = !row?.s1 || row.s1.hrCount === 0 ? hrReason(row?.s1 ?? null) : "no_data";
  const out = {
    hrv: spec((r) => r.metrics?.hrvMs, maybe(m?.hrvMs, vitalReason(row, isToday, true)), "ms", "up", metricHref("hrv")),
    rhr: spec(rhr, maybe(row && rhr(row), vitalReason(row, isToday)), "bpm", "down", metricHref("rhr")),
    resp: spec((r) => r.metrics?.respBpm, maybe(m?.respBpm, vitalReason(row, isToday)), "rpm", "down", metricHref("resp")),
    sleep: spec((r) => r.sleep?.performance, sleepMetric(row, isToday), "%", "up", "/sleep"),
    calories: spec((r) => r.metrics?.calories, maybe(m?.calories, dailyReason), "kcal", "neutral", metricHref("calories")),
    steps: spec((r) => r.metrics?.steps, maybe(m?.steps, dailyReason), undefined, "up", metricHref("steps")),
    spo2: spec((r) => r.metrics?.spo2Pct, maybe(m?.spo2Pct, vitalReason(row, isToday)), "%", "up", metricHref("spo2")),
    skin: spec(skin, maybe(row && skin(row), skinReason), "°C", "toward_zero", metricHref("skin")),
    stress: spec((r) => r.stress?.average, maybe(row?.stress?.average, dailyReason), undefined, "down", "/health/stress", "decimal1"),
  } as Record<DashboardKey, StatSpec>;
  for (const b of BODY_METRICS) {
    const pick = (r: DayRow) => (b.key === "weight" ? r.metrics?.weightKg : r.metrics?.bodyFatPct);
    out[b.key] = spec(pick, maybe(row && pick(row), "no_data"), b.unit, b.direction, b.href, b.format);
  }
  for (const e of EXTRA_METRICS as readonly ExtraMetric[])
    out[e.key as ExtraKey] = spec((r) => r.extra[e.key as ExtraKey], maybe(row?.extra[e.key as ExtraKey], "no_data"), e.unit, e.direction, metricHref(e.key), e.format);
  return out;
}

export function keyStats(rows: Map<string, DayRow>, day: string, isToday: boolean, keys: DashboardKey[]): KeyStat[] {
  const specs = statSpecs(rows.get(day), isToday);
  return keys.map((key) => {
    const { pick, ...s } = specs[key];
    const { mean, sd } = priorStats(rows, day, pick);
    return { key, label: DASHBOARD_LABEL[key], ...s, average: mean, ...(sd !== undefined && { sd }) };
  });
}

/** Catalogue metrics with no value on `day` or in the 30 days before it: the editor marks them "No data yet". */
function emptyKeys(rows: Map<string, DayRow>, day: string, isToday: boolean): DashboardKey[] {
  const specs = statSpecs(rows.get(day), isToday);
  const days = Array.from({ length: 31 }, (_, k) => rows.get(addDays(day, -k))).filter((r): r is DayRow => !!r);
  return DASHBOARD_METRICS.map((m) => m.key).filter((key) => !days.some((r) => finite(specs[key].pick(r))));
}

/** Phone-only activity leads Home when no band heart rate was recorded. */
function phoneDay(rows: Map<string, DayRow>, day: string, isToday: boolean): KeyStat[] | null {
  const row = rows.get(day);
  if (!row || (row.s1 && row.s1.hrCount > 0)) return null;
  // Calories alone is Google's resting-burn estimate, there with or without a phone: it needs movement too.
  if (!row.metrics?.steps && !row.extra.distance && !row.activities.length) return null;
  const stats = keyStats(rows, day, isToday, PHONE_STATS).filter((s) => s.metric.value !== null);
  return stats.length ? stats : null;
}

export async function latestReport(ctx: QueryCtx, kind: "week" | "month") {
  const pattern = kind === "week" ? "____-W__" : "____-__";
  const rows = await ctx.db
    .select({ period: reports.period, data: reports.data })
    .from(reports)
    .where(and(eq(reports.userId, ctx.userId), like(reports.period, pattern)))
    .orderBy(desc(reports.period))
    .limit(3);
  for (const r of rows) {
    const d = r.data as { partial: boolean; start: string; end: string; days: number };
    if (!d.partial && d.days > 0) return { period: r.period, start: d.start, end: d.end };
  }
  return null;
}

/** What the hidden Add / Start Activity flows read (FEATURES.logActivity, startActivity): today's Strain Target and the kinds of the last 30 days' workouts, newest first. */
export async function activityLogContext(ctx: QueryCtx): Promise<{ strainTarget: [number, number] | null; recent: ActivityKind[] }> {
  const today = todayOf(ctx);
  const [rows, recent] = await Promise.all([loadDays(ctx, today, today), exercisesBetween(ctx, addDays(today, -30), today)]);
  const t = rows.get(today)?.strainTarget;
  const kinds = [...recent].sort((a, b) => b.startTs - a.startTs).map((e) => activityKind(e.type));
  return { strainTarget: t?.reason === null ? [t.low, t.high] : null, recent: [...new Set(kinds)] };
}
