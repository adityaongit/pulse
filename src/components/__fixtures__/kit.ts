// Typed fixture view models for the dev gallery (/dev/kit). The shapes are the component props
// U10's view models must match; icons are added by the page, never by the view model.

import type { ContributorRowProps } from "@/components/metrics/ContributorRow"
import type { DriverItem } from "@/components/metrics/DriverList"
import type { KeyStatRowProps, SleepStatus } from "@/components/metrics/KeyStatRow"
import type { DayStripDay } from "@/components/metrics/DayStrip"
import type { StackedSegment, ZoneRow } from "@/components/charts/ZoneBars"
import type { TrendPoint } from "@/components/charts/TrendChart"
import type { HypnogramNight } from "@/components/charts/Hypnogram"
import type { HrSeries } from "@/components/charts/IntradayHrChart"
import type { EnergySeries } from "@/components/charts/EnergyBankChart"
import type { StressSeries } from "@/components/charts/StressChart"
import type { SleepHr } from "@/components/charts/SleepHrChart"
import type { StrainRecoveryPoint } from "@/components/charts/StrainRecoveryChart"
import type { SleepHours, SleepStagesNight } from "@/components/metrics/SleepStages"
import type { ShellStatus } from "@/components/shells/ShellStatus"
import type { Metric, MetricTag, ReasonCode } from "@/lib/reasons"
import { addDays } from "@/lib/url"

export const TODAY = "2026-10-02"
export const TZ = "Asia/Kolkata"
const MIN = 60_000
const HOUR = 60 * MIN
/** 00:00 on TODAY in Asia/Kolkata. */
export const DAY0 = Date.UTC(2026, 9, 1, 18, 30)

/** Deterministic noise in [0, 1) so server and client render the same fixture. */
const noise = (i: number) => {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const ok = <T>(value: T, extra: { provisional?: boolean; tags?: MetricTag[] } = {}): Metric<T> => ({
  value,
  reason: null,
  provisional: extra.provisional ?? false,
  tags: extra.tags,
})
export const why = <T>(reason: ReasonCode, nightsLeft?: number): Metric<T> => ({ value: null, reason, provisional: false, nightsLeft })

// --- Shell ---

export const status: ShellStatus = {
  mode: "demo",
  sync: { state: "ok", lastSuccessAt: DAY0 + 9 * HOUR + 42 * MIN },
  connection: "connected",
  today: TODAY,
  firstDay: addDays(TODAY, -179),
  timeZone: TZ,
}
export const googleStatuses: { name: string; status: ShellStatus }[] = [
  { name: "Not connected", status: { ...status, mode: "google", connection: "not_connected", sync: { state: "error", lastSuccessAt: null } } },
  { name: "Importing", status: { ...status, mode: "google", connection: "importing", importProgress: { done: 42, total: 180 }, sync: { state: "syncing", lastSuccessAt: null } } },
  { name: "Auth revoked", status: { ...status, mode: "google", connection: "auth_revoked", sync: { state: "error", lastSuccessAt: DAY0 - 20 * HOUR } } },
  { name: "Stale", status: { ...status, mode: "google", connection: "stale", sync: { state: "stale", lastSuccessAt: DAY0 + 6 * HOUR } } },
  { name: "Connected", status: { ...status, mode: "google" } },
]

// --- Trends (182 days ending today) ---

const days = Array.from({ length: 182 }, (_, i) => addDays(TODAY, i - 181))
const series = (f: (i: number) => number | null, provisionalFrom = 182): TrendPoint[] =>
  days.map((date, i) => ({ date, value: f(i), provisional: i < 14 || i >= provisionalFrom }))

export const recoveryTrend = series((i) => (i % 23 === 5 ? null : Math.round(30 + noise(i) * 60 + Math.sin(i / 9) * 8)))
export const strainTrend = series((i) => Math.round((6 + noise(i + 3) * 12) * 10) / 10)
export const sleepDebtTrend = series((i) => (i % 31 === 7 ? null : Math.round(noise(i + 9) * 3 * 10) / 10))
export const stressTrend = series((i) => Math.round(noise(i + 17) * 2.6 * 10) / 10)
export const emptyTrend = series(() => null)

// --- Day strip ---

export const stripDays: DayStripDay[] = days.slice(-30).map((date, i) => ({
  date,
  recovery: recoveryTrend[152 + i].value,
  done: noise(i + 40) > 0.35,
}))

// --- Key statistics (Home, in order) ---

type Keyed<T> = T & { key: string }
type StatFixture = Keyed<Omit<KeyStatRowProps, "variant">>
type RecoveryContributor = Keyed<Omit<Extract<ContributorRowProps, { variant: "recovery" }>, "variant">>
type HealthspanContributor = Keyed<Omit<Extract<ContributorRowProps, { variant: "healthspan" }>, "variant">>

export const keyStats = [
  { key: "hrv", label: "Heart rate variability", metric: ok(124), unit: "ms", format: "int", average: 98, sd: 11, direction: "up" },
  { key: "rhr", label: "Resting heart rate", metric: ok(49), unit: "bpm", format: "int", average: 52, sd: 2, direction: "down" },
  { key: "rr", label: "Respiratory rate", metric: ok(14.5), unit: "rpm", format: "decimal1", average: 14.1, sd: 0.3, direction: "neutral" },
  { key: "sleep", label: "Sleep performance", metric: ok(84, { provisional: true }), unit: "%", format: "int", average: 79, sd: 6, direction: "up" },
  { key: "cal", label: "Calories", metric: ok(2214), unit: "kcal", format: "grouped", average: 2390, sd: 180, direction: "neutral" },
  { key: "steps", label: "Steps", metric: ok(12459), format: "grouped", average: 9020, sd: 1800, direction: "up" },
  { key: "spo2", label: "Blood oxygen", metric: why<number>("band_not_worn"), unit: "%", format: "int", average: 97, direction: "up" },
  { key: "temp", label: "Skin temperature", metric: ok(0.2, { tags: ["updated"] }), unit: "°C", format: "signed1", average: 0.5, sd: 0.2, direction: "toward_zero" },
] satisfies StatFixture[]

export const sleepRows = [
  { key: "hours", label: "Hours vs. needed", metric: ok(74), status: "sufficient" },
  { key: "consistency", label: "Sleep consistency", metric: ok(45), status: "poor" },
  { key: "efficiency", label: "Sleep efficiency", metric: ok(98), status: "optimal" },
  { key: "restorative", label: "Restorative sleep", metric: why<number>("awaiting_sleep_sync"), status: "optimal" },
] satisfies { key: string; label: string; metric: Metric<number>; status: SleepStatus }[]

export const vitals = [
  { key: "rr", label: "Respiratory rate", metric: ok(16.8), unit: "rpm", format: "decimal1", chip: { tone: "optimal", text: "within 16.1 - 16.9" } },
  { key: "spo2", label: "Blood oxygen", metric: ok(92), unit: "%", format: "int", chip: { tone: "warning", text: "below 95 - 100" } },
  { key: "rhr", label: "Resting heart rate", metric: ok(58, { provisional: true }), unit: "bpm", format: "int", chip: { tone: "alert", text: "above 50 - 54" } },
  { key: "hrv", label: "Heart rate variability", metric: why<number>("no_hrv_last_night"), unit: "ms", format: "int" },
  { key: "temp", label: "Skin temp (from baseline)", metric: ok(-0.6), unit: "°C", format: "signed1", chip: { tone: "neutral", text: "low < −0.4" } },
] satisfies Keyed<Omit<KeyStatRowProps, "variant" | "direction">>[]

export const activityTiles = [
  { key: "max", label: "Max HR", metric: ok(167), unit: "bpm", format: "int", average: 151, direction: "neutral" },
  { key: "dur", label: "Duration", metric: ok(164), unit: "", format: "duration", average: 91, direction: "neutral" },
] satisfies StatFixture[]

// --- Recovery contributors ---

export const contributors = [
  { key: "hrv", label: "Heart rate variability", metric: ok(124), unit: "ms", format: "int", baseline: { mean: 98, sd: 11 }, points: 9, direction: "up" },
  { key: "rhr", label: "Resting heart rate", metric: ok(53), unit: "bpm", format: "int", baseline: { mean: 49, sd: 2 }, points: -4, direction: "down" },
  { key: "rr", label: "Respiratory rate", metric: ok(14.5), unit: "rpm", format: "decimal1", baseline: { mean: 14.4, sd: 0.4 }, points: 0, direction: "neutral" },
  { key: "sleep", label: "Sleep performance", metric: ok(84, { provisional: true }), unit: "%", format: "int", baseline: { mean: 78, sd: 7 }, points: 2, direction: "up" },
  { key: "temp", label: "Skin temperature", metric: why<number>("band_not_worn"), unit: "°C", format: "signed1", baseline: { mean: 0, sd: 0.3 }, points: null, direction: "toward_zero" },
] satisfies RecoveryContributor[]

export const healthspan = [
  { key: "vo2", label: "VO2 max", metric: ok(58), unit: "ml/kg/min", format: "int", domain: [15, 70], recent: 55, years: -5.3, higherIsBetter: true },
  { key: "rhr", label: "Resting heart rate", metric: ok(47.3), unit: "bpm", format: "decimal1", domain: [35, 100], recent: 49, years: -0.7, higherIsBetter: false },
  { key: "lean", label: "Lean body mass", metric: why<number>("no_data"), unit: "%", format: "int", domain: [50, 90], recent: null, years: null, higherIsBetter: true },
] satisfies HealthspanContributor[]

// --- Drivers ---

export const recoveryDrivers = ok<DriverItem[]>([
  { key: "hrv", label: "HRV above baseline", delta: 12 },
  { key: "sleep", label: "Sleep performance", delta: 5 },
  { key: "rr", label: "Respiratory rate", delta: 0, effect: "none" },
  { key: "rhr", label: "Resting HR up", delta: -4 },
])
export const impactDrivers = ok<DriverItem[]>(
  [
    { key: "stretching", label: "Stretching", delta: 9, yes: 21, no: 45, ci: [3, 14] },
    { key: "meditation", label: "Meditation", delta: 2, effect: "none", yes: 9, no: 57, ci: [-3, 6] },
    { key: "caffeine", label: "Late caffeine", delta: -6, yes: 18, no: 48, ci: [-11, -1] },
    { key: "alcohol", label: "Alcohol", delta: -12, yes: 14, no: 52, ci: [-19, -5] },
  ],
  { provisional: true },
)

// --- Intraday ---

export const hrDay: HrSeries = {
  points: Array.from({ length: 15 * 60 / 5 }, (_, i) => {
    const t = DAY0 + 30 * MIN + i * 5 * MIN
    const h = (t - DAY0) / HOUR
    if (h > 13.2 && h < 13.6) return { t, bpm: null } // band off
    const base = h < 7 ? 52 : 68
    const run = h > 11.25 && h < 12.25 ? 85 : 0
    return { t, bpm: Math.round(base + run + noise(i) * 14) }
  }),
  // Five zones on heart-rate reserve for resting 56 and max 186 (reserve 130): 56 + 50/60/70/80/90% of 130.
  zones: [
    { zone: 1, label: "Zone 1", min: 121, max: 133 },
    { zone: 2, label: "Zone 2", min: 134, max: 146 },
    { zone: 3, label: "Zone 3", min: 147, max: 159 },
    { zone: 4, label: "Zone 4", min: 160, max: 172 },
    { zone: 5, label: "Zone 5", min: 173, max: 186 },
  ],
  spans: [
    { kind: "sleep", start: DAY0 + 51 * MIN, end: DAY0 + 7 * HOUR + 38 * MIN, label: "Sleep" },
    { kind: "workout", start: DAY0 + 11 * HOUR + 16 * MIN, end: DAY0 + 12 * HOUR + 14 * MIN, label: "Run" },
  ],
  now: DAY0 + 15 * HOUR + 5 * MIN,
}
export const hrActivity: HrSeries = {
  points: Array.from({ length: 58 }, (_, i) => ({ t: DAY0 + 11 * HOUR + 16 * MIN + i * MIN, bpm: Math.round(118 + Math.sin(i / 6) * 22 + noise(i + 5) * 10 + Math.min(i, 10) * 2) })),
  zones: hrDay.zones,
}

export const zones: ZoneRow[] = [
  { zone: 5, label: "Zone 5", min: 173, max: null, seconds: 61, typical: { low: 0, high: 0.06 } },
  { zone: 4, label: "Zone 4", min: 160, max: 172, seconds: 840, typical: { low: 0.04, high: 0.12 } },
  { zone: 3, label: "Zone 3", min: 147, max: 159, seconds: 1360, typical: { low: 0.13, high: 0.21 } },
  { zone: 2, label: "Zone 2", min: 134, max: 146, seconds: 2108, typical: { low: 0.21, high: 0.29 } },
  { zone: 1, label: "Zone 1", min: 121, max: 133, seconds: 5371, typical: { low: 0.44, high: 0.52 } },
  { zone: 0, label: "Zone 0", min: 0, max: 120, seconds: 3600, typical: { low: 0.26, high: 0.34 } },
]
export const recoveryBreakdown: StackedSegment[] = [
  { key: "green", label: "Green (67-100%)", count: 4, color: "recovery-green" },
  { key: "yellow", label: "Yellow (34-66%)", count: 2, color: "recovery-yellow" },
  { key: "red", label: "Red (0-33%)", count: 1, color: "recovery-red" },
]
export const stressMinutes: StackedSegment[] = [
  { key: "low", label: "Low (0.0-0.9)", count: 412, color: "stress-low" },
  { key: "medium", label: "Medium (1.0-1.9)", count: 233, color: "stress-medium" },
  { key: "high", label: "High (2.0-3.0)", count: 38, color: "stress-high" },
]

export const night: HypnogramNight = (() => {
  const bed = DAY0 - 72 * MIN // 22:48
  const plan: [HypnogramNight["segments"][number]["stage"], number][] = [
    ["awake", 6], ["light", 24], ["deep", 38], ["light", 20], ["rem", 22], ["awake", 3], ["light", 31], ["deep", 26], ["rem", 34],
    ["light", 40], ["awake", 4], ["rem", 37], ["light", 45], ["rem", 28], ["light", 25], ["awake", 10],
  ]
  let t = bed
  const segments = plan.map(([stage, min]) => {
    const s = { stage, start: t, end: t + min * MIN }
    t = s.end
    return s
  })
  return { bed, wake: t, segments }
})()

export const energy: EnergySeries = {
  points: Array.from({ length: 101 }, (_, i) => {
    const t = DAY0 + 6 * HOUR + 40 * MIN + i * 5 * MIN
    const v = 81 + 4 * Math.sin(i / 7) - (i > 4 ? 18 : (i * 18) / 4) - Math.max(0, i - 50) * 0.55
    return { t, value: Math.round(Math.max(5, v) * 10) / 10 }
  }),
  drains: [
    { t: DAY0 + 7 * HOUR + 2 * MIN, amount: 18, label: "Run" },
    { t: DAY0 + 10 * HOUR + 30 * MIN, amount: 9, label: "Stress" },
    { t: DAY0 + 13 * HOUR + 50 * MIN, amount: 4, label: "Commute" },
    { t: DAY0 + 12 * HOUR, amount: 2, label: "Walk" },
  ],
  naps: [{ start: DAY0 + 12 * HOUR + 30 * MIN, end: DAY0 + 13 * HOUR }],
}

export const stress: StressSeries = {
  points: Array.from({ length: 145 }, (_, i) => {
    const t = DAY0 + 3 * HOUR + i * 5 * MIN
    const h = (t - DAY0) / HOUR
    if (h > 7.4 && h < 8.3) return { t, value: null } // a run: movement minutes are not scored
    const v = h < 7 ? 0.4 + noise(i) * 0.4 : h > 13.5 && h < 14.5 ? 2.2 + noise(i) * 0.5 : 1.2 + noise(i) * 0.6
    return { t, value: Math.round(v * 100) / 100 }
  }),
  spans: [
    { kind: "sleep", start: DAY0 + 3 * HOUR, end: DAY0 + 7 * HOUR, label: "Sleep" },
    { kind: "workout", start: DAY0 + 7 * HOUR + 24 * MIN, end: DAY0 + 8 * HOUR + 18 * MIN, label: "Run" },
  ],
  now: DAY0 + 15 * HOUR + 5 * MIN,
}

// --- Timeline ---

export const timeline = {
  sleep: { kind: "sleep" as const, minutes: 389, start: DAY0 + 51 * MIN, end: DAY0 + 7 * HOUR + 38 * MIN, href: "/sleep" },
  nap: { kind: "nap" as const, minutes: 26, start: DAY0 + 13 * HOUR + 5 * MIN, end: DAY0 + 13 * HOUR + 31 * MIN, href: "/sleep" },
  run: { name: "Running", kind: "run" as const, strain: ok(10.3), start: DAY0 + 11 * HOUR + 16 * MIN, end: DAY0 + 12 * HOUR + 14 * MIN, distanceKm: 10.47, paceS: 332, href: "/activity/run-1" },
  strength: { name: "Strength training", kind: "strength" as const, strain: why<number>("insufficient_hr_data"), start: DAY0 + 18 * HOUR, end: DAY0 + 18 * HOUR + 45 * MIN, href: "/activity/str-1" },
}

export const insight = {
  title: "Steady and healthy",
  body: "Your HRV is above your baseline while resting heart rate and sleep are typical, which lifted Recovery today.",
  action: { label: "See what shaped it", href: "#drivers" },
}

// --- Catalogue additions (/dev/kit: SleepStages, SleepHrChart, StrainRecoveryChart) ---

export const sleepHours = ok<SleepHours>({ asleepMin: 400, average: 412, sd: 28 })
const STAGE_TYPICAL = { awake: [5, 15], light: [45, 60], deep: [12, 22], rem: [18, 28] } as const
const STAGE_LABEL = { awake: "Awake", light: "Light", deep: "Deep", rem: "REM" } as const
export const sleepStagesNight: SleepStagesNight = {
  ...night,
  rows: (["awake", "light", "deep", "rem"] as const).map((stage) => {
    const minutes = night.segments.filter((s) => s.stage === stage).reduce((a, s) => a + (s.end - s.start) / MIN, 0)
    const pct = Math.round((minutes / ((night.wake - night.bed) / MIN)) * 100)
    return { stage, label: STAGE_LABEL[stage], pct, minutes, typical: [...STAGE_TYPICAL[stage]] as [number, number] }
  }),
}
export const sleepHr: SleepHr = {
  bed: night.bed,
  wake: night.wake,
  points: Array.from({ length: Math.round((night.wake - night.bed) / MIN) + 30 }, (_, i) => {
    const t = night.bed - 15 * MIN + i * MIN
    if (i > 200 && i < 214) return { t, v: null } // a gap stays a gap
    return { t, v: Math.round(54 - Math.sin((i / 470) * Math.PI) * 8 + noise(i + 60) * 5) }
  }),
}
export const strainRecoveryWeek: StrainRecoveryPoint[] = days.slice(-7).map((day, i) => ({
  day,
  strain: i === 4 ? null : strainTrend[175 + i].value,
  recovery: i === 2 ? null : recoveryTrend[175 + i].value,
}))
