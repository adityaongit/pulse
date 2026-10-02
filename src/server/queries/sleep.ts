import { addDays, localMinutes } from "../time";
import {
  type DayRow,
  defaultCtx,
  finite,
  fromReason,
  loadDays,
  maybe,
  ms,
  none,
  ok,
  planVM,
  priorStats,
  type QueryCtx,
  sleepMetric,
  todayOf,
  vitalReason,
} from "./common";
import type { KeyStat, Metric, SleepStatus, SleepVM } from "./types";

type Stage = "awake" | "rem" | "light" | "deep";
const STAGE_ROWS: { stage: Stage; label: string; typical: [number, number] }[] = [
  { stage: "awake", label: "Awake", typical: [5, 10] },
  { stage: "rem", label: "REM", typical: [20, 25] },
  { stage: "light", label: "Light", typical: [45, 55] },
  { stage: "deep", label: "Deep", typical: [13, 23] },
];

const status = (v: number | null | undefined, optimal: number, sufficient: number): SleepStatus | undefined =>
  !finite(v) ? undefined : v >= optimal ? "optimal" : v >= sufficient ? "sufficient" : "poor";

const hoursPct = (r: DayRow) => {
  const m = r.sleep?.main;
  return m && r.sleep ? (m.asleepMin / (r.sleep.needHours * 60)) * 100 : null;
};
const efficiencyPct = (r: DayRow) => (r.sleep?.main ? r.sleep.main.efficiency * 100 : null);
const restorativePct = (r: DayRow) => {
  const m = r.sleep?.main;
  return m && m.asleepMin > 0 && m.deepMin != null && m.remMin != null ? ((m.deepMin + m.remMin) / m.asleepMin) * 100 : null;
};

/** Sleep `/sleep` for `day` (spec §7.5). */
export function getSleep(day: string, ctx: QueryCtx = defaultCtx()): SleepVM {
  const today = todayOf(ctx);
  const isToday = day === today;
  const rows = loadDays(ctx, addDays(day, -181), day);
  const row = rows.get(day);
  const s = row?.sleep ?? null;
  const main = s?.main ?? null;
  const performance = sleepMetric(row, isToday);
  const noNight = performance.value == null ? performance.reason ?? "no_data" : null;
  const reason = noNight ?? "no_data";

  const stat = (key: string, label: string, pick: (r: DayRow) => number | null | undefined, unit: string | undefined, st?: (v: number | null | undefined) => SleepStatus | undefined, r = reason): KeyStat => {
    const v = row ? pick(row) : null;
    const { mean, sd } = priorStats(rows, day, pick);
    const sv = st?.(v);
    return { key, label, metric: maybe(v, r), ...(unit && { unit }), average: mean, ...(sd !== undefined && { sd }), direction: "up", ...(sv && { status: sv }) };
  };
  const summary = [
    stat("hours", "Hours vs. needed", hoursPct, "%", (v) => status(v, 85, 70)),
    stat("consistency", "Sleep consistency", (r) => r.sleep?.consistency, "%", (v) => status(v, 80, 70), main ? "calibrating" : reason),
    stat("efficiency", "Sleep efficiency", efficiencyPct, "%", (v) => status(v, 85, 75)),
    stat("restorative", "Restorative sleep", restorativePct, "%", (v) => status(v, 40, 30)),
  ];

  // Last night's need is the plan made the evening before.
  const prevPlan = rows.get(addDays(day, -1))?.sleepPlanner;
  const hoursVsNeed: SleepVM["hoursVsNeed"] =
    !main || !s
      ? fromReason(noNight, isToday)
      : prevPlan && prevPlan.reason === null
        ? ok({ asleepMin: main.asleepMin, needMin: prevPlan.needMin, parts: prevPlan.parts, calibrating: false })
        : ok({ asleepMin: main.asleepMin, needMin: s.needHours * 60, parts: { baselineMin: s.needHours * 60, strainMin: 0, debtMin: 0, napMin: 0 }, calibrating: true });

  const details = [
    { ...stat("timeInBed", "Time in bed", (r) => r.sleep?.main?.inBedMin, "min"), direction: "neutral" as const },
    { ...stat("wakeEvents", "Wake events", (r) => r.sleep?.main?.wakeEvents, undefined), direction: "down" as const },
    { ...stat("resp", "Respiratory rate", (r) => r.metrics?.respBpm, "rpm", undefined, vitalReason(row, isToday)), direction: "neutral" as const },
    { ...stat("debt", "Sleep debt", (r) => (r.sleep?.main ? r.sleep.debtMin : null), "min"), direction: "down" as const },
  ];

  const plan = planVM(ctx, row, isToday);
  return {
    day,
    isToday,
    performance,
    summary,
    insight: insightOf(rows, day, ctx.timeZone),
    stages: stagesOf(ctx, row, noNight),
    hoursVsNeed,
    details,
    debtTrend: {
      points: Array.from({ length: 182 }, (_, k) => {
        const d = addDays(day, k - 181);
        const r = rows.get(d)?.sleep;
        return { day: d, value: r?.main ? r.debtMin / 60 : null };
      }),
    },
    planner: plan.value ? ok({ ...plan.value, weekdayWake: !plan.value.weekend }) : (plan as Metric<never>),
  };
}

function stagesOf(ctx: QueryCtx, row: DayRow | undefined, noNight: SleepVM["performance"]["reason"]): SleepVM["stages"] {
  const main = row?.sleep?.main;
  if (!main) return none(noNight ?? "no_data");
  if (!main.staged) return null;
  const segments = (
    ctx.db.$client.prepare("select stage, start_ts startTs, end_ts endTs from sleep_segments where session_id = ? order by start_ts").all(main.id) as {
      stage: Stage;
      startTs: number;
      endTs: number;
    }[]
  ).map((g) => ({ stage: g.stage, start: ms(g.startTs), end: ms(g.endTs) }));
  const minutes: Record<Stage, number> = { awake: main.awakeMin, rem: main.remMin ?? 0, light: main.lightMin ?? 0, deep: main.deepMin ?? 0 };
  const total = minutes.awake + minutes.rem + minutes.light + minutes.deep;
  return ok({
    bed: ms(main.start),
    wake: ms(main.end),
    segments,
    rows: STAGE_ROWS.map((r) => ({ ...r, minutes: minutes[r.stage], pct: total > 0 ? (minutes[r.stage] / total) * 100 : 0 })),
  });
}

/** Bedtime as minutes from midnight, evening negative. */
const bedMin = (start: number, tz: string) => {
  const m = localMinutes(start, tz);
  return m > 720 ? m - 1440 : m;
};

function insightOf(rows: Map<string, DayRow>, day: string, tz: string): string | null {
  const row = rows.get(day);
  const perf = row?.sleep?.performance;
  const main = row?.sleep?.main;
  if (!finite(perf) || !main) return null;
  const word = perf >= 85 ? "optimal" : perf >= 70 ? "sufficient" : "poor";
  const prior: number[] = [];
  for (let k = 1; k <= 14; k++) {
    const m = rows.get(addDays(day, -k))?.sleep?.main;
    if (m) prior.push(bedMin(m.start, tz));
  }
  prior.sort((a, b) => a - b);
  const usual = prior.length ? prior[Math.floor(prior.length / 2)] : null;
  const shift = usual == null ? 0 : bedMin(main.start, tz) - usual;
  const consistency = row?.sleep?.consistency;
  if (Math.abs(shift) >= 45) {
    return `Your sleep was ${word}. Consistency is the easiest win: you went to bed ${Math.abs(Math.round(shift))} minutes ${shift > 0 ? "later" : "earlier"} than usual.`;
  }
  if (finite(consistency) && consistency < 70) return `Your sleep was ${word}. Keeping a steadier bedtime and wake time would lift your consistency.`;
  const need = row?.sleep ? row.sleep.needHours * 60 : null;
  if (need && main.asleepMin < need * 0.85) return `Your sleep was ${word}. You slept ${Math.round(need - main.asleepMin)} minutes less than you needed; an earlier night helps.`;
  return `Your sleep was ${word}. You kept to your usual schedule and slept close to your need.`;
}
