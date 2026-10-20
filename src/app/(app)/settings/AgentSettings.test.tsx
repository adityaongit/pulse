import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createMcpTokenAction, revokeMcpTokenAction } from "@/server/actions/mcp"
import { AgentSettings } from "./AgentSettings"

vi.mock("@/server/actions/mcp", () => ({ createMcpTokenAction: vi.fn(), revokeMcpTokenAction: vi.fn() }))
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const NOW = Date.parse("2026-10-02T10:00:00Z")
const section = () => screen.getByRole("region", { name: "Agents" })

describe("Settings › Agents", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists each token by name with its last use, never the token itself", () => {
    render(
      <AgentSettings
        now={NOW}
        tokens={[
          { id: 1, name: "Hermes", createdAt: 1, lastUsedAt: NOW / 1000 - 3 * 3600 },
          { id: 2, name: "Spare", createdAt: 2, lastUsedAt: null },
        ]}
      />,
    )
    expect(within(section()).getByText("Hermes")).toBeInTheDocument()
    expect(within(section()).getByText(/Used 3\s+hours ago/)).toBeInTheDocument()
    expect(within(section()).getByText("Never used")).toBeInTheDocument()
    expect(within(section()).getAllByRole("button", { name: /^Revoke / })).toHaveLength(2)
  })

  it("creating a token shows it once, with the endpoint, and refreshes the list", async () => {
    vi.mocked(createMcpTokenAction).mockResolvedValue({ ok: true, data: "pulse_secret-value" })
    render(<AgentSettings now={NOW} tokens={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/Which agent/), { target: { value: "Hermes" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => expect(screen.getByLabelText("Access token")).toHaveValue("pulse_secret-value"))
    expect(createMcpTokenAction).toHaveBeenCalledWith("Hermes")
    expect(screen.getByLabelText("MCP endpoint")).toHaveValue(`${window.location.origin}/api/mcp`)
    expect(screen.getByText(/won’t be shown again/)).toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it("a refused token shows no token", async () => {
    vi.mocked(createMcpTokenAction).mockResolvedValue({ ok: false, error: "You can have 10 tokens. Revoke one first." })
    render(<AgentSettings now={NOW} tokens={[]} />)
    fireEvent.change(screen.getByPlaceholderText(/Which agent/), { target: { value: "One too many" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => expect(createMcpTokenAction).toHaveBeenCalled())
    expect(screen.queryByLabelText("Access token")).not.toBeInTheDocument()
  })

  it("revoking calls the action with that token's id", async () => {
    vi.mocked(revokeMcpTokenAction).mockResolvedValue({ ok: true, data: undefined })
    render(<AgentSettings now={NOW} tokens={[{ id: 7, name: "Hermes", createdAt: 1, lastUsedAt: null }]} />)
    fireEvent.click(screen.getByRole("button", { name: "Revoke Hermes" }))
    await waitFor(() => expect(revokeMcpTokenAction).toHaveBeenCalledWith(7))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })
})
