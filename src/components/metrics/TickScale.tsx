import { cn } from "@/lib/utils"
import { DATA_COLORS, recoveryColor } from "@/lib/bands"
import { formatValue, spoken, type FormatKey } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton } from "@/components/ui/skeleton"
import { MetricState } from "@/components/shells/MetricState"
import { MetricTags, ValueUnit } from "./primitives"

export type TickScaleProps = {
  /** `marker`: WHOOP's ruler (Pace of Aging, ACWR). `meter`: Bevel's segmented meter (Energy). */
  variant: "marker" | "meter"
  /** Spoken name for the meter: "Pace of Aging", "Energy". */
  label: string
  metric: Metric<number> | null | undefined
  min: number
  max: number
  format: FormatKey
  unit?: string
  /** Appended to aria-valuetext: "aging slower than your 6-month average". */
  describe?: string
  /** Marker variant: tint ticks inside a range (ACWR 0.8-1.3 optimal, above 1.5 warning). */
  bands?: { from: number; to: number; tone: "optimal" | "warning" }[]
  /** End labels under the ticks, spread edge to edge ("−1.0x", "1.0x", "3.0x"). */
  ends?: string[]
  /** Marker variant: "Slow" / "Fast" with Turtle / Rabbit. */
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

const COUNT = 48
const BAND_TICK = { optimal: "bg-optimal/60", warning: "bg-warning/60" }

/** A DOM tick ruler or meter (spec §5.15, D5). */
export function TickScale(p: TickScaleProps) {
  return (
    <MetricState metric={p.metric} skeleton={<TickScaleSkeleton />} empty={<Scale p={p} value={null} />} renderReason={() => <Scale p={p} value={null} />}>
      {(v, meta) => <Scale p={p} value={v} provisional={meta.provisional} />}
    </MetricState>
  )
}

function Scale({ p, value, provisional }: { p: TickScaleProps; value: number | null; provisional?: boolean }) {
  const span = p.max - p.min
  const at = (i: number) => p.min + (i / (COUNT - 1)) * span
  const frac = value === null ? null : Math.min(1, Math.max(0, (value - p.min) / span))
  const near = frac === null ? -9 : Math.round(frac * (COUNT - 1))
  const text = formatValue(p.format, value)
  const fill = value === null ? null : DATA_COLORS[recoveryColor(value)].bg
  const valueText = value === null ? `${p.label}: no data` : `${p.label} ${spoken(text, p.unit)}${p.describe ? `: ${p.describe}` : ""}`

  const tickClass = (i: number) => {
    if (p.variant === "meter") return cn("h-5 w-0.5 rounded-full", fill && i <= near ? fill : "bg-dial-track")
    if (Math.abs(i - near) <= 1) return "h-8 w-[3px] rounded-full bg-foreground"
    const band = p.bands?.find((b) => at(i) >= b.from && at(i) <= b.to)
    return cn("h-5 w-0.5 rounded-full", band ? BAND_TICK[band.tone] : "bg-dial-track")
  }

  const label = (
    <span className="inline-flex items-center gap-2">
      <ValueUnit
        value={text}
        unit={p.unit}
        className={cn("font-numeric font-bold text-foreground", p.variant === "meter" ? "text-2xl leading-8" : "text-[22px] leading-7", value === null && "text-muted-foreground")}
        unitClassName={p.unit === "%" || p.unit === "x" ? "text-[0.7em] font-bold text-foreground ml-0" : undefined}
      />
      {provisional && <MetricTags provisional />}
    </span>
  )

  const ticks = (
    <div aria-hidden className="flex h-8 min-w-0 flex-1 items-end justify-between">
      {Array.from({ length: COUNT }, (_, i) => (
        <span key={i} className={tickClass(i)} />
      ))}
    </div>
  )

  return (
    <div
      role="meter"
      aria-label={p.label}
      aria-valuemin={p.min}
      aria-valuemax={p.max}
      aria-valuenow={value ?? undefined}
      aria-valuetext={valueText}
      className="min-w-0"
    >
      {p.variant === "meter" ? (
        <div className="flex items-end gap-3">
          <span className="shrink-0">{label}</span>
          {ticks}
        </div>
      ) : (
        <>
          <div className="relative mb-1 flex h-7 items-center justify-between text-[15px] leading-[22px] text-foreground-secondary">
            <span className="inline-flex items-center gap-1.5 [&_svg]:size-4">{p.leading}</span>
            <span className="inline-flex items-center gap-1.5 [&_svg]:size-4">{p.trailing}</span>
            <span
              aria-hidden
              className="absolute top-1/2 -translate-1/2 bg-transparent"
              style={{ left: `${Math.min(88, Math.max(12, (frac ?? 0.5) * 100))}%` }}
            >
              {label}
            </span>
          </div>
          {ticks}
        </>
      )}
      {p.ends && (
        <div aria-hidden className="mt-1 flex justify-between font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">
          {p.ends.map((e) => (
            <span key={e}>{e}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function TickScaleSkeleton() {
  return <Skeleton aria-hidden className="h-8 w-full" />
}
TickScale.Skeleton = TickScaleSkeleton
