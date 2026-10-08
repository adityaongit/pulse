import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { CoachGlance } from "./CoachGlance"

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a> }))
vi.mock("../../coach/Coach", () => ({ CoachGlyph: () => <span /> }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

it("shows Analyzing…, then the coach's line, linking to a question about the workout; asks once per session", async () => {
  const fetch = vi.fn(async () => Response.json({ text: "Your easiest run this month." }))
  vi.stubGlobal("fetch", fetch)
  render(<CoachGlance id="ex-1" question="Tell me about my running on today." />)
  expect(screen.getByText("Analyzing…")).toBeInTheDocument()
  expect(await screen.findByText("Your easiest run this month.")).toBeInTheDocument()
  expect(screen.getByRole("link").getAttribute("href")).toBe(`/coach?q=${encodeURIComponent("Tell me about my running on today.")}`)
  cleanup()
  render(<CoachGlance id="ex-1" question="q" />)
  expect(await screen.findByText("Your easiest run this month.")).toBeInTheDocument()
  expect(fetch).toHaveBeenCalledOnce()
})

it("hides itself when the coach can't answer", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "key" }, { status: 409 })))
  render(<CoachGlance id="ex-2" question="q" />)
  await waitFor(() => expect(screen.queryByRole("link")).not.toBeInTheDocument())
})
