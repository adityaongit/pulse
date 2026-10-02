import { addDays } from "../time";
import {
  ACTIVITY_NAME,
  activityKind,
  defaultCtx,
  exercisesBetween,
  type ExerciseRow,
  hrReason,
  loadDays,
  maybe,
  meanSd,
  ms,
  none,
  ok,
  type QueryCtx,
  todayOf,
  toStrain,
} from "./common";
import { hrChart, zoneRows } from "./strain";
import type { ActivityVM, KeyStat } from "./types";

/** Activity `/activity/[id]` (spec §7.4); null for an unknown id. */
export function getActivity(id: string, ctx: QueryCtx = defaultCtx()): ActivityVM | null {
  const e = ctx.db.$client
    .prepare("select id, day, start_ts startTs, end_ts endTs, type, name, calories from exercises where id = ?")
    .get(id) as ExerciseRow | undefined;
  if (!e) return null;
  const rows = loadDays(ctx, addDays(e.day, -30), e.day);
  const row = rows.get(e.day);
  const a = row?.activities.find((x) => x.id === id);
  const kind = activityKind(e.type);
  const reason = a && a.hrCount > 0 ? "insufficient_hr_data" : hrReason(row?.s1 ?? null);

  // 30-day averages over the same activity kind, before this one.
  const same = exercisesBetween(ctx, addDays(e.day, -30), e.day).filter((x) => x.id !== id && x.startTs < e.startTs && activityKind(x.type) === kind);
  const statOf = (x: ExerciseRow) => rows.get(x.day)?.activities.find((y) => y.id === x.id);
  const tile = (key: string, label: string, v: number | null | undefined, unit: string | undefined, prior: (number | null | undefined)[], r = reason): KeyStat => {
    const { mean, sd } = meanSd(prior);
    return { key, label, metric: maybe(v, r), ...(unit && { unit }), average: mean, ...(sd !== undefined && { sd }), direction: "neutral" };
  };
  const durationMin = (x: ExerciseRow) => (x.endTs - x.startTs) / 60;
  const stats = [
    tile("duration", "Duration", durationMin(e), "min", same.map(durationMin), "no_data"),
    tile("avgHr", "Average heart rate", a?.avgHr, "bpm", same.map((x) => statOf(x)?.avgHr)),
    tile("maxHr", "Max heart rate", a?.maxHr, "bpm", same.map((x) => statOf(x)?.maxHr)),
    tile("calories", "Calories", e.calories, "kcal", same.map((x) => x.calories), "no_data"),
  ];

  const hrr60 = a?.hrr?.after1Minute;
  const hrr: ActivityVM["hrr"] =
    hrr60 == null
      ? none("insufficient_hr_data")
      : ok(hrr60 >= 20 ? { value: hrr60, tone: "optimal", label: "Good" } : hrr60 >= 12 ? { value: hrr60, tone: "neutral", label: "Typical" } : { value: hrr60, tone: "warning", label: "Low" });

  return {
    id,
    day: e.day,
    name: ACTIVITY_NAME[kind],
    kind,
    start: ms(e.startTs),
    end: ms(e.endTs),
    strain: a?.effort != null ? ok(toStrain(a.effort)) : none(reason),
    dayStrain: row?.s1?.effort != null ? toStrain(row.s1.effort) : null,
    stats,
    insight: a && a.hrCount > 0 ? zoneInsight(a.zoneSeconds) : null,
    hr: hrChart(ctx, row, e.day, e.day === todayOf(ctx), e.startTs - 600, e.endTs + 600),
    zones: a ? zoneRows(row, a.zoneSeconds) : none(reason),
    maxHr: row?.s1?.maxHr ?? ctx.profile.maxHr,
    hrr,
  };
}

function zoneInsight(seconds: number[]): string | null {
  const min = seconds.map((s) => Math.round(s / 60));
  const hard = min[3] + min[4];
  const aerobic = min[1] + min[2];
  if (hard >= 10) return `You spent ${hard} minutes in zones 4 and 5, hard work that builds speed and power.`;
  if (aerobic >= 10) return `You spent ${aerobic} minutes in zones 2 and 3, steady aerobic work that builds your base.`;
  if (min[0] >= 10) return `You spent ${min[0]} minutes in zone 1, easy movement that helps you recover.`;
  return null;
}
