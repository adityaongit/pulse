import { addDays } from "../time";
import {
  activityItem,
  activityKind,
  type DayRow,
  dayStartOf,
  defaultCtx,
  exercisesBetween,
  finite,
  hrReason,
  loadDays,
  loadSeries,
  maybe,
  meanSd,
  minutePoints,
  ms,
  nightReason,
  none,
  ok,
  type QueryCtx,
  strainMetric,
  todayOf,
  toStrain,
  type ExerciseRow,
} from "./common";
import type { ActivityKind, HrChart, KeyStat, Metric, Span, StrainVM, ZoneRow } from "./types";

const SHORT: Record<ActivityKind, string> = { run: "Run", ride: "Ride", walk: "Walk", strength: "Strength", workout: "Workout" };
const isStrength = (e: ExerciseRow) => activityKind(e.type) === "strength";

/** Strain `/strain` for `day` (spec §7.3). */
export function getStrain(day: string, ctx: QueryCtx = defaultCtx()): StrainVM {
  const today = todayOf(ctx);
  const isToday = day === today;
  const rows = loadDays(ctx, addDays(day, -181), day);
  const row = rows.get(day);
  const strain = strainMetric(row);
  const t = row?.strainTarget;
  const target: StrainVM["target"] =
    !t
      ? none(isToday ? "awaiting_sleep_sync" : "band_not_worn")
      : t.reason !== null
        ? none(nightReason(t.reason, isToday), t.nightsLeft)
        : ok({ low: t.low, high: t.high, estimate: t.coldStart, acwrRule: t.acwrRule });

  const exs = exercisesBetween(ctx, addDays(day, -30), day);
  const strengthMin = (d: string) => exs.filter((e) => e.day === d && isStrength(e)).reduce((a, e) => a + (e.endTs - e.startTs) / 60, 0);
  const zoneMin = (r: DayRow | undefined, from: number, to: number) =>
    r?.s1 && r.s1.hrCount > 0 ? r.s1.zoneSeconds.slice(from, to).reduce((a, b) => a + b, 0) / 60 : null;
  const reason = hrReason(row?.s1 ?? null);
  const stat = (key: string, label: string, pick: (d: string) => number | null, unit: string | undefined): KeyStat => {
    const prior = meanSd(Array.from({ length: 30 }, (_, k) => pick(addDays(day, -k - 1))));
    return { key, label, metric: maybe(pick(day), reason), ...(unit && { unit }), average: prior.mean, ...(prior.sd !== undefined && { sd: prior.sd }), direction: "up" };
  };
  const worn = (d: string) => (rows.get(d)?.s1?.hrCount ?? 0) > 0;
  const summary: KeyStat[] = [
    stat("zones13", "Heart rate zones 1-3", (d) => zoneMin(rows.get(d), 0, 3), "min"),
    stat("zones45", "Heart rate zones 4-5", (d) => zoneMin(rows.get(d), 3, 5), "min"),
    stat("strength", "Strength activity time", (d) => (worn(d) ? strengthMin(d) : null), "min"),
    stat("steps", "Steps", (d) => rows.get(d)?.metrics?.steps ?? null, undefined),
  ];

  const pts = Array.from({ length: 182 }, (_, k) => {
    const d = addDays(day, k - 181);
    const e = rows.get(d)?.s1?.effort;
    return { day: d, value: finite(e) ? toStrain(e) : null };
  });

  return {
    day,
    isToday,
    strain,
    soFar: isToday,
    target,
    summary,
    coach: coach(strain, target, row),
    hr: hrChart(ctx, row, day, isToday),
    zones: zoneRows(row),
    maxHr: row?.s1?.maxHr ?? ctx.profile.maxHr,
    activities: exs.filter((e) => e.day === day).map((e) => activityItem(e, row)),
    trend: { points: pts, target: target.value ? [target.value.low, target.value.high] : null },
  };
}

const fmt1 = (x: number) => x.toFixed(1);

/** Strain Coach copy (spec §7.3), by position against today's target. */
function coach(strain: Metric<number>, target: StrainVM["target"], row: DayRow | undefined): string | null {
  if (strain.value == null || !target.value) return null;
  const { low, high } = target.value;
  const range = `${fmt1(low)} - ${fmt1(high)}`;
  if (row?.recovery?.value != null && row.recovery.value < 34) return `Your body needs rest today. Keep strain between ${range.replace(" - ", " and ")}.`;
  if (strain.value < low) {
    // ponytail: about 8 minutes of moderate activity per strain point near the target; a rough guide, not a model.
    const minutes = Math.max(10, Math.round(((low - strain.value) * 8) / 5) * 5);
    return `Your target today is ${range}. You are at ${fmt1(strain.value)}, so about ${minutes} minutes of moderate activity would put you in range.`;
  }
  if (strain.value <= high) return `You are inside today's target of ${range}. More strain from here adds load faster than benefit.`;
  return "You are past today's target. Prioritise sleep tonight to recover.";
}

export const zoneBounds = (lower: number[]): ZoneRow[] =>
  lower.map((min, i) => ({ zone: i + 1, min: Math.round(min), max: i < 4 ? Math.round(lower[i + 1]) - 1 : null, seconds: 0 }));

export function zoneRows(row: DayRow | undefined, seconds = row?.s1?.zoneSeconds): Metric<ZoneRow[]> {
  const s1 = row?.s1;
  if (!s1 || s1.hrCount === 0 || !seconds) return none(hrReason(s1 ?? null));
  return ok(zoneBounds(s1.zoneLower).map((z, i) => ({ ...z, seconds: Math.round(seconds[i]) })));
}

/** Intraday HR for the day, or for [from, to) unix seconds (an activity window). */
export function hrChart(ctx: QueryCtx, row: DayRow | undefined, day: string, isToday: boolean, from?: number, to?: number): Metric<HrChart> {
  const s1 = row?.s1;
  if (!s1 || s1.hrCount === 0) return none("band_not_worn");
  const start = dayStartOf(ctx, day);
  const series = loadSeries(ctx, day, "hr");
  const fromM = from == null ? 0 : Math.floor((from - start) / 60);
  const toM = to == null ? Infinity : Math.ceil((to - start) / 60);
  const points = minutePoints(series, start, from == null ? 2 : 1, fromM, toM);
  const vals = points.map((p) => p.v).filter(finite);
  if (!vals.length) return none("insufficient_hr_data");
  const lo = Math.floor((Math.min(...vals) - 10) / 10) * 10;
  const hi = Math.ceil((Math.max(...vals) + 10) / 10) * 10;
  const spans: Span[] = [];
  const s = row?.sleep;
  if (s?.main) spans.push({ kind: "sleep", label: "Sleep", start: ms(Math.max(s.main.start, start)), end: ms(s.main.end) });
  for (const n of s?.naps ?? []) spans.push({ kind: "nap", label: "Nap", start: ms(n.start), end: ms(n.end) });
  for (const e of exercisesBetween(ctx, day, day)) spans.push({ kind: "workout", label: SHORT[activityKind(e.type)], start: ms(e.startTs), end: ms(e.endTs) });
  return ok({
    points,
    zones: zoneBounds(s1.zoneLower),
    spans: from == null ? spans : spans.filter((x) => x.end > ms(from) && x.start < ms(to!)),
    now: isToday && from == null && s1.lastHrTs != null ? ms(s1.lastHrTs) : null,
    domain: [lo, hi],
  });
}
