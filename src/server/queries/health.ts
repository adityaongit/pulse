// Health hub and its four detail screens (spec §7.6–7.10).
import type { HealthspanContribution } from "@/core/algorithms/healthspan";
import { addDays, daysBetween, wall } from "../time";
import { illnessRaised, VITAL_LABEL } from "./home";
import {
  type DayRow,
  dayStartOf,
  defaultCtx,
  exercisesBetween,
  finite,
  loadDays,
  loadSeries,
  meanSd,
  minutePoints,
  ms,
  nightReason,
  none,
  ok,
  type QueryCtx,
  stressNow,
  todayOf,
  vitalReason,
  activityKind,
} from "./common";
import type {
  ChipTone,
  FitnessVM,
  HealthHubVM,
  HealthspanContributor,
  HealthspanVM,
  Metric,
  MonitorVM,
  Span,
  StressVM,
  Vital,
  VitalKey,
} from "./types";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
const isoDow = (day: string) => (weekdayOf(day) + 6) % 7;
const weekOf = (day: string): [string, string] => [addDays(day, -isoDow(day)), addDays(day, 6 - isoDow(day))];
const lastStored = (ctx: QueryCtx, today: string) =>
  (ctx.db.$client.prepare("select max(day) from daily_scores where day <= ?").pluck().get(today) as string | null) ?? today;

// ── Hub ─────────────────────────────────────────────────────────────────────

/** Health hub `/health`: today's values (spec §7.6). */
export function getHealthHub(ctx: QueryCtx = defaultCtx()): HealthHubVM {
  const today = todayOf(ctx);
  const rows = loadDays(ctx, addDays(today, -35), today);
  const row = rows.get(today);
  const hs = getHealthspan(today, ctx).result;
  const monitor = getMonitor(today, ctx, rows);
  const st = row?.stress;
  const sameDays = [7, 14, 21, 28].map((k) => rows.get(addDays(today, -k))?.stress?.highMin).filter(finite);
  const fit = getFitness(ctx);
  const tl = fit.trainingLoad.value;
  return {
    day: today,
    healthspan: hs.value ? ok({ whoopAge: hs.value.whoopAge, deltaYears: hs.value.deltaYears, pace: hs.value.pace }, hs.provisional) : none(hs.reason ?? "no_data", hs.nightsLeft),
    monitor: monitor.count.value
      ? ok({ vitals: monitor.vitals.map((v) => ({ key: v.key, short: v.short, status: v.status })), inRange: monitor.count.value.inRange, total: 5 })
      : none(monitor.count.reason ?? "no_data"),
    stress:
      st && st.average != null
        ? ok(
            {
              highMin: st.highMin,
              typicalHighMin: sameDays.length ? meanSd(sameDays).mean : null,
              weekday: WEEKDAY[weekdayOf(today)],
              spark: minutePoints(loadSeries(ctx, today, "stress"), dayStartOf(ctx, today), 2),
            },
            st.provisional,
          )
        : none(row?.s1?.hrCount ? "no_data" : "band_not_worn"),
    fitness: fit.vo2.value
      ? ok({ vo2max: fit.vo2.value.value, category: fit.vo2.value.category, percentile: fit.vo2.value.percentile, acwr: tl?.acwr ?? null, acwrTone: tl?.tone ?? null })
      : none("no_data"),
  };
}

// ── Healthspan ──────────────────────────────────────────────────────────────

const HS_META: Record<string, Omit<HealthspanContributor, "metric" | "target" | "years" | "caption" | "key">> = {
  sleepHours: {
    group: "sleep",
    label: "Hours of sleep",
    unit: "h",
    domain: [4, 10],
    higherIsBetter: true,
    explanation: "Both short and long sleep are linked to higher mortality. Seven to eight hours a night carries the lowest risk.",
    source: "Cappuccio 2010",
  },
  sri: {
    group: "sleep",
    label: "Sleep consistency",
    unit: "%",
    domain: [0, 100],
    higherIsBetter: true,
    explanation: "Going to bed and waking at the same times predicts a longer life even more strongly than how long you sleep.",
    source: "Windred 2024",
  },
  zone13: {
    group: "strain",
    label: "Time in zones 1‑3",
    unit: "min",
    domain: [0, 300],
    higherIsBetter: true,
    explanation: "Moderate activity is linked to steeply lower mortality, with most of the benefit in the first 150 minutes a week.",
    source: "Ekelund 2019",
  },
  zone45: {
    group: "strain",
    label: "Time in zones 4‑5",
    unit: "min",
    domain: [0, 150],
    higherIsBetter: true,
    explanation: "Vigorous activity adds benefit on top of moderate activity. About 75 to 150 minutes a week is where it levels off.",
    source: "Lee 2022",
  },
  strength: {
    group: "strain",
    label: "Strength activity time",
    unit: "min",
    domain: [0, 150],
    higherIsBetter: true,
    explanation: "Muscle-strengthening work is linked to lower mortality, with the lowest risk around 40 minutes a week.",
    source: "Momma 2022",
  },
  steps: {
    group: "strain",
    label: "Daily steps",
    unit: "steps",
    domain: [0, 15000],
    higherIsBetter: true,
    explanation: "More daily steps go with lower mortality, levelling off around 8,000 to 10,000 steps a day.",
    source: "Paluch 2022",
  },
  vo2max: {
    group: "fitness",
    label: "VO2 max",
    unit: "ml/kg/min",
    domain: [15, 70],
    higherIsBetter: true,
    explanation:
      "Higher cardiorespiratory fitness is one of the strongest predictors of a longer life. Each extra 1 MET (3.5 ml/kg/min) is linked to about 13% lower all-cause mortality.",
    source: "Kodama 2009",
  },
  restingHr: {
    group: "fitness",
    label: "Resting heart rate",
    unit: "bpm",
    domain: [40, 90],
    higherIsBetter: false,
    explanation: "Each 10 bpm higher resting heart rate is linked to about 9% higher all-cause mortality.",
    source: "Zhang 2016",
  },
  leanMass: {
    group: "fitness",
    label: "Lean body mass",
    unit: "kg",
    domain: [40, 80],
    higherIsBetter: true,
    explanation: "More fat-free mass for your height is linked to lower mortality, independent of body fat.",
    source: "Sedlmeier 2021",
  },
};
const HS_ORDER = ["sleepHours", "sri", "zone13", "zone45", "strength", "steps", "vo2max", "restingHr", "leanMass"];

/** Healthspan `/health/healthspan` for the ISO week containing `day` (spec §7.7). Updated weekly. */
export function getHealthspan(day: string, ctx: QueryCtx = defaultCtx()): HealthspanVM {
  const today = todayOf(ctx);
  const [weekStart, weekEnd] = weekOf(day);
  const last = lastStored(ctx, today);
  const rows = loadDays(ctx, addDays(weekEnd, -182), weekEnd);
  // A finished week shows its Sunday; the current week shows last Sunday until this one ends.
  const lastSunday = addDays(weekStart, -1);
  const shown = weekEnd <= last ? weekEnd : rows.get(lastSunday)?.healthspan ? lastSunday : last;
  const hs = rows.get(shown)?.healthspan;
  const h2 = ctx.profile.heightCm ? (ctx.profile.heightCm / 100) ** 2 : null;

  let result: HealthspanVM["result"];
  if (!hs) result = none("no_data");
  else if (hs.reason !== null) result = none("calibrating", Math.max(1, 20 - hs.dataDays));
  else result = ok({ whoopAge: hs.whoopAge, deltaYears: hs.deltaYears, pace: hs.paceOfAging, paceProvisional: hs.paceProvisional, vo2maxSource: hs.vo2maxSource }, hs.provisional);

  const contributions = hs && hs.reason === null ? hs.contributions : [];
  const contributors: HealthspanContributor[] = HS_ORDER.map((key) => {
    const meta = HS_META[key];
    const c = contributions.find((x) => x.key === key);
    const display = (v: number) => (key === "sri" ? Math.max(0, v) : key === "leanMass" && h2 ? v * h2 : v);
    const target = c ? display(c.reference) : 0;
    const caption =
      key === "vo2max" && hs?.reason === null && hs.vo2maxSource
        ? hs.vo2maxSource === "run"
          ? "From runs"
          : "Estimated: counts half"
        : key === "leanMass" && !c
          ? "No lean body mass: add weight and body fat in Fitbit. Left out of Pulse Age."
          : undefined;
    const domain: [number, number] = key === "leanMass" && c ? [target * 0.75, target * 1.25] : meta.domain;
    return {
      key,
      ...meta,
      domain,
      metric: c ? ok(display(c.value), result.provisional) : none("no_data"),
      target,
      years: c ? c.years : null,
      ...(caption && { caption }),
    };
  });

  const history = [];
  for (let k = 25; k >= 0; k--) {
    const d = addDays(weekEnd, -7 * k);
    const r = rows.get(d)?.healthspan;
    if (d <= last) history.push({ day: d, value: r && r.reason === null ? r.whoopAge : null });
  }

  return {
    day,
    weekStart,
    weekEnd,
    nextUpdateInDays: weekEnd > last ? Math.max(0, daysBetween(today, weekEnd)) : 0,
    age: hs && hs.reason === null ? hs.age : ageAt(ctx.profile.birthDate, shown),
    result,
    insight: hs && hs.reason === null ? healthspanInsight(hs.paceOfAging, contributions) : null,
    history,
    contributors,
  };
}

const ageAt = (birth: string, day: string) => daysBetween(birth, day) / 365.2425;

function healthspanInsight(pace: number, cs: HealthspanContribution[]) {
  const title = pace < 0.9 ? "Aging slower" : pace > 1.1 ? "Aging faster" : "Steady and healthy";
  const best = [...cs].sort((a, b) => a.years - b.years)[0];
  const worst = [...cs].sort((a, b) => b.years - a.years)[0];
  const label = (c: HealthspanContribution) => HS_META[c.key].label.toLowerCase();
  const parts = [`Your Pace of Aging is ${pace.toFixed(1)}x against your 6-month average.`];
  if (best && best.years < 0) parts.push(`Your biggest boost is ${label(best)}, worth ${Math.abs(best.years).toFixed(1)} years.`);
  if (worst && worst.years > 0) parts.push(`${HS_META[worst.key].label} adds the most, ${worst.years.toFixed(1)} years.`);
  return { title, body: parts.join(" ") };
}

// ── Health Monitor ──────────────────────────────────────────────────────────

const VITALS: { key: VitalKey; short: string; unit: string; signed?: boolean; pick: (r: DayRow) => number | null | undefined }[] = [
  { key: "resp", short: "Resp", unit: "rpm", pick: (r) => r.metrics?.respBpm },
  { key: "spo2", short: "SpO2", unit: "%", pick: (r) => r.metrics?.spo2Pct },
  { key: "restingHr", short: "RHR", unit: "bpm", pick: (r) => r.sessionRhr },
  { key: "hrv", short: "HRV", unit: "ms", pick: (r) => r.metrics?.hrvMs },
  { key: "skinTempDev", short: "Temp", unit: "°C", signed: true, pick: (r) => r.recovery?.inputs.skinTempDev },
];

const num = (v: number, dp: number, signed = false) => {
  const s = Math.abs(v).toFixed(dp);
  return signed ? `${v >= 0 ? "+" : "−"}${s}` : v < 0 ? `−${s}` : s;
};

/** Health Monitor `/health/monitor` for `day` (spec §7.8). */
export function getMonitor(day: string, ctx: QueryCtx = defaultCtx(), preloaded?: Map<string, DayRow>): MonitorVM {
  const today = todayOf(ctx);
  const isToday = day === today;
  const rows = preloaded?.has(addDays(day, -29)) ? preloaded : loadDays(ctx, addDays(day, -29), day);
  const row = rows.get(day);
  const hm = row?.healthMonitor;
  const vitals: Vital[] = VITALS.map((v) => {
    const reading = hm && hm.reason === null ? hm.vitals.find((x) => x.key === v.key) : undefined;
    const value = row ? v.pick(row) : null;
    const range = reading?.range ?? null;
    const status = reading?.status ?? "no_data";
    let chip: Vital["chip"] = null;
    if (range && finite(value)) {
      // Ranges always show one decimal, so a whole-number reading never looks equal to its bound.
      const lo = num(range.low, 1, v.signed);
      const hi = num(range.high, 1, v.signed);
      if (v.key === "spo2" && status === "low" && value < 95) chip = { tone: "warning", text: "Below 95%" };
      else if (status === "in_range") chip = { tone: "optimal", text: v.key === "spo2" ? `Within ${lo} - 100` : `Within ${lo} - ${hi}` };
      else if (status === "high") chip = { tone: "warning", text: `Elevated, above ${hi}` };
      else if (status === "low") chip = { tone: "warning", text: `Low, below ${lo}` };
    }
    const reason = v.key === "skinTempDev" && row?.metrics?.nightlyTempC != null ? "calibrating" : vitalReason(row, isToday, v.key === "hrv");
    const tags = hm && hm.reason === null && hm.stale.includes(v.key === "restingHr" ? "rhr" : v.key === "skinTempDev" ? "skinTemp" : v.key) ? (["stale_baseline"] as const) : [];
    return {
      key: v.key,
      label: v.key === "skinTempDev" ? "Skin temp (from baseline)" : VITAL_LABEL[v.key],
      short: v.short,
      unit: v.unit,
      metric: finite(value) ? ok(value, false, [...tags]) : none(reason),
      range,
      status,
      chip,
      trend: {
        points: Array.from({ length: 30 }, (_, k) => {
          const d = addDays(day, k - 29);
          const r = rows.get(d);
          const x = r ? v.pick(r) : null;
          return { day: d, value: finite(x) ? x : null };
        }),
        baseline: range && v.key !== "spo2" ? { mean: (range.low + range.high) / 2, sd: (range.high - range.low) / 2 } : null,
      },
    };
  });

  let count: MonitorVM["count"];
  if (!hm) count = none(isToday ? "awaiting_sleep_sync" : "band_not_worn");
  else if (hm.reason !== null) count = none(nightReason(hm.reason, isToday));
  else {
    const raised = illnessRaised(hm);
    count = ok({ inRange: hm.inRange, total: 5, outOfRange: hm.flagged, status: raised ? "illness" : hm.flagged ? "out" : "within" });
  }
  return {
    day,
    isToday,
    count,
    illness: hm && hm.reason === null && illnessRaised(hm) ? { level: hm.illness.level, score: hm.illness.score } : null,
    vitals,
  };
}

// ── Stress Monitor ──────────────────────────────────────────────────────────

/** Stress Monitor `/health/stress` for `day` (spec §7.9). */
export function getStress(day: string, ctx: QueryCtx = defaultCtx()): StressVM {
  const today = todayOf(ctx);
  const isToday = day === today;
  const rows = loadDays(ctx, addDays(day, -29), day);
  const row = rows.get(day);
  const st = row?.stress;
  const gauge = stressNow(row, isToday);
  const start = dayStartOf(ctx, day);
  const sameDays = [7, 14, 21, 28].map((k) => rows.get(addDays(day, -k))?.stress?.highMin).filter(finite);
  const typical = sameDays.length ? meanSd(sameDays).mean : null;

  const spans: Span[] = [];
  const s = row?.sleep;
  if (s?.main) spans.push({ kind: "sleep", label: "Sleep", start: ms(Math.max(s.main.start, start)), end: ms(s.main.end) });
  for (const n of s?.naps ?? []) spans.push({ kind: "nap", label: "Nap", start: ms(n.start), end: ms(n.end) });
  for (const e of exercisesBetween(ctx, day, day)) {
    const k = activityKind(e.type);
    spans.push({ kind: "workout", label: { run: "Run", ride: "Ride", walk: "Walk", strength: "Strength", workout: "Workout" }[k], start: ms(e.startTs), end: ms(e.endTs) });
  }
  const scored = st && st.average != null;
  const empty = row?.s1?.hrCount ? "no_data" : "band_not_worn";

  return {
    day,
    isToday,
    gauge,
    insight: scored ? stressInsight(st, ctx.timeZone) : null,
    chart: scored ? ok({ points: minutePoints(loadSeries(ctx, day, "stress"), start, 2), spans, now: isToday && st.latest ? ms(st.latest.ts) : null }, st.provisional) : none(empty),
    levels: scored
      ? ok({ lowMin: st.lowMin, mediumMin: st.mediumMin, highMin: st.highMin, typicalDeltaMin: typical == null ? null : st.highMin - typical, weekday: WEEKDAY[weekdayOf(day)] }, st.provisional)
      : none(empty),
    trend: {
      points: Array.from({ length: 30 }, (_, k) => {
        const d = addDays(day, k - 29);
        const a = rows.get(d)?.stress?.average;
        return { day: d, value: finite(a) ? a : null };
      }),
    },
  };
}

function stressInsight(st: NonNullable<DayRow["stress"]>, tz: string) {
  const total = st.lowMin + st.mediumMin + st.highMin;
  const top = st.lowMin >= st.mediumMin && st.lowMin >= st.highMin ? "low" : st.mediumMin >= st.highMin ? "medium" : "high";
  const lead = `Most of your time was in ${top} stress.`;
  if (!total) return null;
  if (st.longestHigh && st.longestHigh.minutes >= 10) {
    const at = wall(st.longestHigh.start, tz).time.slice(0, 5);
    return `${lead} Your longest high-stress stretch started at ${at} and lasted ${st.longestHigh.minutes} minutes.`;
  }
  return `${lead} You had no long stretch of high stress.`;
}

// ── Fitness ─────────────────────────────────────────────────────────────────

const ACWR_STATUS = (acwr: number): { status: "detraining" | "optimal" | "pushing" | "high_risk"; tone: ChipTone } =>
  acwr < 0.8
    ? { status: "detraining", tone: "neutral" }
    : acwr <= 1.3
      ? { status: "optimal", tone: "optimal" }
      : acwr <= 1.5
        ? { status: "pushing", tone: "warning" }
        : { status: "high_risk", tone: "alert" };

/** Fitness `/health/fitness`: latest values (spec §7.10). */
export function getFitness(ctx: QueryCtx = defaultCtx()): FitnessVM {
  const today = todayOf(ctx);
  const last = lastStored(ctx, today);
  const rows = loadDays(ctx, addDays(last, -181), last);
  const row = rows.get(last);
  const f = row?.fitness;
  const decade = (age: number) => {
    const lo = Math.min(70, Math.max(20, Math.floor(age / 10) * 10));
    return `${lo}-${lo + 9}`;
  };
  const vo2: FitnessVM["vo2"] =
    f && f.reason === null
      ? ok({ value: f.vo2max, source: f.source, sourceDay: f.sourceDay, percentile: f.percentile, category: f.category, ageBand: decade(f.age), sex: ctx.profile.sex }, f.source === "daily")
      : none("no_data");
  const tl = row?.trainingLoad;
  const effortDays = [...rows.values()].filter((r) => r.s1?.effort != null).length;
  const trainingLoad: Metric<NonNullable<FitnessVM["trainingLoad"]["value"]>> =
    tl?.acwr != null ? ok({ acwr: tl.acwr, ...ACWR_STATUS(tl.acwr) }) : none("calibrating", Math.max(1, 28 - effortDays));
  const load = Array.from({ length: 90 }, (_, k) => {
    const d = addDays(last, k - 89);
    const t = rows.get(d)?.trainingLoad;
    return { day: d, ctl: t?.ctl ?? null, atl: t?.atl ?? null, tsb: t?.tsb ?? null };
  });
  return {
    vo2,
    trend: {
      points: Array.from({ length: 182 }, (_, k) => {
        const d = addDays(last, k - 181);
        const m = rows.get(d)?.metrics;
        const v = m?.vo2maxRun ?? m?.vo2maxDaily;
        return { day: d, value: finite(v) ? v : null };
      }),
    },
    trainingLoad,
    load,
    loadReason: load.some((p) => p.ctl != null) ? null : { reason: "calibrating", nightsLeft: Math.max(1, 28 - (tl?.contiguousDays ?? 0)) },
  };
}
