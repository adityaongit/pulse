// Own algorithm (docs/algorithms/reports.md): ISO-week (Monday–Sunday) and calendar-month summaries of the
// daily scores, with deltas against the previous period of the same kind.
import { mean } from "../scoring/forecast";
import { acwrSignal, type ReadinessDetail } from "../scoring/readiness";
import { band, type RecoveryBand } from "../scoring/recovery";
import type { TagImpact } from "./journalImpact";

/** One local day of scores; null where the score is not available. U10 maps daily_scores and daily_metrics into it. */
export interface ReportDay {
  day: string;
  /** 0–100 */
  recovery: number | null;
  /** 0–21 */
  strain: number | null;
  /** 0–100 */
  sleepPerf: number | null;
  /** Hours asleep, main sleep plus naps. */
  sleepHours: number | null;
  /** ms */
  hrv: number | null;
  /** bpm */
  rhr: number | null;
  /** Acute:chronic workload ratio on this day. */
  acwr: number | null;
  /** Sleep Regularity display value, 0–100. */
  sleepConsistency: number | null;
}

export const REPORT_METRICS = ["recovery", "strain", "sleepPerf", "sleepHours", "hrv", "rhr"] as const;
export type ReportMetric = (typeof REPORT_METRICS)[number];

export interface Report {
  /** `2026-W40` or `2026-10`. */
  period: string;
  kind: "week" | "month";
  start: string;
  end: string;
  /** The data does not cover the whole period (it is in progress, or history starts inside it). */
  partial: boolean;
  /** Days in the period with a row. */
  days: number;
  averages: Record<ReportMetric, number | null>;
  /** averages − the previous period's averages; null when either side is missing. */
  deltas: Record<ReportMetric, number | null>;
  /** Days in each band; sums to the days with a recovery score. */
  bands: Record<RecoveryBand, number>;
  /** From the period's last day with an ACWR. */
  trainingBalance: { acwr: number; status: ReadinessDetail } | null;
  sleepConsistency: number | null;
  /** Up to 3 tags with a clear recovery effect, largest |Δ| first. */
  topImpacts: TagImpact[];
  best: { day: string; recovery: number } | null;
  worst: { day: string; recovery: number } | null;
}

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const isoDow = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0

/** ISO 8601 week of a day, e.g. `2026-W40`: the week belongs to the year of its Thursday. */
export function isoWeek(day: string): string {
  const thursday = addDays(day, 3 - isoDow(day));
  const year = thursday.slice(0, 4);
  const week = Math.floor((Date.parse(thursday) - Date.parse(`${year}-01-01`)) / (7 * DAY_MS)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** First and last day of `2026-W40` or `2026-10`. */
export function periodBounds(period: string): { start: string; end: string } {
  const w = /^(\d{4})-W(\d{2})$/.exec(period);
  if (w) {
    const jan4 = `${w[1]}-01-04`; // always in week 1
    const start = addDays(jan4, (Number(w[2]) - 1) * 7 - isoDow(jan4));
    return { start, end: addDays(start, 6) };
  }
  const [y, m] = period.split("-").map(Number);
  return { start: `${period}-01`, end: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

const periodOf = (day: string, kind: Report["kind"]) => (kind === "week" ? isoWeek(day) : day.slice(0, 7));

/** Every week and month that has at least one row, oldest first, weeks before months. */
export function reportPeriods(rows: ReportDay[]): string[] {
  const days = rows.map((r) => r.day).sort();
  return [...new Set(days.map((d) => isoWeek(d))), ...new Set(days.map((d) => d.slice(0, 7)))];
}

const averages = (rows: ReportDay[]) =>
  Object.fromEntries(
    REPORT_METRICS.map((m) => {
      const xs = rows.map((r) => r[m]).filter((v): v is number => v != null);
      return [m, xs.length ? mean(xs) : null];
    }),
  ) as Record<ReportMetric, number | null>;

/**
 * The report for `period`. `rows` may hold any days (all history is fine); `impacts` is journalImpact()
 * as of the period's end (or the latest), and only its clear recovery effects are used.
 */
export function buildReport(period: string, rows: ReportDay[], impacts: TagImpact[] = []): Report {
  const kind = period.includes("W") ? "week" : "month";
  const { start, end } = periodBounds(period);
  const sorted = [...rows].sort((a, b) => a.day.localeCompare(b.day));
  const cur = sorted.filter((r) => r.day >= start && r.day <= end);
  const prevPeriod = periodOf(addDays(start, -1), kind);
  const prev = sorted.filter((r) => periodOf(r.day, kind) === prevPeriod);

  const avg = averages(cur);
  const prevAvg = averages(prev);
  const deltas = Object.fromEntries(
    REPORT_METRICS.map((m) => [m, avg[m] != null && prevAvg[m] != null ? avg[m] - prevAvg[m] : null]),
  ) as Record<ReportMetric, number | null>;

  const scored = cur.filter((r): r is ReportDay & { recovery: number } => r.recovery != null);
  const bands: Record<RecoveryBand, number> = { red: 0, yellow: 0, green: 0 };
  for (const r of scored) bands[band(r.recovery)]++;
  // Ties go to the earliest day.
  const best = scored.reduce<(typeof scored)[number] | null>((b, r) => (!b || r.recovery > b.recovery ? r : b), null);
  const worst = scored.reduce<(typeof scored)[number] | null>((w, r) => (!w || r.recovery < w.recovery ? r : w), null);

  const lastAcwr = cur.findLast((r) => r.acwr != null)?.acwr ?? null;
  const consistency = cur.map((r) => r.sleepConsistency).filter((v): v is number => v != null);

  return {
    period,
    kind,
    start,
    end,
    partial: sorted.length === 0 || start < sorted[0].day || end > sorted[sorted.length - 1].day,
    days: cur.length,
    averages: avg,
    deltas,
    bands,
    trainingBalance: lastAcwr == null ? null : { acwr: lastAcwr, status: acwrSignal(lastAcwr, 0, 0).detail },
    sleepConsistency: consistency.length ? mean(consistency) : null,
    topImpacts: impacts
      .filter((t) => t.effects.recovery.label === "positive" || t.effects.recovery.label === "negative")
      .sort((a, b) => Math.abs(b.effects.recovery.delta!) - Math.abs(a.effects.recovery.delta!))
      .slice(0, 3),
    best: best && { day: best.day, recovery: best.recovery },
    worst: worst && { day: worst.day, recovery: worst.recovery },
  };
}
