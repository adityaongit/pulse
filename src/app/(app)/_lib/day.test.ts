import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import type { Config } from "@/server/config"
import { pageDay } from "./day"

const h = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`)
  }),
}))
vi.mock("next/navigation", () => ({ redirect: h.redirect }))
vi.mock("@/server/config", () => ({ getConfig: () => ({ timeZone: "Asia/Kolkata" }) as Config }))

const sp = (q: Record<string, string>) => Promise.resolve(q)

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-02T20:00:00Z") }) // Oct 3 in Kolkata
})
afterAll(() => vi.useRealTimers())
beforeEach(() => {
  h.redirect.mockClear()
})

describe("pageDay", () => {
  it("a future day redirects without d, keeping r", async () => {
    await expect(pageDay(sp({ d: "2026-10-04", r: "w" }), "/strain")).rejects.toThrow("redirect:/strain?r=w")
    expect(h.redirect).toHaveBeenCalledWith("/strain?r=w")
  })

  it("a future day alone redirects to the bare path", async () => {
    await expect(pageDay(sp({ d: "2026-10-04" }), "/strain")).rejects.toThrow("redirect:/strain")
    expect(h.redirect).toHaveBeenCalledWith("/strain")
  })

  it("a valid day passes through; r=w turns on weekly", async () => {
    expect(await pageDay(sp({ d: "2026-09-30" }), "/strain")).toMatchObject({ d: "2026-09-30", today: "2026-10-03", weekly: false })
    expect(await pageDay(sp({ d: "2026-09-30", r: "w" }), "/strain")).toMatchObject({ d: "2026-09-30", weekly: true })
    expect(h.redirect).not.toHaveBeenCalled()
  })
})
