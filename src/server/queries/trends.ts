// Trends `/trends?metric=&r=` (More): one daily metric over up to a year, with each range's average against
// the range before it. The same metric table feeds the daily-scores export (src/app/export/daily).
import type { GoodDirection } from "@/lib/bands";
import type { FormatKey } from "@/lib/format";
import { RANGE_DAYS, RANGES, type TrendRange } from "@/lib/url";
import { addDays } from "../time";
import { type DayRow, defaultCtx, finite, loadDays, none, ok, type QueryCtx, todayOf, toStrain } from "./common";
import type { DayPoint, Metric } from "./types";

export type TrendMetricKey = "recovery" | "strain" | "sleep" | "hours" | "consistency" | "hrv" | "rhr" | "resp" | "stress" | "steps";

export type TrendMetric = {
  key: TrendMetricKey;
  label: string;
  unit?: string;
  format: FormatKey;
  colorBy: "band" | "strain" | "sleep" | "single" | "stress";
  direction: GoodDirection;
  /** The metric's own screen. */
  href: string;
  /** Column name in the daily export. */
  column: string;
  pick: (r: DayRow) => number | null | undefined;
  provisional?: (r: DayRow) => boolean;
  /** Accrues through the day (Strain, steps): today is a gap, not a low bar. */
  partialToday?: boolean;
};

export const TREND_METRICS: readonly TrendMetric[] = [
  { key: "recovery", label: "Recovery", unit: "%", format: "int", colorBy: "band", direction: "up", href: "/recovery", column: "recovery_pct", pick: (r) => r.recovery?.value, provisional: (r) => !!r.recovery?.provisional },
  { key: "strain", label: "Strain", format: "decimal1", colorBy: "strain", direction: "neutral", href: "/strain", column: "strain", pick: (r) => (finite(r.s1?.effort) ? toStrain(r.s1.effort) : null), partialToday: true },
  { key: "sleep", label: "Sleep performance", unit: "%", format: "int", colorBy: "sleep", direction: "up", href: "/sleep", column: "sleep_performance_pct", pick: (r) => r.sleep?.performance },
  { key: "hours", label: "Hours of sleep", format: "duration", colorBy: "sleep", direction: "up", href: "/sleep", column: "sleep_minutes", pick: (r) => r.sleep?.main?.asleepMin },
  { key: "consistency", label: "Sleep consistency", unit: "%", format: "int", colorBy: "sleep", direction: "up", href: "/sleep", column: "sleep_consistency_pct", pick: (r) => r.sleep?.consistency },
  { key: "hrv", label: "Heart rate variability", unit: "ms", format: "int", colorBy: "single", direction: "up", href: "/recovery", column: "hrv_ms", pick: (r) => r.metrics?.hrvMs },
  { key: "rhr", label: "Resting heart rate", unit: "bpm", format: "int", colorBy: "single", direction: "down", href: "/recovery", column: "resting_hr_bpm", pick: (r) => r.metrics?.rhrBpm },
  { key: "resp", label: "Respiratory rate", unit: "rpm", format: "decimal1", colorBy: "single", direction: "neutral", href: "/health/monitor", column: "respiratory_rate_rpm", pick: (r) => r.metrics?.respBpm },
  { key: "stress", label: "Stress", format: "decimal1", colorBy: "stress", direction: "down", href: "/health/stress", column: "stress_avg", pick: (r) => r.stress?.average, provisional: (r) => !!r.stress?.provisional, partialToday: true },
  { key: "steps", label: "Steps", format: "grouped", colorBy: "single", direction: "up", href: "/strain", column: "steps", pick: (r) => r.metrics?.steps, partialToday: true },
];

export const parseTrendMetric = (raw: string | string[] | undefined): TrendMetric => {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return TREND_METRICS.find((m) => m.key === v) ?? TREND_METRICS[0];
};

/** The longest range, and the days the chart gets. */
const SPAN = RANGE_DAYS["1y"];

export type TrendsVM = {
  metric: TrendMetricKey;
  /** 365 days ending today, oldest first; a reason when there is nothing to draw yet. */
  points: Metric<DayPoint[]>;
  /** Per range: the average and the average of the range before it (null where a range has no values). */
  periods: { range: TrendRange; average: Metric<number>; prior: number | null }[];
};

const mean = (xs: (number | null)[]) => {
  const v = xs.filter(finite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Why a metric has nothing to show yet: Recovery calibrates for its first nights, the rest just have no data. */
function emptyReason(m: TrendMetric, rows: Map<string, DayRow>, today: string): Metric<DayPoint[]> {
  const r = rows.get(today)?.recovery ?? rows.get(addDays(today, -1))?.recovery;
  if (m.key === "recovery" && r?.reason === "calibrating") return none("calibrating", r.nightsLeft);
  return none("no_data");
}

export function getTrends(metric: TrendMetricKey, ctx: QueryCtx = defaultCtx()): TrendsVM {
  const m = TREND_METRICS.find((x) => x.key === metric) ?? TREND_METRICS[0];
  const today = todayOf(ctx);
  // Two years: the 1Y average needs the year before it.
  const from = addDays(today, -(2 * SPAN - 1));
  const rows = loadDays(ctx, from, today);
  const all: DayPoint[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const r = rows.get(d)!;
    const v = m.partialToday && d === today ? null : m.pick(r);
    all.push({ day: d, value: finite(v) ? v : null, ...(m.provisional?.(r) && { provisional: true }) });
  }
  const shown = all.slice(-SPAN);
  const periods = RANGES.map((range) => {
    const n = RANGE_DAYS[range];
    const avg = mean(all.slice(-n).map((p) => p.value));
    return { range, average: avg === null ? none<number>("no_data") : ok(avg), prior: mean(all.slice(-2 * n, -n).map((p) => p.value)) };
  });
  return {
    metric: m.key,
    points: shown.some((p) => p.value !== null) ? ok(shown) : emptyReason(m, rows, today),
    periods,
  };
}
