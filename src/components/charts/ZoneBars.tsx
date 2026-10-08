import { cn } from "@/lib/utils"
import { DATA_COLORS, ZONE_COLOR, type DataColor } from "@/lib/bands"
import { durationWords, hmm } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { LABEL } from "@/components/metrics/primitives"

/** `zone` 0-5 orders the rows (0 is time under Zone 1: `min` 0, `max` the bpm below Zone 1); `label` names it ("Zone 1"). */
export type ZoneRow = {
  zone: number
  label: string
  min: number
  max: number | null
  seconds: number
  /** Activity only: the mean seconds and share (0-1) in this zone over the last 30 days of the same kind. */
  typical?: { seconds: number; share: number }
}
export type StackedSegment = { key: string; label: string; count: number; color: DataColor }

export type ZoneBarsProps =
  | {
      variant: "rows"
      /** Zones in any order; drawn top zone first. `max: null` is the open top zone ("173+ bpm"). */
      data: Metric<ZoneRow[]> | null | undefined
      /** Where the zones came from, under the rows. */
      note?: string
      emptyCopy?: string
    }
  | {
      variant: "stacked"
      /** "days": Recovery breakdown (4x). "minutes": stress levels (h:mm). */
      unit: "days" | "minutes"
      data: Metric<StackedSegment[]> | null | undefined
      emptyCopy?: string
    }


function share(part: number, total: number) {
  if (!total || !part) return "0%"
  const p = (part / total) * 100
  return p < 1 ? "<1%" : `${Math.round(p)}%`
}

function Rows({ zones, note }: { zones: ZoneRow[]; note?: string }) {
  const total = zones.reduce((a, z) => a + z.seconds, 0)
  const sorted = [...zones].sort((a, b) => b.zone - a.zone)
  const typical = sorted.some((z) => z.typical)
  // No time in any zone (an easy walk): one line that says so, not greyed rows of 0:00:00.
  const lowest = sorted.findLast((z) => z.zone > 0)
  if (!total && lowest)
    return (
      <div className="flex flex-1 flex-col justify-center">
        <p className="rounded-lg bg-secondary px-3 py-3 text-[15px] leading-[22px] text-pretty text-foreground-secondary">
          Heart rate stayed under the {lowest.label} zone ({lowest.min}{"\u00a0"}bpm) the whole time.
        </p>
        {note && <p className="mt-3 text-xs leading-4 font-medium text-muted-foreground">{note}</p>}
      </div>
    )
  const T = Math.round(total)
  return (
    // In a stretched card (Strain's Time in zones beside two stacked cards) the rows share the spare height
    // evenly instead of leaving it under the last row (SYM5). In a natural-height parent nothing grows.
    <div className="flex flex-1 flex-col">
      <div aria-hidden className="mb-2 flex items-center justify-between px-1">
        <span className={cn(LABEL, "flex items-center gap-1.5 text-muted-foreground", !typical && "invisible")}>
          <span className="size-2.5 rounded-[2px] bg-(image:--pattern-hatch) ring-1 ring-border" />
          Typical range
        </span>
        <span className={cn(LABEL, "flex items-baseline gap-2 text-muted-foreground")}>
          Duration
          <span className="font-numeric text-[15px] leading-5 font-bold text-foreground tabular-nums">
            {hmm(Math.floor(T / 60))}
            <span className="text-xs text-muted-foreground">:{String(T % 60).padStart(2, "0")}</span>
          </span>
        </span>
      </div>
      <ul role="list" className="flex flex-1 flex-col gap-2">
        {sorted.map((z) => {
          const below = z.zone === 0
          const range = below ? `<${z.max! + 1}\u00a0bpm` : z.max === null ? `${z.min}+\u00a0bpm` : `${z.min}-${z.max}\u00a0bpm`
          const spoken = below ? `under ${z.max! + 1} bpm` : range.replace("-", " to ").replace("+", " and above")
          const sh = share(z.seconds, total)
          const t = Math.round(z.seconds)
          const minutes = Math.floor(t / 60)
          const color = ZONE_COLOR[z.zone] ? DATA_COLORS[ZONE_COLOR[z.zone]] : null
          return (
            <li
              key={z.zone}
              aria-label={`${z.label} zone, ${spoken}, ${durationWords(minutes)}, ${sh === "<1%" ? "under 1 percent" : sh.replace("%", " percent")}`}
              className={cn("flex flex-1 flex-col justify-center gap-2 rounded-lg bg-secondary px-3 py-2.5", !z.seconds && "opacity-40")}
            >
              <div aria-hidden className="flex items-baseline gap-2">
                <span className={cn(LABEL, "font-bold uppercase")}>{z.label}</span>
                <span className={cn(LABEL, "font-numeric text-muted-foreground uppercase")}>{range}</span>
                <span className={cn(LABEL, "font-numeric", color && z.zone > 1 && z.seconds > 0 ? color.text : "text-muted-foreground")}>{sh}</span>
                {z.typical && Math.round((z.seconds - z.typical.seconds) / 60) !== 0 && (
                  <span className={cn(LABEL, "font-numeric", z.seconds > z.typical.seconds ? "text-foreground" : "text-muted-foreground")}>
                    {z.seconds > z.typical.seconds ? "+" : "\u2212"}
                    {Math.abs(Math.round((z.seconds - z.typical.seconds) / 60))}
                    {"\u00a0"}min
                  </span>
                )}
                <span className="ml-auto font-numeric text-lg leading-6 font-bold tabular-nums">
                  {hmm(minutes)}
                  <span className="text-xs text-muted-foreground">:{String(t % 60).padStart(2, "0")}</span>
                </span>
              </div>
              <div aria-hidden className="relative h-3 rounded-[2px] bg-(image:--pattern-hatch)">
                <div className={cn("absolute inset-y-0 left-0 rounded-[2px]", color ? color.bg : "bg-foreground/30")} style={{ width: total ? `${(z.seconds / total) * 100}%` : 0 }} />
                {/* Your typical share for this kind of activity: a thin tick at the end of the hatched area. */}
                {z.typical && <div className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${Math.min(100, z.typical.share * 100)}%` }} />}
              </div>
            </li>
          )
        })}
      </ul>
      {note && <p className="mt-3 text-xs leading-4 font-medium text-muted-foreground">{note}</p>}
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
        {(zones) => <Rows zones={zones} note={p.note} />}
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
      // Each zone row's own box: the real zone name, bars for range and time, the hatched track.
      <div aria-hidden className="space-y-2">
        {["Zone 5", "Zone 4", "Zone 3", "Zone 2", "Zone 1", "Zone 0"].map((k) => (
          <div key={k} className="space-y-2 rounded-lg bg-secondary px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span className={LABEL}>{k}</span>
              <SkeletonText className={cn(LABEL, "w-20")} />
              <SkeletonText className="ml-auto w-[7ch] font-numeric text-lg leading-6 font-bold" />
            </div>
            <div className="h-3 rounded-[2px] bg-(image:--pattern-hatch)" />
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
