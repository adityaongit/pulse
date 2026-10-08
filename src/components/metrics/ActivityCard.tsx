import Link from "next/link"
import { Bike, Dumbbell, Footprints, PersonStanding, Timer, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { clock, formatValue, spoken } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { CAP_TRIM } from "./primitives"

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
  /** Recorded distance; the caption shows it (with pace) under the name. Omit or null for none. */
  distanceKm?: number | null
  /** Seconds per km (runs and walks). */
  paceS?: number | null
}

/** "5.21 km at 5:32 /km", "18.40 km", or null with no distance. */
export function distanceText(km: number | null | undefined, paceS?: number | null) {
  if (km == null) return null
  return paceS == null ? `${formatValue("decimal2", km)} km` : `${formatValue("decimal2", km)} km at ${formatValue("pace", paceS)} /km`
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
        <span className="block text-[15px] leading-5 font-bold tracking-[0.1em] text-pretty uppercase">{name}</span>
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

export function ActivityCard({ name, kind, strain, start, end, href, timeZone, distanceKm, paceS }: ActivityCardProps) {
  const Icon = ACTIVITY_ICON[kind]
  const s = clock(start, timeZone)
  const e = clock(end, timeZone)
  const value = formatValue("decimal1", strain.value)
  const distance = distanceText(distanceKm, paceS)
  const noStrain = strain.value === null
  // The full reason when it is the only caption; beside a distance, the short form keeps the row on one line.
  const caption = distance ? (noStrain ? `${distance} · No strain` : distance) : noStrain ? "No strain: not enough heart-rate data" : undefined
  const spokenDistance = distanceKm == null ? "" : `, ${spoken(formatValue("decimal2", distanceKm), "km")}${paceS == null ? "" : ` at ${spoken(formatValue("pace", paceS), "/km")}`}`
  return (
    <TimelineRow
      href={href}
      chipClass="bg-strain"
      barClass="bg-strain"
      chip={
        <>
          <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          <span className={cn("font-numeric text-xl font-bold tabular-nums", CAP_TRIM, strain.value === null && "text-foreground-secondary")}>{value}</span>
        </>
      }
      name={name}
      caption={caption}
      start={s}
      end={e}
      label={`${name}${spokenDistance}, ${noStrain ? "no strain" : `strain ${value}`}, ${s} to ${e}`}
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
