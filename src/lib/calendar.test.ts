import { describe, expect, it } from "vitest"
import { addMonths, arrowTarget, calendarContext, dayDisabled, dayTone, monthGrid, monthLabel, monthNav, NO_SCORE, weekdayLabels } from "./calendar"

describe("calendarContext", () => {
  it("maps routes to the calendar's colouring", () => {
    expect(calendarContext("/")).toBe("recovery")
    expect(calendarContext("/recovery")).toBe("recovery")
    expect(calendarContext("/health/monitor")).toBe("recovery")
    expect(calendarContext("/strain")).toBe("strain")
    expect(calendarContext("/activity/abc")).toBe("strain")
    expect(calendarContext("/sleep")).toBe("sleep")
  })
})

describe("dayTone", () => {
  it("bands Recovery at 34 and 67", () => {
    expect(dayTone("recovery", 33.9).text).toBe("text-recovery-red-text")
    expect(dayTone("recovery", 34).text).toBe("text-recovery-yellow")
    expect(dayTone("recovery", 66.9).text).toBe("text-recovery-yellow")
    expect(dayTone("recovery", 67).text).toBe("text-recovery-green")
    expect(dayTone("recovery", 80).dot).toBeNull()
  })
  it("dots Strain from 10.0 and Sleep from 85", () => {
    expect(dayTone("strain", 9.9)).toEqual({ text: "text-strain-text", dot: null })
    expect(dayTone("strain", 10)).toEqual({ text: "text-strain-text", dot: "bg-strain" })
    expect(dayTone("sleep", 84.9)).toEqual({ text: "text-sleep", dot: null })
    expect(dayTone("sleep", 85)).toEqual({ text: "text-sleep", dot: "bg-sleep" })
  })
  it("greys days without a score", () => {
    for (const c of ["recovery", "strain", "sleep"] as const) expect(dayTone(c, null)).toEqual({ text: NO_SCORE, dot: null })
  })
})

describe("dayDisabled", () => {
  it("disables future days and days before the first stored day", () => {
    expect(dayDisabled("2026-05-31", "2026-05-30")).toBe(true)
    expect(dayDisabled("2026-05-30", "2026-05-30")).toBe(false)
    expect(dayDisabled("2026-04-05", "2026-05-30", "2026-04-06")).toBe(true)
    expect(dayDisabled("2026-04-06", "2026-05-30", "2026-04-06")).toBe(false)
  })
})

describe("monthNav", () => {
  it("disables next on the current month and prev on the first stored month", () => {
    expect(monthNav("2026-05", "2026-05-30", "2026-04-06")).toEqual({ prev: true, next: false })
    expect(monthNav("2026-04", "2026-05-30", "2026-04-06")).toEqual({ prev: false, next: true })
    expect(monthNav("2026-04", "2026-05-30")).toEqual({ prev: true, next: true })
  })
  it("steps across years", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12")
    expect(addMonths("2025-12", 1)).toBe("2026-01")
  })
})

describe("monthGrid", () => {
  it("starts May 2026 on Friday with no outside days, Sunday or Monday first", () => {
    const sun = monthGrid("2026-05", 0)
    expect(sun[0]).toEqual([null, null, null, null, null, "2026-05-01", "2026-05-02"])
    expect(sun).toHaveLength(6)
    expect(sun[5]).toEqual(["2026-05-31", null, null, null, null, null, null])
    const mon = monthGrid("2026-05", 1)
    expect(mon[0]).toEqual([null, null, null, null, "2026-05-01", "2026-05-02", "2026-05-03"])
    expect(mon).toHaveLength(5)
    expect(mon[4].at(-1)).toBe("2026-05-31")
  })
  it("orders weekday headers by week start", () => {
    expect(weekdayLabels(0).map((w) => w.short)).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
    expect(weekdayLabels(1)[0]).toEqual({ short: "Mon", long: "Monday" })
  })
})

describe("monthLabel and arrowTarget", () => {
  it("adds the year only outside the current year", () => {
    expect(monthLabel("2026-05", "2026-10-02")).toBe("May")
    expect(monthLabel("2025-12", "2026-10-02")).toBe("December 2025")
  })
  it("moves by day and week, clamped to the selectable range", () => {
    expect(arrowTarget("2026-05-10", "ArrowRight", "2026-05-30")).toBe("2026-05-11")
    expect(arrowTarget("2026-05-10", "ArrowUp", "2026-05-30")).toBe("2026-05-03")
    expect(arrowTarget("2026-05-01", "ArrowLeft", "2026-05-30")).toBe("2026-04-30")
    expect(arrowTarget("2026-05-27", "ArrowDown", "2026-05-30")).toBe("2026-05-30")
    expect(arrowTarget("2026-04-08", "ArrowUp", "2026-05-30", "2026-04-06")).toBe("2026-04-06")
    expect(arrowTarget("2026-05-10", "Enter", "2026-05-30")).toBeNull()
  })
})
