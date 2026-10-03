"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import {
  addMonths,
  arrowTarget,
  type CalendarContext,
  dayDisabled,
  dayTone,
  monthGrid,
  monthLabel,
  monthNav,
  monthOf,
  NO_SCORE,
  SLEEP_DOT,
  STRAIN_DOT,
  WEEK_STARTS_ON,
  weekdayLabels,
} from "@/lib/calendar"
import { DATA_COLORS } from "@/lib/bands"
import { loadCalendarMonth } from "@/server/actions/calendar"
import type { CalendarDayVM } from "@/server/queries/types"
import { useShellStatus } from "./ShellStatus"

export type CalendarPanelProps = {
  /** The selected day (`?d=`, default today); it carries the circle (CAL5). */
  selected: string
  context: CalendarContext
  onSelect: (day: string) => void
  weekStartsOn?: 0 | 1
}

type Months = Record<string, Map<string, CalendarDayVM>>

// Phone: drops from the very top over the top bar. ≥ 768: hangs under the top bar (56 px) beside the
// rail (112 px) or sidebar (256 px from 1280), so the header and nav stay readable (CAL6, inferred).
const REGION = "fixed inset-x-0 top-0 z-50 md:top-[calc(env(safe-area-inset-top)+3.5rem)] md:left-[112px] xl:left-[256px]"

/**
 * WHOOP's month calendar (spec §4.3, refs calendar-recovery-current-2026-05*.jpg): a flat panel that
 * slides down from the top over a 65% black scrim. Must render inside the DateSwitcher's Dialog root,
 * whose Trigger is the date pill, so Radix traps focus and returns it to the pill.
 */
export function CalendarPanel(props: CalendarPanelProps) {
  // Lives outside Content, so fetched months survive closing the panel.
  const [months, setMonths] = React.useState<Months>({})
  const requested = React.useRef(new Set<string>())
  const content = React.useRef<HTMLDivElement>(null)
  const load = React.useCallback((month: string) => {
    if (requested.current.has(month)) return
    requested.current.add(month)
    loadCalendarMonth(month)
      .then((vm) => setMonths((m) => ({ ...m, [month]: new Map(vm.days.map((x) => [x.day, x])) })))
      // Days stay grey and selectable; the next open retries.
      .catch(() => requested.current.delete(month))
  }, [])

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          REGION,
          "bottom-0 bg-black/65 duration-200 ease-standard data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        )}
      />
      <DialogPrimitive.Content
        ref={content}
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          content.current?.querySelector<HTMLButtonElement>("[role=grid] [tabindex='0']")?.focus()
        }}
        className={cn(
          REGION,
          "border-b-[1.5px] border-background-top bg-background-mid pt-[env(safe-area-inset-top)] outline-none md:pt-0",
          // ≥ 768: a floating panel like the rail, sidebar and sheets, 12 px from the right edge with 28 px lower corners (U18 O-01).
          "md:right-3 md:rounded-b-[28px] md:shadow-overlay",
          "duration-200 ease-standard data-open:animate-in data-open:slide-in-from-top data-closed:animate-out data-closed:slide-out-to-top"
        )}
      >
        <MonthPanel {...props} months={months} load={load} />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

function MonthPanel({
  selected,
  context,
  onSelect,
  weekStartsOn = WEEK_STARTS_ON,
  months,
  load,
}: CalendarPanelProps & { months: Months; load: (month: string) => void }) {
  const { today, firstDay } = useShellStatus()
  const grid = React.useRef<HTMLDivElement>(null)
  // Null until the user moves: the panel opens on the selected day's month. This unmounts with
  // Content on close, so each open starts fresh.
  const [focus, setFocus] = React.useState<string | null>(null)
  const [viewed, setViewed] = React.useState<string | null>(null)
  const month = viewed ?? monthOf(selected)
  const data = months[month]
  const nav = monthNav(month, today, firstDay)
  const weekdays = weekdayLabels(weekStartsOn)

  React.useEffect(() => load(month), [load, month])
  React.useEffect(() => {
    if (focus) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus()
  }, [focus, month])

  const showMonth = (n: number) => {
    setViewed(addMonths(month, n))
    setFocus(null)
  }
  // The roving tab stop: the selected day if it's in view, else the month's last selectable day.
  const days = monthGrid(month, weekStartsOn).flat().filter((d): d is string => !!d && !dayDisabled(d, today, firstDay))
  const tabStop = focus && monthOf(focus) === month ? focus : days.includes(selected) ? selected : days.at(-1)

  const onKeyDown = (e: React.KeyboardEvent) => {
    const from = (e.target as HTMLElement).dataset.day
    const to = from && arrowTarget(from, e.key, today, firstDay)
    if (!to) return
    e.preventDefault()
    setViewed(monthOf(to))
    setFocus(to)
  }

  return (
    <div className="mx-auto w-full px-0.5 pt-3 pb-4 md:max-w-[560px] md:pt-2">
      <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center">
        <ChevronButton dir="prev" disabled={!nav.prev} onClick={() => showMonth(-1)} />
        <DialogPrimitive.Title className="text-center text-sm leading-4 font-bold tracking-[0.1em] uppercase">
          {monthLabel(month, today)}
        </DialogPrimitive.Title>
        <ChevronButton dir="next" disabled={!nav.next} onClick={() => showMonth(1)} />
      </div>

      <div ref={grid} role="grid" aria-label={monthLabel(month, today)} onKeyDown={onKeyDown} className="mt-1 select-none">
        <div role="row" className="grid grid-cols-7">
          {weekdays.map((w) => (
            <span
              key={w.short}
              role="columnheader"
              aria-label={w.long}
              className="text-center text-xs leading-4 font-semibold tracking-[0.04em] text-muted-foreground uppercase"
            >
              {w.short}
            </span>
          ))}
        </div>
        <div className="mt-1">
          {monthGrid(month, weekStartsOn).map((week) => (
            <div key={week.find(Boolean)} role="row" className="grid h-12 grid-cols-7">
              {week.map((day, i) =>
                day ? (
                  <Day
                    key={day}
                    day={day}
                    context={context}
                    value={data?.get(day)?.[context] ?? null}
                    selected={day === selected}
                    disabled={dayDisabled(day, today, firstDay)}
                    tabStop={day === tabStop}
                    onSelect={onSelect}
                  />
                ) : (
                  <span key={i} role="gridcell" />
                )
              )}
            </div>
          ))}
        </div>
      </div>

      <Legend context={context} />
    </div>
  )
}

function ChevronButton({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous month" : "Next month"}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 touch-manipulation place-items-center rounded-full text-foreground transition-[color,scale] duration-150 ease-standard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] disabled:text-foreground/50"
    >
      <Icon aria-hidden className="size-8" strokeWidth={1.5} />
    </button>
  )
}

const VALUE_TEXT: Record<CalendarContext, (v: number) => string> = {
  recovery: (v) => `Recovery ${Math.round(v)}%`,
  strain: (v) => `Strain ${v.toFixed(1)}`,
  sleep: (v) => `Sleep ${Math.round(v)}%`,
}

function Day({
  day,
  context,
  value,
  selected,
  disabled,
  tabStop,
  onSelect,
}: {
  day: string
  context: CalendarContext
  value: number | null
  selected: boolean
  disabled: boolean
  tabStop: boolean
  onSelect: (day: string) => void
}) {
  const tone = disabled ? { text: NO_SCORE, dot: null } : dayTone(context, value)
  const date = parseISO(day)
  return (
    <span role="gridcell" aria-selected={selected} className="grid">
      <button
        type="button"
        data-day={day}
        tabIndex={tabStop ? 0 : -1}
        disabled={disabled}
        aria-label={`${format(date, "EEEE, MMMM d")}${value !== null && !disabled ? `, ${VALUE_TEXT[context](value)}` : ""}`}
        onClick={() => onSelect(day)}
        className="group grid h-12 w-full touch-manipulation place-items-center outline-none [-webkit-tap-highlight-color:transparent]"
      >
        <span
          className={cn(
            "relative grid size-8 place-items-center rounded-full font-numeric text-[17px] leading-none font-bold tabular-nums transition-[background-color,scale] duration-150 ease-standard",
            "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring group-active:scale-[0.96]",
            selected ? "bg-dial-track ring-2 ring-background" : "group-enabled:group-hover:bg-foreground/5",
            tone.text
          )}
        >
          {date.getDate()}
          {tone.dot && <span aria-hidden className={cn("absolute top-full left-1/2 size-1 -translate-x-1/2 rounded-full", tone.dot)} />}
        </span>
      </button>
    </span>
  )
}

const LEGEND: Record<CalendarContext, { label: string; color: keyof typeof DATA_COLORS }[]> = {
  recovery: [
    { label: "<34%", color: "recovery-red" },
    { label: "34% - 66%", color: "recovery-yellow" },
    { label: ">66%", color: "recovery-green" },
  ],
  strain: [{ label: `Day Strain ${STRAIN_DOT}+`, color: "strain" }],
  sleep: [{ label: `Sleep ${SLEEP_DOT}%+`, color: "sleep" }],
}

function Legend({ context }: { context: CalendarContext }) {
  return (
    <ul className="mt-2 flex justify-end gap-3 px-3 text-xs leading-4 font-semibold tabular-nums">
      {LEGEND[context].map(({ label, color }) => (
        <li key={label} className={cn("inline-flex items-center gap-1.5", DATA_COLORS[color].text)}>
          <span aria-hidden className={cn("size-1 rounded-full", DATA_COLORS[color].bg)} />
          {label}
        </li>
      ))}
    </ul>
  )
}
