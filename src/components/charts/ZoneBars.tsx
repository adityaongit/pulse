import { cn } from "@/lib/utils"
import { DATA_COLORS, type DataColor } from "@/lib/bands"
import { durationWords, hmm } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"

export type ZoneRow = { zone: number; min: number; max: number | null; seconds: number }
export type StackedSegment = { key: string; label: string; count: number; color: DataColor }

export type ZoneBarsProps =
  | {
      variant: "rows"
      /** Zones in any order; drawn 5 down to 1. `max: null` is the open top zone ("173+ bpm"). */
      data: Metric<ZoneRow[]> | null | undefined
      maxHr?: number
      emptyCopy?: string
    }
  | {
      variant: "stacked"
      /** "days": Recovery breakdown (4x). "minutes": stress levels (h:mm). */
      unit: "days" | "minutes"
      data: Metric<StackedSegment[]> | null | undefined
      emptyCopy?: string
    }

const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase"

function share(part: number, total: number) {
  if (!total || !part) return "0%"
  const p = (part / total) * 100
  return p < 1 ? "<1%" : `${Math.round(p)}%`
}

function Rows({ zones, maxHr }: { zones: ZoneRow[]; maxHr?: number }) {
  const total = zones.reduce((a, z) => a + z.seconds, 0)
  const sorted = [...zones].sort((a, b) => b.zone - a.zone)
  return (
    // In a stretched card (Strain's Time in zones beside two stacked cards) the five rows share the spare height
    // evenly instead of leaving it under the last row (SYM5). In a natural-height parent nothing grows.
    <div className="flex flex-1 flex-col">
      <ul role="list" className="flex flex-1 flex-col gap-2">
        {sorted.map((z) => {
          const range = z.max === null ? `${z.min}+ bpm` : `${z.min}-${z.max} bpm`
          const sh = share(z.seconds, total)
          const t = Math.round(z.seconds)
          const minutes = Math.floor(t / 60)
          return (
            <li
              key={z.zone}
              aria-label={`Zone ${z.zone}, ${range.replace("-", " to ").replace("+", " and above")}, ${durationWords(minutes)}, ${sh === "<1%" ? "under 1 percent" : sh.replace("%", " percent")}`}
              className={cn("flex flex-1 flex-col justify-center gap-2 rounded-lg bg-secondary px-3 py-2.5", !z.seconds && "opacity-40")}
            >
              <div aria-hidden className="flex items-baseline gap-3">
                <span className={LABEL}>Zone {z.zone}</span>
                <span className={cn(LABEL, "font-numeric text-muted-foreground")}>{range}</span>
                <span className={cn(LABEL, "font-numeric text-foreground-secondary")}>{sh}</span>
                <span className="ml-auto font-numeric text-lg leading-6 font-bold tabular-nums">
                  {hmm(minutes)}
                  <span className="text-xs text-muted-foreground">:{String(t % 60).padStart(2, "0")}</span>
                </span>
              </div>
              <div aria-hidden className="relative h-2 rounded-sm bg-(image:--pattern-hatch)">
                <div className="absolute inset-y-0 left-0 rounded-sm bg-foreground" style={{ width: total ? `${(z.seconds / total) * 100}%` : 0 }} />
              </div>
            </li>
          )
        })}
      </ul>
      {maxHr && <p className="mt-3 text-xs leading-4 font-medium text-muted-foreground">Zones from your max heart rate of {maxHr} bpm.</p>}
    </div>
  )
}

function Stacked({ segments, unit }: { segments: StackedSegment[]; unit: "days" | "minutes" }) {
  const shown = segments.filter((s) => s.count > 0)
  const count = (n: number) => (unit === "days" ? `${n}x` : hmm(n))
  return (
    <div>
      <div aria-hidden className="flex h-3 gap-0.5 overflow-hidden rounded-sm">
        {shown.map((s) => (
          <span key={s.key} className={cn("h-full", DATA_COLORS[s.color].bg)} style={{ flexGrow: s.count, flexBasis: 0 }} />
        ))}
      </div>
      <ul role="list" className="mt-3 space-y-1.5">
        {segments.map((s) => (
          <li
            key={s.key}
            aria-label={`${s.label}: ${unit === "days" ? `${s.count} ${s.count === 1 ? "day" : "days"}` : durationWords(s.count)}`}
            className="flex items-center gap-3"
          >
            <span aria-hidden className={cn("size-2.5 shrink-0 rounded-sm", DATA_COLORS[s.color].bg)} />
            <span aria-hidden className="w-12 font-numeric text-[15px] leading-5 font-bold tabular-nums">
              {count(s.count)}
            </span>
            <span aria-hidden className={cn(LABEL, "text-muted-foreground")}>
              {s.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** DOM meters, not a chart (spec §5.8, D5): time in zones as rows, or a stacked breakdown bar. */
export function ZoneBars(p: ZoneBarsProps) {
  const empty = <EmptyState body={p.emptyCopy ?? (p.variant === "rows" ? "No heart-rate zones yet today." : "No days with Recovery in this period.")} />
  if (p.variant === "rows")
    return (
      <MetricState metric={p.data} skeleton={<ZoneBarsSkeleton variant="rows" />} empty={empty}>
        {(zones) => <Rows zones={zones} maxHr={p.maxHr} />}
      </MetricState>
    )
  return (
    <MetricState metric={p.data} skeleton={<ZoneBarsSkeleton variant="stacked" />} empty={empty}>
      {(segments) => (segments.some((s) => s.count > 0) ? <Stacked segments={segments} unit={p.unit} /> : empty)}
    </MetricState>
  )
}

export function ZoneBarsSkeleton({ variant }: { variant: "rows" | "stacked" }) {
  if (variant === "rows")
    return (
      // Each zone row's own box: the real "Zone n" label, bars for range and time, the hatched track.
      <div aria-hidden className="space-y-2">
        {[5, 4, 3, 2, 1].map((k) => (
          <div key={k} className="space-y-2 rounded-lg bg-secondary px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className={LABEL}>Zone {k}</span>
              <SkeletonText className={cn(LABEL, "w-20")} />
              <SkeletonText className="ml-auto w-[7ch] font-numeric text-lg leading-6 font-bold" />
            </div>
            <div className="h-2 rounded-sm bg-(image:--pattern-hatch)" />
          </div>
        ))}
      </div>
    )
  return (
    <div aria-hidden className="space-y-3">
      <Skeleton className="h-3 rounded-sm" />
      {[0, 1, 2].map((k) => (
        <Skeleton key={k} className="h-4 w-40" />
      ))}
    </div>
  )
}
ZoneBars.Skeleton = ZoneBarsSkeleton
