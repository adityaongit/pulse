"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { dayLabel, rangeLabel } from "@/lib/format"
import { addDays, parseDay, weekOf, withParam } from "@/lib/url"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { ResponsiveSheet } from "./ResponsiveSheet"
import { useShellStatus } from "./ShellStatus"

export type DateSwitcherProps = { mode: "day" | "week" }

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

function Switcher({ mode }: DateSwitcherProps) {
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
      router.replace(`${pathname}${withParam(params.toString(), "d", next === today ? null : next)}`, { scroll: false })
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
    <>
      <div className="inline-flex h-9 items-center rounded-full bg-secondary">
        <button type="button" className={STEP} aria-label={`Previous ${unit}`} disabled={atStart} onClick={() => go(addDays(d, -step))}>
          <ChevronLeft aria-hidden className="size-[18px]" strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${label}. Go to date`}
          className="h-9 min-w-24 rounded-full px-3 text-center text-[13px] leading-4 font-bold tracking-[0.1em] whitespace-nowrap uppercase tabular-nums transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
        </button>
        <button type="button" className={STEP} aria-label={`Next ${unit}`} disabled={atEnd} onClick={() => go(addDays(d, step))}>
          <ChevronRight aria-hidden className="size-[18px]" strokeWidth={2} />
        </button>
      </div>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title="Go to date"
        footer={
          <Button
            size="touch"
            onClick={() => {
              go(today)
              setOpen(false)
            }}
          >
            Today
          </Button>
        }
      >
        <Calendar
          mode="single"
          selected={parseISO(d)}
          defaultMonth={parseISO(d)}
          onSelect={(date) => {
            if (!date) return
            go(format(date, "yyyy-MM-dd"))
            setOpen(false)
          }}
          disabled={[{ after: parseISO(today) }, ...(firstDay ? [{ before: parseISO(firstDay) }] : [])]}
          startMonth={firstDay ? parseISO(firstDay) : undefined}
          endMonth={parseISO(today)}
          className="mx-auto bg-transparent p-0 [--cell-size:--spacing(11)]"
        />
      </ResponsiveSheet>
    </>
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
