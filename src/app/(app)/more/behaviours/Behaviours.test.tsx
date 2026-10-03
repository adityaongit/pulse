import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { BehavioursVM } from "@/server/queries/types"
import { Behaviours, moved } from "./Behaviours"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/server/actions/journal", () => ({ addCustomTag: vi.fn(), reorderBehaviours: vi.fn(), setBehaviourHidden: vi.fn() }))

const tag = (t: string, group: BehavioursVM["tags"][number]["group"], hidden = false) => ({ tag: t, label: t, group, isDefault: group !== "custom", hidden, answers: 3 })

describe("moved", () => {
  it("swaps with the neighbour and stops at the ends", () => {
    expect(moved(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"])
    expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"])
    expect(moved(["a", "b"], 0, -1)).toEqual(["a", "b"])
    expect(moved(["a", "b"], 1, 1)).toEqual(["a", "b"])
  })
})

describe("Behaviours", () => {
  it("groups behaviours, marks hidden ones, and disables moves past a group's ends", () => {
    render(<Behaviours vm={{ tags: [tag("alcohol", "evening"), tag("late_meal", "evening", true), tag("sauna", "recovery"), tag("cold", "custom")] }} />)
    const evening = screen.getByRole("region", { name: "Evening" })
    expect(within(evening).getByRole("switch", { name: "Show alcohol in the check-in" })).toBeChecked()
    expect(within(evening).getByRole("switch", { name: "Show late_meal in the check-in" })).not.toBeChecked()
    expect(within(evening).getByText("Hidden")).toBeInTheDocument()
    expect(within(evening).getByRole("button", { name: "Move alcohol up" })).toBeDisabled()
    expect(within(evening).getByRole("button", { name: "Move late_meal down" })).toBeDisabled()
    // A one-item group has nothing to reorder.
    expect(within(screen.getByRole("region", { name: "Recovery" })).queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Your behaviours" })).getByLabelText("Add a behaviour")).toBeInTheDocument()
  })
})
