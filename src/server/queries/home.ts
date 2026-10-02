import { addDays } from "../time";
import {
  type DayRow,
  defaultCtx,
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
  timeline,
  todayOf,
  vitalReason,
  dayStartOf,
} from "./common";
import type { EnergyBankVM, HomeVM, KeyStat, Metric, VitalKey } from "./types";

export const VITAL_LABEL: Record<VitalKey, string> = {
  resp: "Respiratory rate",
  spo2: "Blood oxygen",
  restingHr: "Resting heart rate",
  hrv: "Heart rate variability",
  skinTempDev: "Skin temperature",
};

/** Home `/` for `day` (spec §7.1). */
export function getHome(day: string, ctx: QueryCtx = defaultCtx()): HomeVM {
  const today = todayOf(ctx);
  const isToday = day === today;
  const stripStart = day < addDays(today, -29) ? day : addDays(today, -29);
  const rows = loadDays(ctx, addDays(stripStart < day ? stripStart : day, -30), today);
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
    activities: { title: isToday ? "Today's activities" : "Activities", items: timeline(ctx, row, day) },
    energyBank: energyBankVM(ctx, row, day, isToday),
    tonight: planVM(ctx, row, isToday),
    keyStats: keyStats(rows, day, isToday),
    weeklyTeaser: latestReport(ctx, "week"),
  };
}

/** Raised (or agreeing with a logged illness) counts as the illness flag. */
export const illnessRaised = (hm: DayRow["healthMonitor"]) =>
  !!hm && hm.reason === null && (hm.illness.level === "raised" || (hm.illness.level === "alreadyUnwell" && hm.illness.score >= 50 && hm.illness.signalCount >= 2));

function monitorAlert(row: DayRow | undefined): HomeVM["monitorAlert"] {
  const hm = row?.healthMonitor;
  if (!hm || hm.reason !== null) return null;
  const flagged = hm.vitals.filter((v) => v.status === "high" || v.status === "low");
  if (illnessRaised(hm)) return { kind: "illness", count: flagged.length, names: flagged.map((v) => VITAL_LABEL[v.key]) };
  if (flagged.length) return { kind: "flagged", count: flagged.length, names: flagged.map((v) => VITAL_LABEL[v.key]) };
  return null;
}

function monitorSummary(row: DayRow | undefined, isToday: boolean): HomeVM["monitor"] {
  const hm = row?.healthMonitor;
  if (!hm) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (hm.reason !== null) return none(nightReason(hm.reason, isToday));
  return ok({ inRange: hm.inRange, total: hm.vitals.length, flagged: hm.flagged });
}

export function energyBankVM(ctx: QueryCtx, row: DayRow | undefined, day: string, isToday: boolean): Metric<EnergyBankVM> {
  const eb = row?.energyBank;
  if (!eb) return none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  if (eb.value == null) return none(nightReason(eb.reason, isToday), row?.recovery?.nightsLeft);
  const start = dayStartOf(ctx, day);
  const wakeM = Math.max(0, Math.floor((eb.wake - start) / 60));
  const untilM = Math.ceil((eb.until - start) / 60);
  const curve = minutePoints(loadSeries(ctx, day, "energy_bank"), start, 5, wakeM, untilM).filter((p) => p.v != null);
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

function keyStats(rows: Map<string, DayRow>, day: string, isToday: boolean): KeyStat[] {
  const row = rows.get(day);
  const m = row?.metrics;
  const rhr = (r: DayRow) => r.sessionRhr ?? r.metrics?.rhrBpm ?? null;
  const skin = (r: DayRow) => r.recovery?.inputs.skinTempDev ?? null;
  const stat = (
    key: string,
    label: string,
    pick: (r: DayRow) => number | null | undefined,
    metric: Metric<number>,
    unit: string | undefined,
    direction: KeyStat["direction"],
    href: string,
  ): KeyStat => {
    const { mean, sd } = priorStats(rows, day, pick);
    return { key, label, metric, ...(unit && { unit }), average: mean, ...(sd !== undefined && { sd }), direction, href };
  };
  const skinReason = m?.nightlyTempC != null ? "calibrating" : vitalReason(row, isToday);
  const dailyReason = !row?.s1 || row.s1.hrCount === 0 ? hrReason(row?.s1 ?? null) : "no_data";
  return [
    stat("hrv", "Heart rate variability", (r) => r.metrics?.hrvMs, maybe(m?.hrvMs, vitalReason(row, isToday, true)), "ms", "up", "/recovery"),
    stat("rhr", "Resting heart rate", rhr, maybe(row && rhr(row), vitalReason(row, isToday)), "bpm", "down", "/recovery"),
    stat("resp", "Respiratory rate", (r) => r.metrics?.respBpm, maybe(m?.respBpm, vitalReason(row, isToday)), "rpm", "neutral", "/health/monitor"),
    stat("sleep", "Sleep performance", (r) => r.sleep?.performance, sleepMetric(row, isToday), "%", "up", "/sleep"),
    stat("calories", "Calories", (r) => r.metrics?.calories, maybe(m?.calories, dailyReason), "kcal", "neutral", "/strain"),
    stat("steps", "Steps", (r) => r.metrics?.steps, maybe(m?.steps, dailyReason), undefined, "up", "/strain"),
    stat("spo2", "Blood oxygen", (r) => r.metrics?.spo2Pct, maybe(m?.spo2Pct, vitalReason(row, isToday)), "%", "up", "/health/monitor"),
    stat("skin", "Skin temperature", skin, maybe(row && skin(row), skinReason), "°C", "toward_zero", "/health/monitor"),
  ];
}

/** The latest complete week or month with a report. */
export function latestReport(ctx: QueryCtx, kind: "week" | "month") {
  const like = kind === "week" ? "____-W__" : "____-__";
  const rows = ctx.db.$client
    .prepare("select period, data from reports where period like ? order by period desc limit 3")
    .all(like) as { period: string; data: string }[];
  for (const r of rows) {
    const d = JSON.parse(r.data) as { partial: boolean; start: string; end: string; days: number };
    if (!d.partial && d.days > 0) return { period: r.period, start: d.start, end: d.end };
  }
  return null;
}
