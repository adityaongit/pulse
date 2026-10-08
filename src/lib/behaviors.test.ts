import { expect, it } from "vitest"
import { DEFAULT_JOURNAL_TAGS } from "@/server/journalTags"
import { BEHAVIORS, behavior, followUpText, questionOf } from "./behaviors"

it("keys are unique, A to Z, and cover the nine defaults", () => {
  const keys = BEHAVIORS.map((b) => b.key)
  expect(new Set(keys).size).toBe(keys.length)
  const labels = BEHAVIORS.map((b) => b.label.toLowerCase())
  expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
  for (const d of DEFAULT_JOURNAL_TAGS) expect(behavior(d.tag)?.label).toBe(d.label)
})

it("asks a custom behaviour as a question and formats follow-ups", () => {
  expect(questionOf("cold_shower", "Cold shower")).toBe("Cold shower?")
  expect(questionOf("illness", "Illness")).toBe("Feeling sick or ill?")
  const clock = behavior("caffeine")!.followUp!
  expect(followUpText(clock, 15 * 60 + 30)).toBe("3:30 PM")
  expect(followUpText(clock, 12 * 60)).toBe("12:00 PM")
  expect(followUpText(behavior("alcohol")!.followUp!, 3)).toBe("3")
})
