import Link from "next/link"
import { Bike, Dumbbell, Footprints, PersonStanding, Timer, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { clock, formatValue } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton } from "@/components/ui/skeleton"

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

/** One row on the day's timeline (spec §5.12). Shared by ActivityCard and SleepCard. */
export function TimelineRow({
  href,
  chip,
  chipClass,
  name,
  caption,
  start,
  end,
  label,
}: {
  href: string
  chip: React.ReactNode
  chipClass: string
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
      className="flex h-14 items-center gap-3 rounded-lg bg-secondary pr-3 pl-1.5 transition-[background-color] duration-150 ease-standard outline-none hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
    >
      <span className={cn("flex h-11 min-w-18 shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-foreground", chipClass)}>{chip}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-5 font-bold tracking-[0.06em] uppercase">{name}</span>
        {caption && <span className="block truncate text-xs leading-4 font-medium text-muted-foreground">{caption}</span>}
      </span>
      <span className="shrink-0 text-right font-numeric text-xs leading-4 font-medium text-foreground-secondary tabular-nums">
        <span className="block">{start}</span>
        <span className="block">{end}</span>
      </span>
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
      chipClass="bg-strain-deep"
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

/** Two timeline rows. */
export function TimelineSkeleton() {
  return (
    <div aria-hidden className="space-y-1.5">
      <Skeleton className="h-14 rounded-lg" />
      <Skeleton className="h-14 rounded-lg" />
    </div>
  )
}
ActivityCard.Skeleton = TimelineSkeleton
