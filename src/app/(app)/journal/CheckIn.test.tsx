import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { JournalTag } from "@/server/queries/types"
import { CheckIn, changedEntries } from "./CheckIn"

const h = vi.hoisted(() => ({ save: vi.fn<(input: unknown) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })) }))
vi.mock("@/server/actions/journal", () => ({ saveJournalEntry: h.save, addCustomTag: vi.fn() }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/journal",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

describe("changedEntries", () => {
  it("sends changed answers, and null for a cleared saved answer", () => {
    expect(changedEntries({ alcohol: undefined, sauna: 0, travel: 1, illness: 1 }, { alcohol: 1, sauna: 1, illness: 1 })).toEqual([
      ["alcohol", null],
      ["sauna", false],
      ["travel", true],
    ])
  })

  it("an unsaved pick cleared again sends nothing", () => {
    expect(changedEntries({ alcohol: undefined }, {})).toEqual([])
  })
})

describe("CheckIn", () => {
  it("unselecting a saved Yes and saving clears it", async () => {
    const tags: JournalTag[] = [{ tag: "alcohol", label: "Alcohol", group: "evening", isDefault: true, hidden: false }]
    render(
      <CheckIn
        day="2026-10-02"
        dayLabel="Fri, Oct 2"
        tags={tags}
        checkIn={{ done: true, entries: { alcohol: 1 }, yes: [{ tag: "alcohol", label: "Alcohol" }] }}
      />
    )
    fireEvent.click(screen.getByRole("button", { name: "Edit check-in" }))
    const yes = within(await screen.findByRole("radiogroup", { name: "Alcohol" })).getByRole("radio", { name: "Yes" })
    expect(yes).toHaveAttribute("aria-checked", "true")
    fireEvent.click(yes)
    expect(yes).toHaveAttribute("aria-checked", "false")
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledExactlyOnceWith({ day: "2026-10-02", tag: "alcohol", value: null }))
  })
})
