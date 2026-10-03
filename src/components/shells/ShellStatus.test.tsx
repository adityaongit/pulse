import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ShellStatusProvider, useShellCalendar, useShellStatus, type ShellStatus } from "./ShellStatus"

const base: ShellStatus = {
  mode: "google",
  sync: { state: "ok", lastSuccessAt: 1 },
  connection: "connected",
  today: "2026-10-03",
  firstDay: "2026-04-06",
  timeZone: "Asia/Kolkata",
}

function setup() {
  const renders = { calendar: 0, status: 0 }
  function Calendar() {
    useShellCalendar()
    renders.calendar++
    return null
  }
  function Status() {
    useShellStatus()
    renders.status++
    return null
  }
  // Memoised children, as a page's subtree is: only a context change re-renders them.
  const kids = (
    <>
      <Calendar />
      <Status />
    </>
  )
  const ui = (v: ShellStatus) => <ShellStatusProvider value={v}>{kids}</ShellStatusProvider>
  return { renders, ui }
}

describe("ShellStatusProvider", () => {
  it("a sync re-renders status readers only; an identical refresh re-renders nobody; a new day re-renders both", () => {
    const { renders, ui } = setup()
    const r = render(ui(base))
    expect(renders).toEqual({ calendar: 1, status: 1 })
    r.rerender(ui({ ...base, sync: { state: "ok", lastSuccessAt: 2 } }))
    expect(renders).toEqual({ calendar: 1, status: 2 })
    r.rerender(ui({ ...base, sync: { state: "ok", lastSuccessAt: 2 } }))
    expect(renders).toEqual({ calendar: 1, status: 2 })
    r.rerender(ui({ ...base, sync: { state: "ok", lastSuccessAt: 2 }, today: "2026-10-04" }))
    expect(renders).toEqual({ calendar: 2, status: 3 })
  })
})
