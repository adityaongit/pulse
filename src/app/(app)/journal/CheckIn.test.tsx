import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { JournalTag } from "@/server/queries/types"
import { ShellStatusProvider } from "@/components/shells/ShellStatus"
import { CheckIn, CheckInSheet, changedEntries } from "./CheckIn"

const tags: JournalTag[] = [{ tag: "alcohol", label: "Alcohol", question: "Had any alcohol?", section: "nighttime", isDefault: true, hidden: false }]
const checkIn = { done: true, entries: { alcohol: 1 }, details: {}, note: "", yes: [{ tag: "alcohol", label: "Alcohol" }] }
const h = vi.hoisted(() => ({
  save: vi.fn<(input: unknown) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })),
  load: vi.fn(),
}))
vi.mock("@/server/actions/journal", () => ({ saveJournalEntry: h.save, addCustomTag: vi.fn(), loadCheckIn: h.load }))
vi.mock("next/navigation", async () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: (await import("@/components/shells/testing")).useLocationSearchParams,
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

describe("CheckInSheet", () => {
  const app = (
    <ShellStatusProvider value={{ mode: "demo", sync: { state: "ok", lastSuccessAt: 1 }, connection: "connected", today: "2026-10-03" }}>
      <CheckIn dayLabel="Fri, Oct 2" checkIn={checkIn} />
      <CheckInSheet />
    </ShellStatusProvider>
  )

  it("opens over the screen for its day; unselecting a saved Yes and saving clears it and closes", async () => {
    window.history.replaceState(null, "", "/strain?d=2026-10-02")
    h.load.mockResolvedValue({ ok: true, data: { tags, checkIn } })
    const back = vi.spyOn(window.history, "back").mockImplementation(() => window.history.replaceState(null, "", "/strain?d=2026-10-02"))
    render(app)
    fireEvent.click(screen.getByRole("button", { name: "Edit check-in" }))
    expect(window.location.pathname + window.location.search).toBe("/strain?d=2026-10-02&checkin=1")
    const yes = within(await screen.findByRole("radiogroup", { name: "Alcohol" })).getByRole("radio", { name: "Yes" })
    expect(h.load).toHaveBeenCalledWith("2026-10-02")
    expect(yes).toHaveAttribute("aria-checked", "true")
    fireEvent.click(yes)
    expect(yes).toHaveAttribute("aria-checked", "false")
    fireEvent.click(screen.getByRole("button", { name: "Save check-in" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledExactlyOnceWith({ day: "2026-10-02", tag: "alcohol", value: null }))
    await waitFor(() => expect(back).toHaveBeenCalledOnce())
    expect(window.location.search).toBe("?d=2026-10-02")
    back.mockRestore()
  })

  it("Back with unsaved answers asks first, and Keep editing restores the entry", async () => {
    window.history.replaceState(null, "", "/?checkin=1")
    h.load.mockResolvedValue({ ok: true, data: { tags, checkIn } })
    render(app)
    const yes = within(await screen.findByRole("radiogroup", { name: "Alcohol" })).getByRole("radio", { name: "Yes" })
    fireEvent.click(yes)
    act(() => {
      window.history.replaceState(null, "", "/")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(await screen.findByRole("dialog", { name: "Discard changes?" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }))
    expect(window.location.search).toBe("?checkin=1")
    expect(yes).toHaveAttribute("aria-checked", "false")
  })
})
