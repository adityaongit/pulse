"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { calendarContext, type CalendarContext } from "@/lib/calendar"
import { dayLabel, rangeLabel } from "@/lib/format"
import { addDays, dayHref, parseDay, weekOf } from "@/lib/url"
import { Dialog, DialogTrigger } from "@/components/ui/dialog"
import { CalendarPanel } from "./CalendarPanel"
import { useShellStatus } from "./ShellStatus"

export type DateSwitcherProps = {
  mode: "day" | "week"
  /** The calendar's colouring; default from the route (/strain and /activity Strain, /sleep Sleep, else Recovery). */
  calendar?: CalendarContext
  /**
   * `header`: the date is the detail header's title between two small chevrons (Recovery, Strain,
   * Sleep, spec §4.4). `body` (default): the pill, in a header or under it.
   */
  placement?: "header" | "body"
}

const PRESS = "transition-[background-color,color,scale] duration-150 ease-standard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
// 32 px visual, 44 px hit area (spec §4.3.1); the next chevron greys out on today.
const STEP = cn(
  "relative grid size-7 place-items-center rounded-full text-foreground after:absolute after:-inset-2 hover:bg-white/8 disabled:pointer-events-none disabled:text-foreground/35",
  PRESS
)
const BARE_STEP = cn(
  // 36 px visual; the hit area grows to 44 tall (and 40 wide, stopping short of the label's).
  "relative grid size-9 place-items-center rounded-full text-foreground/70 after:absolute after:-inset-x-0.5 after:-inset-y-1 hover:text-foreground disabled:pointer-events-none disabled:text-foreground/25",
  PRESS
)
const LABEL = "text-[13px] leading-4 font-bold tracking-[0.1em] whitespace-nowrap uppercase tabular-nums"

/** Keys that belong to the focused control, not to day stepping. */
function ownsArrows(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    !!target.closest("input, textarea, select, [role=slider], [role=dialog], [data-slot=toggle-group], .recharts-wrapper")
  )
}

function Switcher({ mode, calendar, placement = "body" }: DateSwitcherProps) {
  const { today, firstDay } = useShellStatus()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = React.useState(false)
  // The pill shows the app's one spinner while the next day loads (spec §2.7 "Loading a past day").
  const [loading, startLoading] = React.useTransition()
  const { d } = parseDay(params.get("d") ?? undefined, today)

  const week = mode === "week"
  const [weekStart, weekEnd] = weekOf(d)
  const atEnd = week ? weekStart >= weekOf(today)[0] : d >= today
  const atStart = !!firstDay && (week ? weekStart <= firstDay : d <= firstDay)
  const unit = week ? "week" : "day"

  const go = React.useCallback(
    (day: string) => {
      const next = day > today ? today : firstDay && day < firstDay ? firstDay : day
      // replace, not push: the back gesture leaves the screen instead of stepping through days (spec §8).
      startLoading(() => router.replace(dayHref(`${pathname}?${params}`, next, today), { scroll: false }))
    },
    [router, pathname, params, today, firstDay]
  )
  const step = week ? 7 : 1

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || ownsArrows(e.target)) return
      if (e.key === "ArrowLeft" && !atStart) go(addDays(d, -step))
      else if (e.key === "ArrowRight" && !atEnd) go(addDays(d, step))
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [d, step, atStart, atEnd, go])

  const label = week ? rangeLabel(weekStart, weekEnd) : dayLabel(d, today)
  const bare = placement === "header"
  const text = loading ? (
    <LoaderCircle aria-hidden className="mx-auto size-4 animate-spin motion-reduce:animate-none" strokeWidth={2} />
  ) : (
    // Keyed so a new day cross-fades in rather than snapping (150 ms, opacity only).
    <span key={label} className="block animate-in duration-150 fade-in-0">
      {label}
    </span>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className={cn("inline-flex items-center", bare ? "gap-1" : "h-8 rounded-full bg-white/[0.04] p-0.5")}>
        <button type="button" className={bare ? BARE_STEP : STEP} aria-label={`Previous ${unit}`} disabled={atStart} onClick={() => go(addDays(d, -step))}>
          <ChevronLeft aria-hidden className={bare ? "size-4" : "size-[18px]"} strokeWidth={2.25} />
        </button>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`${label}. Open calendar`}
            aria-busy={loading || undefined}
            className={cn(
              PRESS,
              bare
                ? "relative h-9 min-w-28 rounded-full px-2 text-center after:absolute after:inset-x-0 after:-inset-y-1 text-[15px] leading-5 font-bold tracking-[0.1em] whitespace-nowrap uppercase tabular-nums hover:text-foreground-secondary"
                : cn(LABEL, "relative h-7 min-w-24 rounded-full bg-white/[0.08] px-4 text-center after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-white/[0.12]")
            )}
          >
            {text}
          </button>
        </DialogTrigger>
        <button type="button" className={bare ? BARE_STEP : STEP} aria-label={`Next ${unit}`} disabled={atEnd} onClick={() => go(addDays(d, step))}>
          <ChevronRight aria-hidden className={bare ? "size-4" : "size-[18px]"} strokeWidth={2.25} />
        </button>
      </div>
      <CalendarPanel
        selected={d}
        context={calendar ?? calendarContext(pathname)}
        onSelect={(day) => {
          go(day)
          setOpen(false)
        }}
      />
    </Dialog>
  )
}

/** WHOOP's date pill (spec §4.3). Reads `?d=`; changes it with router.replace. */
export function DateSwitcher(props: DateSwitcherProps) {
  return (
    <React.Suspense fallback={<div aria-hidden className={cn(props.placement === "header" ? "h-9 w-44" : "h-8 w-40 rounded-full bg-white/[0.04]")} />}>
      <Switcher {...props} />
    </React.Suspense>
  )
}
