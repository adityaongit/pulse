"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
/** Where the year grid opens when nothing is picked yet: the middle of the likely range. */
const START_YEAR = 1995
const OLDEST = 1920

const CELL =
  "grid h-11 place-items-center rounded-xl text-[15px] font-semibold tabular-nums transition-[background-color,color,scale] duration-150 ease-standard outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-foreground/70 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-35"
const PICKED = "bg-foreground text-background hover:bg-foreground"

const iso = (d: Date) => format(d, "yyyy-MM-dd")

/**
 * A birth date picker (U19): the field opens a popover that starts on a year grid (decades back is the
 * common case), then months, then days. The day view's caption returns to the years. The value is posted
 * through a hidden input, so it works inside a plain server-action form.
 */
export function BirthDatePicker({
  id,
  name,
  defaultValue,
  invalid,
  describedBy,
}: {
  id: string
  name: string
  defaultValue: string
  invalid?: boolean
  describedBy?: string
}) {
  const today = React.useMemo(() => new Date(), [])
  const youngest = today.getFullYear() - 13
  const [value, setValue] = React.useState(defaultValue)
  const picked = value ? parseISO(value) : undefined
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<"year" | "month" | "day">(picked ? "day" : "year")
  const [month, setMonth] = React.useState<Date>(picked ?? new Date(START_YEAR, 0, 1))
  const year = month.getFullYear()

  const onOpenChange = (o: boolean) => {
    setOpen(o)
    if (o) {
      setView(picked ? "day" : "year")
      setMonth(picked ?? new Date(START_YEAR, 0, 1))
    }
  }

  // Scroll the year grid so the year in view is centred when it opens.
  const yearsRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (view !== "year") return
    yearsRef.current?.querySelector<HTMLElement>(`[data-year="${year}"]`)?.scrollIntoView({ block: "center" })
  }, [view, year])

  const years = Array.from({ length: youngest - OLDEST + 1 }, (_, i) => youngest - i)

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <input type="hidden" name={name} value={value} />
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          data-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "flex h-13 w-full min-w-0 items-center justify-between gap-3 rounded-xl bg-field px-4 text-left text-[17px] leading-6 tabular-nums outline-none transition-[box-shadow] duration-150 ease-standard focus-visible:ring-2 focus-visible:ring-foreground/70 data-invalid:ring-2 data-invalid:ring-recovery-red-text",
            !picked && "text-muted-foreground",
          )}
        >
          {picked ? format(picked, "d MMMM yyyy") : "Choose your birth date"}
          <CalendarDays aria-hidden className="size-5 shrink-0 text-foreground-secondary" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-[272px] gap-2 p-3">
        <div className="flex h-10 items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setView(view === "year" ? (picked ? "day" : "year") : "year")}
            className="flex h-10 items-center gap-1 rounded-lg px-2 text-[15px] font-bold outline-none hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-foreground/70"
            aria-label={view === "year" ? "Years" : `Choose year, ${format(month, "MMMM yyyy")}`}
          >
            {view === "year" ? "Year" : view === "month" ? year : format(month, "MMMM yyyy")}
            {view !== "year" && <ChevronDown aria-hidden className="size-4" strokeWidth={2.25} />}
          </button>
          {view === "day" && (
            <div className="flex">
              <Button type="button" variant="ghost" size="icon-lg" aria-label="Previous month" onClick={() => setMonth(new Date(year, month.getMonth() - 1, 1))}>
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label="Next month"
                disabled={year === youngest && month.getMonth() === 11}
                onClick={() => setMonth(new Date(year, month.getMonth() + 1, 1))}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
        </div>

        {view === "year" && (
          <div ref={yearsRef} className="grid max-h-72 grid-cols-4 gap-1 overflow-y-auto overscroll-contain [scrollbar-width:thin]">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                data-year={y}
                className={cn(CELL, picked?.getFullYear() === y && PICKED)}
                onClick={() => {
                  setMonth(new Date(y, month.getMonth(), 1))
                  setView("month")
                }}
              >
                {y}
              </button>
            ))}
          </div>
        )}

        {view === "month" && (
          <div className="grid grid-cols-3 gap-1">
            {MONTHS.map((m, i) => (
              <button
                key={m}
                type="button"
                className={cn(CELL, picked && picked.getFullYear() === year && picked.getMonth() === i && PICKED)}
                onClick={() => {
                  setMonth(new Date(year, i, 1))
                  setView("day")
                }}
              >
                {m}
              </button>
            ))}
          </div>
        )}

        {view === "day" && (
          <Calendar
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={picked}
            onSelect={(d) => {
              if (!d) return
              setValue(iso(d))
              setOpen(false)
            }}
            hideNavigation
            showOutsideDays={false}
            disabled={{ after: new Date(youngest, 11, 31) }}
            classNames={{ month_caption: "hidden" }}
            className="w-full bg-transparent p-0 [--cell-size:--spacing(9)]"
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
