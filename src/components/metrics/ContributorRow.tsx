import Link from "next/link"
import { Triangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { deltaTone, type GoodDirection, type Tone } from "@/lib/bands"
import { formatValue, isSymbolUnit, MISSING, spoken, type FormatKey } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { SkeletonText } from "@/components/ui/skeleton"
import { MetricState, type MetricMeta } from "@/components/shells/MetricState"
import { CAPTION, LABEL, MetricTags, ValueUnit } from "./primitives"

type Common = {
  icon?: React.ReactNode
  label: string
  metric: Metric<number> | null | undefined
  unit?: string
  format: FormatKey
  reasonCopy?: string
  className?: string
}

export type ContributorRowProps =
  | (Common & {
      variant: "recovery"
      href?: string
      /** The personal normal: mean ± 1 σ is shaded, the track spans mean ± 3 σ. */
      baseline: { mean: number; sd: number }
      points: number | null
      direction: GoodDirection
    })
  | (Common & {
      variant: "healthspan"
      /** `metric` is the 6-month mean; this is the 30-day mean, null when unknown. */
      recent: number | null
      domain: [number, number]
      /** Years this input adds (positive, older) or removes (negative, younger). */
      years: number | null
      higherIsBetter: boolean
    })

const pct = (v: number, lo: number, hi: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
const MARKER: Record<Tone, string> = { good: "bg-optimal", bad: "bg-warning", neutral: "bg-foreground" }

function Header({ p, value, right }: { p: Common; value: number | null; right?: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      {p.icon && <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]">{p.icon}</span>}
        {/* Long labels must wrap because tracked capitals can exceed narrow phone widths. */}
      <span className={cn(LABEL, "min-w-0 flex-1 text-balance")}>{p.label}</span>
      <span className="flex shrink-0 items-center gap-2">
        <ValueUnit
          value={formatValue(p.format, value)}
          unit={p.unit}
          className={cn("font-numeric text-xl leading-6 font-bold", value === null && "text-muted-foreground")}
        />
        {right}
      </span>
    </span>
  )
}

function RecoveryRow({ p, value, meta }: { p: Extract<ContributorRowProps, { variant: "recovery" }>; value: number | null; meta?: MetricMeta }) {
  const { mean, sd } = p.baseline
  const lo = mean - 3 * sd
  const hi = mean + 3 * sd
  const tone = value === null ? "neutral" : deltaTone(p.direction, value, mean, sd).tone
  const pts = value === null ? null : p.points
  const unitSpoken = (v: number) => spoken(formatValue(p.format, v), p.unit)
  const sentence =
    value === null
      ? `${p.label}: ${p.reasonCopy ?? "Not measured: left out of today’s score"}`
      : `${p.label} ${unitSpoken(value)}, ${value > mean + sd ? "above" : value < mean - sd ? "below" : "within"} your normal range of ${formatValue(p.format, mean - sd)} to ${formatValue(p.format, mean + sd)}${pts === null ? "" : pts === 0 ? ", no change" : `, ${pts > 0 ? "added" : "took off"} ${Math.abs(Math.round(pts))} points`}`
  const body = (
    <div className="space-y-2">
      <span className="sr-only">{sentence}</span>
      <div aria-hidden className="space-y-2">
        <Header
          p={p}
          value={value}
          right={
            pts !== null && (
              <span className="inline-flex items-baseline">
                <span className={cn("font-numeric text-base font-bold tabular-nums", pts > 0 ? "text-optimal" : pts < 0 ? "text-warning" : "text-muted-foreground")}>
                  {formatValue("signedInt", pts)}
                </span>
                <span className="ml-1 text-[13px] leading-4 font-semibold text-foreground-secondary">pts</span>
              </span>
            )
          }
        />
        <div className="relative h-1.5 rounded-full bg-dial-track">
          <div className="absolute inset-y-0 rounded-full bg-foreground/20" style={{ left: pct(mean - sd, lo, hi), width: `${(100 * 2) / 6}%` }} />
          {value !== null && (
            <div
              className={cn("absolute top-1/2 size-2.5 -translate-1/2 rounded-full ring-2 ring-card", MARKER[tone])}
              style={{ left: pct(value, lo, hi) }}
            />
          )}
        </div>
        <p className={cn(CAPTION, "flex flex-wrap items-center gap-2")}>
          {value === null
            ? (p.reasonCopy ?? "Not measured: left out of today’s score")
            : `Baseline ${formatValue(p.format, mean)} ± ${formatValue(p.format, sd).replace(/^\+/, "")}${p.unit ? (isSymbolUnit(p.unit) ? p.unit : `\u00a0${p.unit}`) : ""}`}
          {meta && value !== null && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
        </p>
      </div>
    </div>
  )
  if (p.href) return (
    <Link href={p.href} className={cn("block rounded-lg py-3 outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent", p.className)}>
      {body}
    </Link>
  )
  return <div className={cn("py-3", p.className)}>{body}</div>
}

/** health-03's bar: ten segments from poor (orange) to good (green); the one holding the 6-month mean is lit. */
const SEGMENTS = 10

/** A marker's label centred on its triangle, kept inside the bar's ends. */
function MarkerLabel({ at, children, className }: { at: number; children: React.ReactNode; className?: string }) {
  const t = Math.min(1, Math.max(0, at))
  return (
    <span
      className={cn("absolute flex flex-col items-center whitespace-nowrap", className)}
      style={{ left: `clamp(0px, calc(${t * 100}% - 50px), calc(100% - 100px))`, width: 100 }}
    >
      {children}
    </span>
  )
}

/**
 * A Healthspan factor (health-03): the label, then a ten-segment bar from poor to good with its end values, the
 * 6-month mean marked above (white) and the 30-day mean below (grey), and the years it adds or takes off at the right.
 */
function HealthspanRow({ p, value, meta }: { p: Extract<ContributorRowProps, { variant: "healthspan" }>; value: number | null; meta?: MetricMeta }) {
  const [lo, hi] = p.domain
  const at = (v: number) => (v - lo) / (hi - lo)
  // Under 0.05 years rounds to "0.0": no change, neither younger nor older.
  const years = value === null || p.years === null ? null : Math.abs(p.years) < 0.05 ? 0 : p.years
  const [loText, hiText] = [formatValue(p.format, lo), formatValue(p.format, hi)]
  const withUnit = (v: number) => `${formatValue(p.format, v)}${p.unit && isSymbolUnit(p.unit) ? p.unit : ""}`
  const lit = value === null ? -1 : Math.min(SEGMENTS - 1, Math.max(0, Math.floor(at(value) * SEGMENTS)))
  const recent = value === null ? null : p.recent
  const sentence =
    value === null
      ? `${p.label}: ${p.reasonCopy ?? "No data"}`
      : `${p.label}: 6-month average ${spoken(formatValue(p.format, value), p.unit)}${recent === null ? "" : `, 30-day average ${spoken(formatValue(p.format, recent), p.unit)}`}${years === null ? "" : years === 0 ? ", no change in years" : `, ${formatValue("decimal1", Math.abs(years))} years ${years < 0 ? "younger" : "older"}`}`
  return (
    <div className={cn("py-3", p.className)}>
      <span className="sr-only">{sentence}</span>
      <div aria-hidden className="space-y-1">
        <span className="flex items-center gap-3">
          {p.icon && <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]">{p.icon}</span>}
          <span className={cn(LABEL, "min-w-0 flex-1 text-balance")}>{p.label}</span>
          {meta && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
        </span>
        <div className="flex items-center gap-4">
          <div className="relative min-w-0 flex-1 pt-11 pb-10">
            {value !== null && (
              <MarkerLabel at={at(value)} className="top-0">
                <span className="text-xs leading-4 font-medium text-foreground-secondary">6 Month avg.</span>
                <span className="font-numeric text-[15px] leading-5 font-bold tabular-nums">{withUnit(value)}</span>
                <Triangle className="size-2.5 rotate-180 fill-foreground text-foreground" strokeWidth={0} />
              </MarkerLabel>
            )}
            <div className="relative flex h-6 gap-0.5 overflow-hidden rounded-[4px]">
              {Array.from({ length: SEGMENTS }, (_, i) => {
                const good = p.higherIsBetter ? i / (SEGMENTS - 1) : 1 - i / (SEGMENTS - 1)
                return (
                  <span
                    key={i}
                    className={cn("flex-1", i === lit ? "bg-foreground/45" : "opacity-35")}
                    style={i === lit ? undefined : { background: `color-mix(in oklab, var(--optimal) ${good * 100}%, var(--warning))` }}
                  />
                )
              })}
              <span className={cn("absolute top-1/2 left-1.5 -translate-y-1/2 font-numeric text-[11px] font-bold tabular-nums", lit === 0 ? "text-foreground" : p.higherIsBetter ? "text-warning" : "text-optimal")}>{loText}</span>
              <span className={cn("absolute top-1/2 right-1.5 -translate-y-1/2 font-numeric text-[11px] font-bold tabular-nums", lit === SEGMENTS - 1 ? "text-foreground" : p.higherIsBetter ? "text-optimal" : "text-warning")}>{hiText}</span>
            </div>
            {recent !== null && (
              <MarkerLabel at={at(recent)} className="bottom-0">
                <Triangle className="size-2.5 fill-muted-foreground text-muted-foreground" strokeWidth={0} />
                <span className="font-numeric text-[15px] leading-5 font-bold tabular-nums">{withUnit(recent)}</span>
                <span className="text-xs leading-4 font-medium text-foreground-secondary">30 Day avg.</span>
              </MarkerLabel>
            )}
          </div>
          <span className="flex w-12 shrink-0 flex-col items-end">
            <span className={cn("font-numeric text-xl leading-6 font-bold tabular-nums", years === null ? "text-muted-foreground" : years < 0 ? "text-optimal" : years > 0 ? "text-warning" : "text-foreground-secondary")}>
              {years === null ? MISSING : formatValue("decimal1", years)}
            </span>
            <span className="text-[13px] leading-4 font-semibold text-foreground-secondary">years</span>
          </span>
        </div>
        {/* Reason copy can be a sentence; it gets its own line. */}
        {value === null && <span className="block text-xs leading-4 font-medium text-pretty text-muted-foreground">{p.reasonCopy ?? "No data"}</span>}
      </div>
    </div>
  )
}

export function ContributorRow(p: ContributorRowProps) {
  const render = (value: number | null, meta?: MetricMeta) =>
    p.variant === "recovery" ? <RecoveryRow p={p} value={value} meta={meta} /> : <HealthspanRow p={p} value={value} meta={meta} />
  return (
    <MetricState metric={p.metric} skeleton={<ContributorRowSkeleton variant={p.variant} />} empty={render(null)} renderReason={(_, meta) => render(null, meta)}>
      {(v, meta) => render(v, meta)}
    </MetricState>
  )
}

export function ContributorRowSkeleton({ variant = "recovery" }: { variant?: ContributorRowProps["variant"] }) {
  if (variant === "healthspan")
    return (
      <div aria-hidden className="space-y-1 py-3">
        <SkeletonText className={cn(LABEL, "w-36")} />
        <div className="flex items-center gap-4">
          <div className="flex-1 pt-11 pb-10">
            <div className="h-6 rounded-[4px] bg-dial-track" />
          </div>
          <SkeletonText className="w-12 font-numeric text-xl leading-6 font-bold" />
        </div>
      </div>
    )
  return (
    <div aria-hidden className="space-y-2 py-3">
      <div className="flex items-center gap-3">
        <SkeletonText className={cn(LABEL, "w-36 flex-1")} />
        <SkeletonText className="w-[6ch] font-numeric text-xl leading-6 font-bold" />
      </div>
      <div className="h-1.5 rounded-full bg-dial-track" />
      <SkeletonText className={cn(CAPTION, "w-28")} />
    </div>
  )
}
ContributorRow.Skeleton = ContributorRowSkeleton
