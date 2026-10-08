import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DASHBOARD_METRICS } from "@/lib/dashboard"
import { EditDashboard } from "./EditDashboard"

const h = vi.hoisted(() => ({ save: vi.fn<(input: { keys: string[] }) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })) }))
vi.mock("@/server/actions/dashboard", () => ({ saveDashboard: h.save }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const shown = () =>
  within(screen.getByRole("list", { name: "My Dashboard" }))
    .getAllByRole("listitem")
    .map((li) => li.textContent)
const group = (name: string) => within(screen.getByRole("region", { name }))
const open = () => fireEvent.click(screen.getByRole("button", { name: "Customize My Dashboard" }))
const saved = (keys: string[]) => {
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  return waitFor(() => expect(h.save).toHaveBeenCalledExactlyOnceWith({ keys }))
}

beforeEach(() => h.save.mockClear())

describe("EditDashboard", () => {
  it("lists the shown metrics in order, and every other metric under its group", async () => {
    render(<EditDashboard keys={["steps", "hrv"]} empty={["glucose"]} />)
    open()
    await screen.findByRole("list", { name: "My Dashboard" })
    expect(shown()).toEqual(["Steps", "Heart rate variability"])
    expect(group("Recovery & sleep").getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Resting heart rate",
      "Sleep performance",
      "Recovery",
      "Sleep consistency",
      "Hours of sleep",
      "Restorative sleep (%)",
      "Restorative sleep (hours)",
      "Sleep debt",
      "Stress Monitor",
    ])
    expect(group("Body").getByRole("button", { name: "Add Weight" })).toBeInTheDocument()
    expect(group("Nutrition").getByRole("button", { name: "Add Water" })).toBeInTheDocument()
    expect(group("Vitals").getByRole("button", { name: "Add Blood glucose, no data yet" })).toHaveTextContent("No data yet")
    // Every catalogue metric is offered exactly once, shown or addable.
    expect(screen.getAllByRole("button", { name: /^(Remove|Add) / })).toHaveLength(DASHBOARD_METRICS.length)
  })

  it("reorders by keyboard on the handle, removes and adds, then saves the shown metrics in order and shows Success", async () => {
    render(<EditDashboard keys={["hrv", "rhr", "resp"]} />)
    open()
    const handle = await screen.findByRole("button", { name: "Reorder Respiratory rate, position 3 of 3" })
    fireEvent.keyDown(handle, { key: "ArrowUp" })
    expect(shown()).toEqual(["Heart rate variability", "Respiratory rate", "Resting heart rate"])
    expect(screen.getByRole("button", { name: "Reorder Respiratory rate, position 2 of 3" })).toHaveFocus()
    expect(screen.getByRole("status")).toHaveTextContent("Respiratory rate moved to position 2 of 3")
    fireEvent.click(screen.getByRole("button", { name: "Remove Heart rate variability" }))
    expect(screen.getByRole("button", { name: "Remove Respiratory rate" })).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Add Distance" }))
    expect(screen.getByRole("status")).toHaveTextContent("Distance added at position 3")
    expect(group("Recovery & sleep").getByRole("button", { name: "Add Heart rate variability" })).toBeInTheDocument()
    await saved(["resp", "rhr", "distance"])
    expect(await screen.findByText("Your preferences have been saved.")).toBeInTheDocument()
  })

  it("search narrows the addable metrics by name or group", async () => {
    render(<EditDashboard keys={["hrv"]} />)
    open()
    const search = await screen.findByRole("searchbox", { name: "Search metrics" })
    fireEvent.change(search, { target: { value: "cal" } })
    expect(screen.getAllByRole("button", { name: /^Add / }).map((b) => b.textContent)).toEqual(["Calories", "Active calories", "Calories eaten"])
    fireEvent.change(search, { target: { value: "nutrition" } })
    expect(screen.getAllByRole("button", { name: /^Add / })).toHaveLength(5)
    fireEvent.change(search, { target: { value: "zzz" } })
    expect(screen.getByText("No metric matches “zzz”.")).toBeInTheDocument()
  })

  it("can't save with nothing shown", async () => {
    render(<EditDashboard keys={["sleep"]} />)
    open()
    fireEvent.click(await screen.findByRole("button", { name: "Remove Sleep performance" }))
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    expect(screen.getByRole("alert")).toHaveTextContent("Add at least one metric")
  })
})
