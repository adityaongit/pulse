import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { BehavioursVM } from "@/server/queries/types"
import { Behaviours } from "./Behaviours"

const h = vi.hoisted(() => ({ save: vi.fn<(input: { tags: string[] }) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/server/actions/journal", () => ({ addCustomTag: vi.fn(), saveBehaviors: h.save, loadBehaviours: vi.fn() }))

const tag = (t: string, section: BehavioursVM["tags"][number]["section"], hidden = false) => ({ tag: t, label: t === "cold" ? "Cold shower" : t, question: `${t}?`, section, isDefault: section !== "custom", hidden })
const vm: BehavioursVM = { tags: [tag("alcohol", "nighttime"), tag("late_meal", "nighttime", true), tag("cold", "custom")] }

describe("Behaviours", () => {
  it("lists the chosen behaviours first, filters by tab and search, and saves the selection", async () => {
    render(<Behaviours vm={vm} />)
    const selected = screen.getByRole("region", { name: "Selected" })
    expect(within(selected).getAllByRole("checkbox").map((c) => c.id)).toEqual(["behaviour-alcohol", "behaviour-cold"])
    // A hidden default is only "not selected"; the catalogue joins it there.
    const rest = screen.getByRole("region", { name: "Not selected" })
    expect(within(rest).getByRole("checkbox", { name: /^Late meal/ })).not.toBeChecked()
    expect(within(rest).getByRole("checkbox", { name: /^Mouth tape/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save behaviours" })).not.toBeInTheDocument()

    // Ticking a row keeps it in place.
    fireEvent.click(within(rest).getByRole("checkbox", { name: /^Mouth tape/ }))
    expect(within(screen.getByRole("region", { name: "Not selected" })).getByRole("checkbox", { name: /^Mouth tape/ })).toBeChecked()
    fireEvent.click(within(selected).getByRole("checkbox", { name: /^Alcohol/ }))

    fireEvent.click(screen.getByRole("radio", { name: "Yours" }))
    expect(screen.getAllByRole("checkbox").map((c) => c.id)).toEqual(["behaviour-cold"])
    fireEvent.click(screen.getByRole("radio", { name: "All" }))
    fireEvent.change(screen.getByRole("searchbox", { name: "Search for behaviours" }), { target: { value: "electrolyte" } })
    expect(screen.getAllByRole("checkbox").map((c) => c.id)).toEqual(["behaviour-electrolytes"])

    fireEvent.click(screen.getByRole("button", { name: "Save behaviours" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledOnce())
    expect(new Set(h.save.mock.calls[0][0].tags)).toEqual(new Set(["cold", "mouth_tape"]))
  })
})
