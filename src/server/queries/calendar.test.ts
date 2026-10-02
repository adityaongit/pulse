import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { Db } from "../db"
import { cleanup, ctxFor, dayAt, seeded } from "../testing"
import { getCalendarMonth } from "./calendar"
import { getHome } from "./home"

afterAll(cleanup)

let db: Db
beforeAll(() => {
  db = seeded()
})

describe("getCalendarMonth", () => {
  it("returns every day of the month with the Home dials' values", () => {
    const vm = getCalendarMonth("2026-09", ctxFor(db))
    expect(vm.month).toBe("2026-09")
    expect(vm.days).toHaveLength(30)
    expect(vm.days[0].day).toBe("2026-09-01")
    expect(vm.days.at(-1)!.day).toBe("2026-09-30")
    const day = dayAt(170)
    const { dials } = getHome(day, ctxFor(db))
    const row = vm.days.find((x) => x.day === day)!
    expect(row.recovery).toBe(dials.recovery.value)
    expect(row.strain).toBe(dials.strain.value)
    expect(row.sleep).toBe(dials.sleep.value)
    expect(vm.days.filter((x) => x.recovery !== null).length).toBeGreaterThan(20)
    const strains = vm.days.flatMap((x) => (x.strain === null ? [] : [x.strain]))
    expect(Math.min(...strains)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...strains)).toBeLessThanOrEqual(21)
  })
  it("has nulls before the first stored day and after today", () => {
    expect(getCalendarMonth("2026-03", ctxFor(db)).days.every((x) => x.recovery === null && x.strain === null && x.sleep === null)).toBe(true)
    const oct = getCalendarMonth("2026-10", ctxFor(db)).days
    expect(oct).toHaveLength(31)
    expect(oct.slice(2).every((x) => x.recovery === null && x.strain === null)).toBe(true)
  })
  it("rejects a malformed month", () => {
    expect(() => getCalendarMonth("2026-13", ctxFor(db))).toThrow()
    expect(() => getCalendarMonth("2026-9", ctxFor(db))).toThrow()
  })
})
