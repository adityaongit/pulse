import { describe, expect, it } from "vitest"
import { clamp01, collapseProgress, lerp, timelineOffset } from "./collapse"

describe("collapseProgress", () => {
  it("maps the collapse distance linearly onto 0-1", () => {
    expect(collapseProgress(100, 100, 228)).toBe(0)
    expect(collapseProgress(164, 100, 228)).toBe(0.5)
    expect(collapseProgress(228, 100, 228)).toBe(1)
  })

  it("clamps before the start and past the end", () => {
    expect(collapseProgress(0, 100, 228)).toBe(0)
    expect(collapseProgress(-40, 100, 228)).toBe(0) // iOS rubber band
    expect(collapseProgress(5000, 100, 228)).toBe(1)
  })

  it("steps at the end when the distance is empty", () => {
    expect(collapseProgress(99, 100, 100)).toBe(0)
    expect(collapseProgress(100, 100, 100)).toBe(1)
  })
})

describe("timelineOffset", () => {
  it("places progress on the page's scroll range", () => {
    expect(timelineOffset(0, 100, 228, 1000)).toBe(0.1)
    expect(timelineOffset(1, 100, 228, 1000)).toBe(0.228)
    expect(timelineOffset(0.5, 100, 228, 1000)).toBeCloseTo(0.164)
  })

  it("clamps to the timeline when the page is too short to collapse fully", () => {
    expect(timelineOffset(1, 100, 228, 200)).toBe(1)
    expect(timelineOffset(0, 100, 228, 0)).toBe(1)
  })
})

describe("helpers", () => {
  it("clamp01 and lerp", () => {
    expect(clamp01(-1)).toBe(0)
    expect(clamp01(2)).toBe(1)
    expect(lerp(96, 22, 0.5)).toBe(59)
  })
})
