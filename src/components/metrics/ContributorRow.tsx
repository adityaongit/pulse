import { ChevronRight, Triangle } from "lucide-react"
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
  /** Overrides the reason caption (e.g. "No lean body mass: add weight and body fat in Fitbit"). */
  reasonCopy?: string
  className?: string
}

export type ContributorRowProps =
  | (Common & {
      variant: "recovery"
      /** The personal normal: mean ± 1 σ is shaded, the track spans mean ± 3 σ. */
      baseline: { mean: number; sd: number }
      /** Points this input moved today's Recovery. */
      points: number | null
      direction: GoodDirection
    })
  | (Common & {
      variant: "healthspan"
      /** Axis ends, low to high value, left to right (WHOOP). */
      domain: [number, number]
      target: number
      /** Years this input adds (positive, older) or removes (negative, younger). */
      years: number | null
      higherIsBetter: boolean
      /** Client parents only: opens the contributor sheet. */
      onSelect?: () => void
    })

const pct = (v: number, lo: number, hi: number) => `${Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100))}%`
const MARKER: Record<Tone, string> = { good: "bg-optimal", bad: "bg-warning", neutral: "bg-foreground" }

function Header({ p, value, right }: { p: Common; value: number | null; right?: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      {p.icon && <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]">{p.icon}</span>}
      <span className={cn(LABEL, "line-clamp-2 min-w-0 flex-1")}>{p.label}</span>
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
      ? `${p.label}: ${p.reasonCopy ?? "Not measured: left out of today's score"}`
      : `${p.label} ${unitSpoken(value)}, ${value > mean + sd ? "above" : value < mean - sd ? "below" : "within"} your normal range of ${formatValue(p.format, mean - sd)} to ${formatValue(p.format, mean + sd)}${pts === null ? "" : pts === 0 ? ", no change" : `, ${pts > 0 ? "added" : "took off"} ${Math.abs(Math.round(pts))} points`}`
  return (
    <div className={cn("space-y-2 py-3", p.className)}>
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
            ? (p.reasonCopy ?? "Not measured: left out of today's score")
            : `Baseline ${formatValue(p.format, mean)} ± ${formatValue(p.format, sd).replace(/^\+/, "")}${p.unit ? (isSymbolUnit(p.unit) ? p.unit : ` ${p.unit}`) : ""}`}
          {meta && value !== null && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
        </p>
      </div>
    </div>
  )
}

/**
 * "Target X" centred under its ▲ (spec §11 M5). The box is centred on the marker and reaches only to the near end
 * label (its width bounded by `ch`: digits are tabular, punctuation narrower), so when the label is wider than the
 * box, `safe center` pins it to that end label instead of overlapping it or the row edge. Right of centre the box runs
 * right to left, so the pinned side is the right one.
 */
function TargetLabel({ at, lo, hi, children }: { at: number; lo: string; hi: string; children: React.ReactNode }) {
  const t = Math.min(1, Math.max(0, at))
  const start = t <= 0.5
  const edge = `(${(start ? lo : hi).length}ch + 8px)`
  return (
    <span
      className={cn("absolute inset-y-0 flex items-center justify-center-safe", !start && "[direction:rtl]")}
      style={{ [start ? "left" : "right"]: `calc${edge}`, width: `calc(2 * (${(start ? t : 1 - t) * 100}% - ${edge}))` }}
    >
      <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap [direction:ltr]">{children}</span>
    </span>
  )
}

function HealthspanRow({ p, value, meta }: { p: Extract<ContributorRowProps, { variant: "healthspan" }>; value: number | null; meta?: MetricMeta }) {
  const [lo, hi] = p.domain
  // Under 0.05 years rounds to "0.0": no change, neither younger nor older.
  const years = value === null || p.years === null ? null : Math.abs(p.years) < 0.05 ? 0 : p.years
  const yearsText = years === null ? MISSING : formatValue("decimal1", years)
  const [loText, hiText] = [formatValue(p.format, lo), formatValue(p.format, hi)]
  const sentence =
    value === null
      ? `${p.label}: ${p.reasonCopy ?? "No data"}`
      : `${p.label} ${spoken(formatValue(p.format, value), p.unit)}, target ${formatValue(p.format, p.target)}${years === null ? "" : years === 0 ? ", no change in years" : `, ${formatValue("decimal1", Math.abs(years))} years ${years < 0 ? "younger" : "older"}`}`
  const body = (
    <>
      <span className="sr-only">{sentence}</span>
      <span aria-hidden className="block min-w-0 flex-1 space-y-1.5">
        <Header
          p={p}
          value={value}
          right={
            years !== null && (
              <span className="inline-flex items-baseline">
                <span className={cn("font-numeric text-xl font-bold tabular-nums", years < 0 ? "text-optimal" : years > 0 ? "text-warning" : "text-foreground-secondary")}>
                  {yearsText}
                </span>
                <span className="ml-1 text-[13px] leading-4 font-semibold text-foreground-secondary">years</span>
              </span>
            )
          }
        />
        <span className="relative block pt-3 pb-3">
          {value !== null && (
            <Triangle className="absolute top-0 size-2 -translate-x-1/2 rotate-180 fill-foreground text-foreground" strokeWidth={0} style={{ left: pct(value, lo, hi) }} />
          )}
          <span
            className={cn(
              "block h-1.5 rounded-full bg-linear-to-r via-dial-target",
              p.higherIsBetter ? "from-warning to-optimal" : "from-optimal to-warning"
            )}
          />
          <Triangle className="absolute bottom-0 size-2 -translate-x-1/2 fill-muted-foreground text-muted-foreground" strokeWidth={0} style={{ left: pct(p.target, lo, hi) }} />
        </span>
        <span className="relative flex h-4 justify-between font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">
          <span>{loText}</span>
          {value !== null && (
            <TargetLabel at={(p.target - lo) / (hi - lo)} lo={loText} hi={hiText}>
              Target {formatValue(p.format, p.target)}
              {meta && <MetricTags provisional={meta.provisional} tags={meta.tags} />}
            </TargetLabel>
          )}
          <span>{hiText}</span>
        </span>
        {/* Reason copy can be a sentence; it gets its own line rather than squeezing between the end labels. */}
        {value === null && <span className="block text-xs leading-4 font-medium text-pretty text-muted-foreground">{p.reasonCopy ?? "No data"}</span>}
      </span>
    </>
  )
  if (p.onSelect)
    return (
      <button
        type="button"
        onClick={p.onSelect}
        className={cn(
          "-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg px-2 py-3 text-left transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent",
          p.className
        )}
      >
        {body}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      </button>
    )
  return <div className={cn("flex items-center py-3", p.className)}>{body}</div>
}

/** One input's value against its normal band and its effect on the score (spec §5.3). */
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
      // The healthspan row's box: the header line, the gradient track with its marker room, the end labels.
      <div aria-hidden className="space-y-1.5 py-3">
        <div className="flex items-center gap-3">
          <SkeletonText className={cn(LABEL, "w-36 flex-1")} />
          <SkeletonText className="w-[6ch] font-numeric text-xl leading-6 font-bold" />
        </div>
        <div className="py-3">
          <div className="h-1.5 rounded-full bg-dial-track" />
        </div>
        <SkeletonText className={cn(CAPTION, "w-full")} />
      </div>
    )
  return (
    // The recovery row's box: a 24 px header line, the 6 px track, a caption line.
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
