import { fireEvent, render, screen, within } from "@testing-library/react"
import { expect, it, vi } from "vitest"
import { SelectActivity } from "./LogActivity"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

it("Select Activity lists recent kinds first, then A to Z, and filters by tab and search", () => {
  const onSelect = vi.fn()
  render(<SelectActivity recent={["run", "strength", "workout"]} onSelect={onSelect} />)
  const recent = screen.getByRole("region", { name: "Most recent" })
  expect(within(recent).getAllByRole("button").map((b) => b.textContent)).toEqual(["Running", "Weightlifting"])
  fireEvent.click(screen.getByRole("radio", { name: "Sleep" }))
  expect(screen.queryByRole("region", { name: "Most recent" })).not.toBeInTheDocument()
  expect(within(screen.getByRole("region", { name: "All A-Z" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Nap"])
  fireEvent.click(screen.getByRole("radio", { name: "All" }))
  fireEvent.change(screen.getByRole("searchbox", { name: "Search for activities" }), { target: { value: "ten" } })
  fireEvent.click(screen.getByRole("button", { name: "Table tennis" }))
  expect(onSelect).toHaveBeenCalledWith("table_tennis")
})
