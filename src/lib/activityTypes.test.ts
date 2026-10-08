import { expect, it } from "vitest"
import { ACTIVITY_TYPES, activityType } from "./activityTypes"

it("keys are unique and labels run A to Z", () => {
  const keys = ACTIVITY_TYPES.map((a) => a.key)
  expect(new Set(keys).size).toBe(keys.length)
  const labels = ACTIVITY_TYPES.map((a) => a.label.toLowerCase())
  expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  expect(activityType("running")?.kind).toBe("run")
  expect(activityType("nope")).toBeUndefined()
})
