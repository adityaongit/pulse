// View-model → kit-prop mappers shared by the half-A screens (Home, Recovery, Strain, Activity, Sleep).
import { Activity, BatteryCharging, CalendarCheck, ChartNoAxesColumn, Droplet, Dumbbell, Footprints, Heart, HeartPulse, Hourglass, Moon, Thermometer, Wind, Zap } from "lucide-react"
import type { EnergySeries } from "@/components/charts/EnergyBankChart"
import type { HrSeries } from "@/components/charts/IntradayHrChart"
import type { TrendPoint } from "@/components/charts/TrendChart"
import type { KeyStatRowProps } from "@/components/metrics/KeyStatRow"
import type { FormatKey } from "@/lib/format"
import { dayHref, RANGE_DAYS, type TrendRange } from "@/lib/url"
import type { EnergyBankVM, HrChart, KeyStat, Metric, Trend } from "@/server/queries/types"

export { CAPTION, LABEL } from "@/components/metrics/primitives"
/** The inset legend strip under a summary card (spec §7.2, §7.3, §7.5). */
export const LEGEND = "mt-1 mb-3 rounded-lg bg-inset px-3 py-2 text-xs leading-4 font-medium text-foreground-secondary"

/** Maps a metric's value, keeping its reason and tags. */
export const mapMetric = <A, B>(m: Metric<A>, f: (a: A) => B): Metric<B> =>
  ({ ...m, value: m.value === null ? null : f(m.value) })

const FORMAT_BY_UNIT: Record<string, FormatKey> = { ms: "int", bpm: "int", rpm: "decimal1", "%": "int", kcal: "grouped", "°C": "signed1", min: "duration" }

export const STAT_ICON: Record<string, React.ReactNode> = {
  hrv: <Activity />,
  rhr: <Heart />,
  avgHr: <Heart />,
  maxHr: <HeartPulse />,
  resp: <Wind />,
  sleep: <Moon />,
  calories: <Zap />,
  steps: <Footprints />,
  spo2: <Droplet />,
  skin: <Thermometer />,
  zones13: <HeartPulse />,
  zones45: <HeartPulse />,
  strength: <Dumbbell />,
  // Sleep summary rows carry an icon each, as WHOOP's do [latest-sleep-1] (spec §11 F20).
  hours: <Hourglass />,
  consistency: <CalendarCheck />,
  efficiency: <ChartNoAxesColumn />,
  restorative: <BatteryCharging />,
}

/**
 * KeyStat → KeyStatRow props. Minutes render as h:mm with no unit; unitless counts are grouped.
 * `link` adds `?d=` to the stat's detail route.
 */
export function statProps(s: KeyStat, link?: { d: string; today: string }, icons = true): Omit<KeyStatRowProps, "variant"> {
  return {
    label: s.label,
    icon: icons ? STAT_ICON[s.key] : undefined,
    metric: s.metric,
    unit: s.unit === "min" ? undefined : s.unit,
    format: s.unit ? (FORMAT_BY_UNIT[s.unit] ?? "decimal1") : "grouped",
    average: s.average,
    sd: s.sd,
    direction: s.direction,
    status: s.status,
    chip: s.chip,
    caption: s.caption,
    href: s.href && link ? dayHref(s.href, link.d, link.today) : undefined,
  }
}

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Trend → TrendChart data, plus each range's average against the range before it. */
export function trendProps(t: Trend) {
  const pts: TrendPoint[] = t.points.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional }))
  const deltas: Partial<Record<TrendRange, number | null>> = {}
  for (const r of ["w", "m"] as const) {
    const n = RANGE_DAYS[r]
    const now = mean(pts.slice(-n).map((p) => p.value))
    const prior = mean(pts.slice(-2 * n, -n).map((p) => p.value))
    deltas[r] = now === null || prior === null ? null : Math.round((now - prior) * 10) / 10
  }
  return { data: { value: pts, reason: null, provisional: false } satisfies Metric<TrendPoint[]>, deltas, baseline: t.baseline, target: t.target }
}

/** HrChart → IntradayHrChart series. Naps draw as sleep spans; the open top zone ends at max HR. */
export const hrSeries = (m: Metric<HrChart>, maxHr: number): Metric<HrSeries> =>
  mapMetric(m, (h) => ({
    points: h.points.map((p) => ({ t: p.t, bpm: p.v })),
    zones: h.zones.map((z) => ({ zone: z.zone, min: z.min, max: z.max ?? maxHr })),
    spans: h.spans.map((s) => ({ kind: s.kind === "workout" ? "workout" : "sleep", label: s.label, start: s.start, end: s.end })),
    now: h.now ?? undefined,
  }))

/** Drains closer than this to a bigger one are left unlabelled on the chart, so labels never overlap. */
const DRAIN_GAP_MS = 90 * 60_000

export function energySeries(e: EnergyBankVM): EnergySeries {
  const drains: NonNullable<EnergySeries["drains"]> = []
  for (const d of [...e.drains].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)))
    if (drains.every((k) => Math.abs(k.t - d.start) >= DRAIN_GAP_MS)) drains.push({ t: d.start, amount: Math.abs(d.amount), label: d.label })
  return { points: e.curve.map((p) => ({ t: p.t, value: p.v })), drains, naps: e.naps }
}
