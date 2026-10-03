"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { BAND_WORD, DATA_COLORS, recoveryBand, recoveryColor } from "@/lib/bands"
import { parseDay, withParam } from "@/lib/url"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useShellStatus } from "@/components/shells/ShellStatus"

export type DayStripDay = {
  /** YYYY-MM-DD. */
  date: string
  /** `recovery` indicator: the day's Recovery, null when none. */
  recovery?: number | null
  /** `journal` indicator: checked in. */
  done?: boolean
}

export type DayStripProps = {
  indicator: "recovery" | "journal"
  /** The 30 days ending today, extended back to include `d` (U10). Oldest first; no future days. */
  days: DayStripDay[]
}

function Strip({ indicator, days }: DayStripProps) {
  const { today } = useShellStatus()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const reduced = useReducedMotion()
  const { d } = parseDay(params.get("d") ?? undefined, today)
  const [value, setValue] = React.useState(d)
  const selected = React.useRef<HTMLButtonElement>(null)
  const first = React.useRef(true)

  // Follow the URL (back/forward, DateSwitcher) without an effect-driven setState loop.
  const [lastD, setLastD] = React.useState(d)
  if (d !== lastD) {
    setLastD(d)
    setValue(d)
  }

  React.useEffect(() => {
    selected.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: first.current || reduced ? "instant" : "smooth" })
    first.current = false
  }, [value, reduced])

  return (
    // py-1 / -my-1: room for the 3 px focus ring inside the scroll viewport, which clips.
    <ScrollArea className="-my-1 w-full touch-manipulation [&_[data-slot=scroll-area-scrollbar]]:hidden">
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => {
          if (!v) return // Radix allows deselecting; a day is always selected.
          setValue(v)
          router.replace(`${pathname}${withParam(params.toString(), "d", v === today ? null : v)}`, { scroll: false })
        }}
        aria-label="Choose a day"
        spacing={1}
        className="w-max gap-1 px-4 py-1 md:px-1"
      >
        {days.map((day) => {
          const date = parseISO(day.date)
          const r = day.recovery ?? null
          const label =
            indicator === "recovery"
              ? `${format(date, "EEEE d MMMM")}, ${r === null ? "no Recovery" : `Recovery ${Math.round(r)} percent, ${BAND_WORD[recoveryBand(r)].toLowerCase()}`}`
              : `${format(date, "EEEE d MMMM")}, ${day.done ? "checked in" : "not checked in"}`
          const on = day.date === value
          return (
            <ToggleGroupItem
              key={day.date}
              value={day.date}
              ref={on ? selected : undefined}
              aria-label={label}
              // Sized by its contents with 8 px above and below, so the badge sits fully inside the lit tile (SYM1):
              // 60 px with the recovery bar, 72 px with the journal badge.
              className="h-auto w-11 flex-col justify-center gap-1 rounded-xl px-0 py-2 transition-[background-color,scale] duration-150 ease-standard hover:bg-white/6 active:scale-[0.96] data-[state=on]:bg-white/10"
            >
              <span aria-hidden className="text-[11px] leading-3 font-semibold text-muted-foreground">
                {format(date, "EEEEE")}
              </span>
              <span aria-hidden className="font-numeric text-[17px] leading-5 font-semibold tabular-nums">
                {format(date, "d")}
              </span>
              {indicator === "recovery" ? (
                <span aria-hidden className={cn("h-1 w-4 rounded-full", r === null ? "bg-dial-track" : DATA_COLORS[recoveryColor(r)].bg)} />
              ) : (
                <span
                  aria-hidden
                  className={cn("grid size-4 place-items-center rounded-full", day.done ? "bg-optimal/20 text-optimal" : "ring-1 ring-border")}
                >
                  {day.done && <Check className="size-2.5" strokeWidth={3} />}
                </span>
              )}
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}

/** Scrub the last 30 days (spec §5.11). Changes `?d=` with router.replace. */
export function DayStrip(props: DayStripProps) {
  return (
    <React.Suspense fallback={<DayStripSkeleton />}>
      <Strip {...props} />
    </React.Suspense>
  )
}

export function DayStripSkeleton({ indicator = "recovery" }: { indicator?: DayStripProps["indicator"] }) {
  return (
    <div aria-hidden className="flex gap-1 overflow-hidden px-4 md:px-1">
      {Array.from({ length: 7 }, (_, i) => (
        <Skeleton key={i} className={cn("w-11 shrink-0 rounded-xl", indicator === "journal" ? "h-18" : "h-15")} />
      ))}
    </div>
  )
}
DayStrip.Skeleton = DayStripSkeleton
