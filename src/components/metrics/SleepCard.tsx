import { Moon } from "lucide-react"
import { clock, durationWords, hmm } from "@/lib/format"
import { TimelineRow, TimelineSkeleton } from "./ActivityCard"

export type SleepCardProps = {
  kind: "sleep" | "nap"
  /** Time asleep, minutes. */
  minutes: number
  /** Epoch ms. */
  start: number
  end: number
  /** `/sleep?d=` for sleeps and naps alike (build with dayHref). */
  href: string
  timeZone?: string
}

/** Sleep or nap row on the day's timeline (spec §5.12). */
export function SleepCard({ kind, minutes, start, end, href, timeZone }: SleepCardProps) {
  const name = kind === "nap" ? "Nap" : "Sleep"
  const s = clock(start, timeZone)
  const e = clock(end, timeZone)
  return (
    <TimelineRow
      href={href}
      // WHOOP's light sleep chip [latest-home-pastday-1]; 85 % over the row keeps white text at 3.3 : 1 (large, bold).
      chipClass="bg-sleep/85"
      barClass="bg-foreground/80"
      chip={
        <>
          <Moon aria-hidden className="size-4" strokeWidth={1.75} />
          <span className="font-numeric text-xl leading-6 font-bold tabular-nums">{hmm(minutes)}</span>
        </>
      }
      name={name}
      start={s}
      end={e}
      label={`${name}, ${durationWords(minutes)}, ${s} to ${e}`}
    />
  )
}
SleepCard.Skeleton = TimelineSkeleton
