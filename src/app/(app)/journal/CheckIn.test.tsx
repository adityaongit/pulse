import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { JournalTag } from "@/server/queries/types"
import { ShellStatusProvider } from "@/components/shells/ShellStatus"
import { CheckIn, CheckInSheet, changedEntries } from "./CheckIn"

const tags: JournalTag[] = [
  { tag: "alcohol", label: "Alcohol", question: "Had any alcohol?", section: "nighttime", isDefault: true, hidden: false },
  { tag: "illness", label: "Illness", question: "Feeling sick or ill?", section: "status", isDefault: true, hidden: false },
]
const strip = [{ day: "2026-10-02", done: true }, { day: "2026-10-03", done: false }]
const checkIn = { done: true, entries: { alcohol: 1 }, details: {}, note: "", yes: [{ tag: "alcohol", label: "Alcohol" }] }
const h = vi.hoisted(() => ({
  save: vi.fn<(input: unknown) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })),
  note: vi.fn<(input: unknown) => Promise<{ ok: true; data: undefined }>>(async () => ({ ok: true, data: undefined })),
  load: vi.fn(),
}))
vi.mock("@/server/actions/journal", () => ({ saveJournalEntry: h.save, saveJournalNote: h.note, addCustomTag: vi.fn(), loadCheckIn: h.load }))
vi.mock("next/navigation", async () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => window.location.pathname,
  useSearchParams: (await import("@/components/shells/testing")).useLocationSearchParams,
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

describe("changedEntries", () => {
  it("sends changed answers and follow-ups, and null for a cleared saved answer", () => {
    expect(changedEntries({ alcohol: undefined, sauna: 0, travel: 1, illness: 1, caffeine: 1 }, { caffeine: 600 }, { alcohol: 1, sauna: 1, illness: 1, caffeine: 1 }, {})).toEqual([
      { tag: "alcohol", value: null, detail: null },
      { tag: "sauna", value: false, detail: null },
      { tag: "travel", value: true, detail: null },
      { tag: "caffeine", value: true, detail: 600 },
    ])
  })

  it("an unsaved pick cleared again sends nothing; a follow-up on a no is ignored", () => {
    expect(changedEntries({ alcohol: undefined }, {}, {}, {})).toEqual([])
    expect(changedEntries({ alcohol: 0 }, { alcohol: 3 }, { alcohol: 0 }, {})).toEqual([])
  })
})

describe("CheckInSheet", () => {
  const app = (
    <ShellStatusProvider value={{ mode: "demo", sync: { state: "ok", lastSuccessAt: 1 }, connection: "connected", today: "2026-10-03" }}>
      <CheckIn dayLabel="Fri, Oct 2" checkIn={checkIn} />
      <CheckInSheet />
    </ShellStatusProvider>
  )
  const answers = async (question: string) => within(await screen.findByRole("radiogroup", { name: question }))

  it("opens over the screen for its day; a cleared Yes and a note save, Saved shows, then it closes", async () => {
    localStorage.clear()
    window.history.replaceState(null, "", "/strain?d=2026-10-02")
    h.load.mockResolvedValue({ ok: true, data: { tags, checkIn, strip } })
    const back = vi.spyOn(window.history, "back").mockImplementation(() => window.history.replaceState(null, "", "/strain?d=2026-10-02"))
    render(app)
    fireEvent.click(screen.getByRole("button", { name: "Edit check-in" }))
    expect(window.location.pathname + window.location.search).toBe("/strain?d=2026-10-02&checkin=1")
    const yes = (await answers("Had any alcohol?")).getByRole("radio", { name: "Yes" })
    expect(h.load).toHaveBeenCalledWith("2026-10-02")
    expect(screen.getByRole("heading", { name: "What happened on Friday, October 2?" })).toBeInTheDocument()
    expect(yes).toHaveAttribute("aria-checked", "true")
    // A yes opens its follow-up, unset until moved.
    expect(screen.getByRole("slider", { name: "How many drinks?" })).toHaveAttribute("aria-valuetext", "Not set")
    fireEvent.click(yes)
    expect(yes).toHaveAttribute("aria-checked", "false")
    expect(screen.queryByRole("slider")).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "Late dinner out" } })
    fireEvent.click(screen.getByRole("button", { name: "Save journal" }))
    await waitFor(() => expect(h.save).toHaveBeenCalledExactlyOnceWith({ day: "2026-10-02", tag: "alcohol", value: null, detail: null }))
    expect(h.note).toHaveBeenCalledExactlyOnceWith({ day: "2026-10-02", text: "Late dinner out" })
    expect(await screen.findByText("Have a great day!")).toBeInTheDocument()
    await waitFor(() => expect(back).toHaveBeenCalledOnce(), { timeout: 3000 })
    expect(window.location.search).toBe("?d=2026-10-02")
    back.mockRestore()
  })

  it("Back with unsaved answers asks first, and No, complete journal restores the entry", async () => {
    window.history.replaceState(null, "", "/?checkin=1")
    h.load.mockResolvedValue({ ok: true, data: { tags, checkIn, strip } })
    render(app)
    const yes = (await answers("Had any alcohol?")).getByRole("radio", { name: "Yes" })
    fireEvent.click(yes)
    act(() => {
      window.history.replaceState(null, "", "/")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(await screen.findByRole("dialog", { name: "Dismiss journal?" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "No, complete journal" }))
    expect(window.location.search).toBe("?checkin=1")
    expect(yes).toHaveAttribute("aria-checked", "false")
  })

  it("X asks even with nothing changed, until Don't show me this message again", async () => {
    localStorage.clear()
    window.history.replaceState(null, "", "/?checkin=1")
    h.load.mockResolvedValue({ ok: true, data: { tags, checkIn, strip } })
    const back = vi.spyOn(window.history, "back").mockImplementation(() => window.history.replaceState(null, "", "/"))
    render(app)
    await answers("Feeling sick or ill?")
    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    fireEvent.click(await screen.findByRole("checkbox", { name: "Don’t show me this message again" }))
    fireEvent.click(screen.getByRole("button", { name: "Yes, dismiss journal" }))
    await waitFor(() => expect(back).toHaveBeenCalledOnce())
    expect(localStorage.getItem("pulse:journal-dismiss-quiet")).toBe("1")
    back.mockRestore()
  })

  it("moves between days inside the journal and never past today", async () => {
    window.history.replaceState(null, "", "/?checkin=1")
    h.load.mockResolvedValue({ ok: true, data: { tags, checkIn, strip } })
    render(app)
    await answers("Feeling sick or ill?")
    expect(screen.getByRole("button", { name: /^Next day/ })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: /^Previous day/ }))
    await waitFor(() => expect(h.load).toHaveBeenLastCalledWith("2026-10-02"))
    expect(await screen.findByRole("heading", { name: "What happened on Friday, October 2?" })).toBeInTheDocument()
  })
})
