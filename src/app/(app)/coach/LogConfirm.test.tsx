import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LogConfirm, logPreview } from "./LogConfirm"

const asking = { state: "approval-requested", input: { ml: 500, at: "2026-10-09T13:00" }, approval: { id: "ap-1" } }

describe("LogConfirm", () => {
  it("shows the entry and sends the answer for its approval id", () => {
    const onAnswer = vi.fn()
    render(<LogConfirm name="log_water" part={asking} onAnswer={onAnswer} />)
    expect(screen.getByRole("group", { name: "Log Water?" })).toHaveTextContent("500 ml")
    expect(screen.getByText("2026-10-09 at 13:00")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Log" }))
    fireEvent.click(screen.getByRole("button", { name: "Don’t log" }))
    expect(onAnswer.mock.calls).toEqual([["ap-1", true], ["ap-1", false]])
  })

  it("an open confirmation that isn't on the newest answer offers no buttons", () => {
    render(<LogConfirm name="log_water" part={asking} />)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByText("Not logged.")).toBeInTheDocument()
  })

  it("says what happened: logged, declined, or the reason it failed", () => {
    const { rerender } = render(<LogConfirm name="log_water" part={{ ...asking, state: "output-available", output: { logged: true } }} />)
    expect(screen.getByText("Logged Water · 500 ml")).toBeInTheDocument()
    rerender(<LogConfirm name="log_water" part={{ ...asking, state: "output-denied" }} />)
    expect(screen.getByText("Not logged: Water · 500 ml")).toBeInTheDocument()
    rerender(<LogConfirm name="log_water" part={{ ...asking, state: "output-available", output: { logged: false, error: "reconnect" } }} />)
    expect(screen.getByText(/reconnect Google in Settings/)).toBeInTheDocument()
  })
})

describe("logPreview", () => {
  it("reads like the log list, with body fat and period dates", () => {
    expect(logPreview("log_food", { meal: "LUNCH", kcal: 650, protein: 30 })).toEqual({ title: "Lunch", detail: "650 kcal, 30 g protein", when: "Now" })
    expect(logPreview("log_weight", { kg: 72.4, fatPct: 18 }).detail).toBe("72.4 kg, 18% body fat")
    expect(logPreview("log_period", { start: "2026-10-05", end: "2026-10-09" })).toEqual({ title: "Period", detail: "5 days", when: "2026-10-05 to 2026-10-09" })
  })
})
