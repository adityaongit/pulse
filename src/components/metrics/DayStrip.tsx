"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { DAY, formatDay } from "@/lib/format"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { BAND_WORD, DATA_COLORS, recoveryBand, recoveryColor } from "@/lib/bands"
import { parseDay, withParam } from "@/lib/url"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useShellCalendar } from "@/components/shells/ShellStatus"

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
  /** "pill": the Journal's tall rounded days with a short weekday, the selected one ringed (journal-01). */
  variant?: "tile" | "pill"
  /** With `onSelect`, the strip picks a day for its owner instead of changing `?d=`. */
  value?: string
  onSelect?: (day: string) => void
}

function Strip({ indicator, days, variant = "tile", value: controlled, onSelect }: DayStripProps) {
  const { today } = useShellCalendar()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const reduced = useReducedMotion()
  const { d: urlDay } = parseDay(params.get("d") ?? undefined, today)
  const d = controlled ?? urlDay
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
    // Centre the day inside the strip only: scrollIntoView also scrolled the page to a strip below the fold.
    const el = selected.current
    const vp = el?.closest<HTMLElement>("[data-slot=scroll-area-viewport]")
    if (el && vp) {
      const r = el.getBoundingClientRect()
      const left = vp.scrollLeft + r.left - vp.getBoundingClientRect().left - (vp.clientWidth - r.width) / 2
      vp.scrollTo({ left, behavior: first.current || reduced ? "instant" : "smooth" })
    }
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
          if (onSelect) return onSelect(v)
          setValue(v)
          router.replace(`${pathname}${withParam(params.toString(), "d", v === today ? null : v)}`, { scroll: false })
        }}
        aria-label="Choose a day"
        spacing={1}
        className={cn("w-max gap-1 px-4 py-1", variant === "pill" ? "gap-2 md:px-6" : "md:px-1")}
      >
        {days.map((day) => {
                    const r = day.recovery ?? null
          const label =
            indicator === "recovery"
              ? `${formatDay(day.date, DAY.long)}, ${r === null ? "no Recovery" : `Recovery ${Math.round(r)} percent, ${BAND_WORD[recoveryBand(r)].toLowerCase()}`}`
              : `${formatDay(day.date, DAY.long)}, ${day.done ? "checked in" : "not checked in"}`
          const on = day.date === value
          return (
            <ToggleGroupItem
              key={day.date}
              value={day.date}
              ref={on ? selected : undefined}
              aria-label={label}
              // Sized by its contents with 8 px above and below, so the badge sits fully inside the lit tile (SYM1):
              // 60 px with the recovery bar, 72 px with the journal badge.
              className={cn(
                "h-auto flex-col justify-center gap-1 px-0 transition-[background-color,box-shadow,scale] duration-150 ease-standard active:scale-[0.96]",
                variant === "pill"
                  ? "w-12 gap-1.5 rounded-full bg-foreground/[0.07] py-3 hover:bg-foreground/10 data-[state=on]:bg-foreground/[0.07] data-[state=on]:inset-ring-2 data-[state=on]:inset-ring-foreground"
                  : "w-11 rounded-xl py-2 hover:bg-foreground/6 data-[state=on]:bg-foreground/10"
              )}
            >
              <span aria-hidden className={cn("leading-3 font-semibold text-muted-foreground", variant === "pill" ? "text-xs" : "text-[11px]")}>
                {formatDay(day.date, { weekday: variant === "pill" ? "short" : "narrow" })}
              </span>
              <span aria-hidden className="font-numeric text-[17px] leading-5 font-semibold tabular-nums">
                {formatDay(day.date, { day: "numeric" })}
              </span>
              {indicator === "recovery" ? (
                <span aria-hidden className={cn("h-1 w-4 rounded-full", r === null ? "bg-dial-track" : DATA_COLORS[recoveryColor(r)].bg)} />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "grid place-items-center rounded-full",
                    variant === "pill" ? "size-5" : "size-4",
                    day.done ? (variant === "pill" ? "bg-optimal text-on-color" : "bg-optimal/20 text-optimal-text") : "ring-1 ring-border"
                  )}
                >
                  {day.done && <Check className={variant === "pill" ? "size-3" : "size-2.5"} strokeWidth={3} />}
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
    // The strip's 30 tiles, clipped like the real one, so wide columns fill too.
    <div aria-hidden className="flex gap-1 overflow-hidden px-4 md:px-1">
      {Array.from({ length: 30 }, (_, i) => (
        <Skeleton key={i} className={cn("w-11 shrink-0 rounded-xl", indicator === "journal" ? "h-18" : "h-15")} />
      ))}
    </div>
  )
}
DayStrip.Skeleton = DayStripSkeleton
