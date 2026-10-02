"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
}

const STEP =
  "relative grid size-9 place-items-center rounded-full text-foreground transition-[background-color,scale] duration-150 ease-standard outline-none after:absolute after:-inset-1 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40"

/** Keys that belong to the focused control, not to day stepping. */
function ownsArrows(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    !!target.closest("input, textarea, select, [role=slider], [role=dialog], [data-slot=toggle-group], .recharts-wrapper")
  )
}

function Switcher({ mode, calendar }: DateSwitcherProps) {
  const { today, firstDay } = useShellStatus()
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [open, setOpen] = React.useState(false)
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
      router.replace(dayHref(`${pathname}?${params}`, next, today), { scroll: false })
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="inline-flex h-9 items-center rounded-full bg-secondary">
        <button type="button" className={STEP} aria-label={`Previous ${unit}`} disabled={atStart} onClick={() => go(addDays(d, -step))}>
          <ChevronLeft aria-hidden className="size-[18px]" strokeWidth={2} />
        </button>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`${label}. Open calendar`}
            className="h-9 min-w-24 rounded-full px-3 text-center text-[13px] leading-4 font-bold tracking-[0.1em] whitespace-nowrap uppercase tabular-nums transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {label}
          </button>
        </DialogTrigger>
        <button type="button" className={STEP} aria-label={`Next ${unit}`} disabled={atEnd} onClick={() => go(addDays(d, step))}>
          <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2} />
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
    <React.Suspense fallback={<div aria-hidden className={cn("h-9 w-44 rounded-full bg-secondary")} />}>
      <Switcher {...props} />
    </React.Suspense>
  )
}
