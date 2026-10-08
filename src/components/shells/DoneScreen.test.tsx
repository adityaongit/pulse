import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import { DONE_MS, DoneScreen } from "./DoneScreen"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it("announces the confirmation and closes itself once", () => {
  vi.useFakeTimers()
  const onDone = vi.fn()
  render(<DoneScreen title="Saved" body="Have a great day!" onDone={onDone} />)
  expect(screen.getByRole("status").textContent).toContain("Have a great day!")
  act(() => vi.advanceTimersByTime(DONE_MS - 1))
  expect(onDone).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(DONE_MS))
  expect(onDone).toHaveBeenCalledTimes(1)
})
