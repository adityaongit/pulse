import Link from "next/link"
import { Bike, Dumbbell, Footprints, PersonStanding, Timer, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { clock, formatValue } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

export type ActivityKind = "run" | "ride" | "walk" | "strength" | "workout"
export const ACTIVITY_ICON: Record<ActivityKind, LucideIcon> = {
  run: PersonStanding,
  ride: Bike,
  walk: Footprints,
  strength: Dumbbell,
  workout: Timer,
}

export type ActivityCardProps = {
  /** "Running", "Strength training", "Cycling", "Walking", "Workout". */
  name: string
  kind: ActivityKind
  /** Activity strain; null with `insufficient_hr_data` shows "--". */
  strain: Metric<number>
  /** Epoch ms. */
  start: number
  end: number
  /** `/activity/[id]`. */
  href: string
  timeZone?: string
}

// Rows are 10 px inside a 16 px card with a 6 px inset; the chip is 8 px inside the row (concentric, spec §2.4).
const ROW = "flex h-14 items-center gap-3 rounded-lg bg-secondary pr-3 pl-1.5"
const CHIP = "flex h-11 min-w-18 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-foreground"

/** One row on the day's timeline (spec §5.12). Shared by ActivityCard and SleepCard. */
export function TimelineRow({
  href,
  chip,
  chipClass,
  barClass,
  name,
  caption,
  start,
  end,
  label,
}: {
  href: string
  chip: React.ReactNode
  chipClass: string
  /** The thin bar after the times: white for sleep, strain blue for activities [latest-home-pastday-1] (spec §11 F18). */
  barClass: string
  name: string
  caption?: string
  start: string
  end: string
  label: string
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(ROW, "transition-[background-color,scale] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] active:bg-accent")}
    >
      <span className={cn(CHIP, chipClass)}>{chip}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-bold tracking-[0.06em] uppercase">{name}</span>
        {caption && <span className="block truncate text-xs leading-4 font-medium text-muted-foreground">{caption}</span>}
      </span>
      <span className="shrink-0 text-right font-numeric text-xs leading-4 font-medium text-foreground-secondary tabular-nums">
        <span className="block">{start}</span>
        <span className="block">{end}</span>
      </span>
      <span aria-hidden className={cn("-ml-1 h-7 w-0.5 shrink-0 rounded-full", barClass)} />
    </Link>
  )
}

export function ActivityCard({ name, kind, strain, start, end, href, timeZone }: ActivityCardProps) {
  const Icon = ACTIVITY_ICON[kind]
  const s = clock(start, timeZone)
  const e = clock(end, timeZone)
  const value = formatValue("decimal1", strain.value)
  return (
    <TimelineRow
      href={href}
      chipClass="bg-strain"
      barClass="bg-strain"
      chip={
        <>
          <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          <span className={cn("font-numeric text-xl leading-6 font-bold tabular-nums", strain.value === null && "text-foreground-secondary")}>{value}</span>
        </>
      }
      name={name}
      caption={strain.value === null ? "No strain: not enough heart-rate data" : undefined}
      start={s}
      end={e}
      label={`${name}, ${strain.value === null ? "no strain" : `strain ${value}`}, ${s} to ${e}`}
    />
  )
}

/** Two timeline rows in their real box: the row, its chip, bars for the name and times. */
export function TimelineSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-1.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={ROW}>
          <Skeleton className={cn(CHIP, "bg-muted")} />
          <SkeletonText className="w-20 flex-1 text-[15px] leading-5" />
          <span className="w-10 shrink-0">
            <SkeletonText className="text-xs leading-4" />
            <SkeletonText className="text-xs leading-4" />
          </span>
          <span className="-ml-1 h-7 w-0.5 shrink-0 rounded-full bg-muted" />
        </div>
      ))}
    </div>
  )
}
ActivityCard.Skeleton = TimelineSkeleton
