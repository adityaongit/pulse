import { format, parseISO } from "date-fns"
import { BAND_COLOR, DATA_COLORS, recoveryBand } from "./bands"
import { addDays } from "./url"

// Pure logic for the DateSwitcher's month panel (spec §4.3, CAL1-CAL6).

export type CalendarContext = "recovery" | "strain" | "sleep"

/** Monday first, matching the app's ISO weeks (weekOf) and the Asia/Kolkata default (CAL3). 0 = Sunday. */
export const WEEK_STARTS_ON: 0 | 1 = 1

export const STRAIN_DOT = 10
/** Inferred: no current Sleep calendar was found (CAL4). */
export const SLEEP_DOT = 85

/** /strain and /activity show Strain, /sleep shows Sleep, everything else Recovery. */
export function calendarContext(pathname: string): CalendarContext {
  const first = pathname.split("/")[1] ?? ""
  if (first === "strain" || first === "activity") return "strain"
  if (first === "sleep") return "sleep"
  return "recovery"
}

/** Grey for days with no score and future days (WHOOP #707579). */
export const NO_SCORE = "text-foreground/40"

/** Numeral colour class and, for Strain and Sleep, the dot under the numeral (null = no dot). */
export function dayTone(context: CalendarContext, value: number | null): { text: string; dot: string | null } {
  if (value === null) return { text: NO_SCORE, dot: null }
  if (context === "recovery") return { text: DATA_COLORS[BAND_COLOR[recoveryBand(value)]].text, dot: null }
  if (context === "strain") return { text: DATA_COLORS.strain.text, dot: value >= STRAIN_DOT ? DATA_COLORS.strain.bg : null }
  return { text: DATA_COLORS.sleep.text, dot: value >= SLEEP_DOT ? DATA_COLORS.sleep.bg : null }
}

export const monthOf = (day: string) => day.slice(0, 7)

/** "2026-05" + n months. */
export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number)
  const i = y * 12 + (m - 1) + n
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`
}

/** The month's weeks as rows of 7; cells outside the month are null (no outside days). */
export function monthGrid(month: string, weekStartsOn: 0 | 1 = WEEK_STARTS_ON): (string | null)[][] {
  const first = `${month}-01`
  const lead = (parseISO(first).getDay() - weekStartsOn + 7) % 7
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = first; monthOf(d) === month; d = addDays(d, 1)) cells.push(d)
  while (cells.length % 7) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7))
}

/** Weekday headers in grid order: ["MON", …] (caps via CSS, so these are "Mon"). */
export function weekdayLabels(weekStartsOn: 0 | 1 = WEEK_STARTS_ON) {
  // 2026-06-07 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => {
    const date = parseISO(addDays("2026-06-07", i + weekStartsOn))
    return { short: format(date, "EEE"), long: format(date, "EEEE") }
  })
}

export const dayDisabled = (day: string, today: string, firstDay?: string) => day > today || (!!firstDay && day < firstDay)

/** Whether the previous / next month holds any selectable day. */
export function monthNav(month: string, today: string, firstDay?: string) {
  return { prev: !firstDay || addMonths(month, -1) >= monthOf(firstDay), next: addMonths(month, 1) <= monthOf(today) }
}

/** "May", or "May 2025" outside the current year (CAL2, inferred). */
export function monthLabel(month: string, today: string) {
  const date = parseISO(`${month}-01`)
  return format(date, month.slice(0, 4) === today.slice(0, 4) ? "MMMM" : "MMMM yyyy")
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

/** The day an arrow key moves focus to, clamped to [firstDay, today]; null for other keys. */
export function arrowTarget(day: string, key: string, today: string, firstDay?: string) {
  const n = STEP[key]
  if (!n) return null
  const next = addDays(day, n)
  if (next > today) return today
  if (firstDay && next < firstDay) return firstDay
  return next
}
