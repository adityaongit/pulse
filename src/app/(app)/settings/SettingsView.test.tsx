import { fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SettingsVM } from "@/server/queries/types"
import { SettingsView } from "./SettingsView"

// The Disconnect button's server action touches the database; the view only needs its shape.
vi.mock("./actions", () => ({ disconnectGoogle: vi.fn() }))
vi.mock("@/server/actions/profile", () => ({ saveProfileAction: vi.fn() }))
vi.mock("@/server/actions/avatar", () => ({ uploadAvatar: vi.fn(), removeAvatar: vi.fn() }))
vi.mock("@/server/actions/mcp", () => ({ createMcpTokenAction: vi.fn(), revokeMcpTokenAction: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/settings", useSearchParams: () => new URLSearchParams() }))

const NOW = Date.parse("2026-10-02T10:00:00Z")
const base: SettingsVM = {
  mode: "google",
  source: { label: "Google Health", status: "connected" },
  import: null,
  sync: [
    { key: "heart-rate", label: "Heart rate", lastSuccessAt: NOW - 12 * 60_000, status: "ok", error: null },
    { key: "sleep", label: "Sleep", lastSuccessAt: NOW - 3 * 3600_000, status: "stale", error: null },
    { key: "steps", label: "Steps", lastSuccessAt: null, status: "error", error: "HTTP 429" },
  ],
  profile: { birthDate: "1990-01-01", age: 36, sex: "male", maxHr: 186, maxHrSource: "estimated", timeZone: "Asia/Kolkata", timeFormat: "24", heightCm: null },
  version: "0.1.0",
  scoringVersion: 2,
}
const account = { email: "me@example.com", avatar: null, customPhoto: false }
const source = () => screen.getByRole("region", { name: "Data source" })

describe("Settings view", () => {
  // The section follows the URL (?s=), which jsdom keeps between tests.
  beforeEach(() => history.replaceState(null, "", "/"))

  it("journey 9: not connected offers Connect Google to /oauth/start", () => {
    render(<SettingsView initial="source" vm={{ ...base, source: { label: "Google Health", status: "not_connected" } }} now={NOW} account={account} />)
    expect(within(source()).getByText("Not connected")).toBeInTheDocument()
    expect(within(source()).getByRole("link", { name: "Connect Google" })).toHaveAttribute("href", "/oauth/start")
  })

  it("journey 9: importing shows backfill progress", () => {
    render(<SettingsView initial="source" vm={{ ...base, import: { done: 42, total: 180 } }} now={NOW} account={account} />)
    expect(screen.getByText("Importing history… 42 of 180 days")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Import progress" })).toBeInTheDocument()
  })

  it("journey 10: revoked asks to reconnect", () => {
    render(<SettingsView initial="source" vm={{ ...base, source: { label: "Google Health", status: "revoked" } }} now={NOW} account={account} />)
    expect(within(source()).getByText("Access revoked")).toBeInTheDocument()
    expect(within(source()).getByRole("link", { name: "Reconnect Google" })).toHaveAttribute("href", "/oauth/start")
  })

  it("a grant from before the write scopes asks for new permissions with Reconnect Google, and keeps syncing", () => {
    render(<SettingsView initial="source" vm={{ ...base, source: { label: "Google Health", status: "connected", needsPermissions: true } }} now={NOW} account={account} />)
    const note = within(source()).getByRole("note", { name: "Pulse needs new permissions" })
    expect(within(note).getByRole("link", { name: "Reconnect Google" })).toHaveAttribute("href", "/oauth/start")
    expect(within(source()).getByRole("button", { name: "Sync now" })).toBeInTheDocument()
  })

  it("no paired device explains how to pair, and keeps Sync now and Disconnect", () => {
    render(<SettingsView initial="source" vm={{ ...base, source: { label: "Google Health", status: "no_device" } }} now={NOW} account={account} />)
    expect(within(source()).getByText("No Fitbit device")).toBeInTheDocument()
    expect(within(source()).getByText(/Pair your Fitbit Air in the Google Health app/)).toBeInTheDocument()
    expect(within(source()).getByRole("button", { name: "Sync now" })).toBeInTheDocument()
    expect(within(source()).getByRole("button", { name: "Disconnect" })).toBeInTheDocument()
  })

  it("connected offers Sync now and Disconnect; failing types open the per-type list", () => {
    render(<SettingsView initial="source" vm={base} now={NOW} account={account} />)
    expect(within(source()).getByRole("button", { name: "Sync now" })).toBeInTheDocument()
    expect(within(source()).getByRole("button", { name: "Disconnect" })).toBeInTheDocument()
    expect(within(source()).getByText("1 failing")).toBeInTheDocument()
    expect(source().querySelector("details")).toHaveAttribute("open")
    expect(screen.getByText("12 minutes ago")).toBeInTheDocument()
    expect(screen.getByText("HTTP 429")).toBeInTheDocument()
  })

  it("demo mode has no actions and names the switch; Settings is configuration only (About lives in More)", () => {
    render(<SettingsView initial="source" vm={{ ...base, mode: "demo", source: { label: "Demo data", status: "demo" } }} now={NOW} account={account} />)
    expect(within(source()).queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText(/DATA_SOURCE=google/)).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "About" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: /^(Account|Data source|App)/ }).map((b) => b.textContent?.split(/(?=[A-Z][a-z]+ )/)[0])).toHaveLength(3)
  })

  it("profile is editable", () => {
    render(<SettingsView initial="account" vm={base} now={NOW} account={account} />)
    const profile = screen.getByRole("region", { name: "Profile" })
    expect(within(profile).getByRole("button", { name: "Edit profile" })).toBeInTheDocument()
    expect(within(profile).getByText("Not set")).toBeInTheDocument()
    expect(within(profile).getByText("24-hour")).toBeInTheDocument()
  })

  it("shows a 12-hour clock when that is the profile preference", () => {
    render(<SettingsView initial="account" vm={{ ...base, profile: { ...base.profile, timeFormat: "12" } }} now={NOW} account={account} />)
    expect(within(screen.getByRole("region", { name: "Profile" })).getByText("12-hour")).toBeInTheDocument()
  })

  it("opens the section ?s= names (More's Account & settings rows), an older name too, the first with none", () => {
    const { unmount } = render(<SettingsView vm={base} now={NOW} account={account} />)
    expect(screen.getByRole("region", { name: "Account" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Data source" })).not.toBeInTheDocument()
    unmount()
    const app = render(<SettingsView initial="app" vm={base} now={NOW} account={account} />)
    expect(screen.getByRole("region", { name: "Appearance" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Account" })).not.toBeInTheDocument()
    app.unmount()
    render(<SettingsView initial="sync" vm={base} now={NOW} account={account} />)
    expect(source()).toBeInTheDocument()
  })

  it("the sections panel switches section and the URL follows", () => {
    render(<SettingsView vm={base} now={NOW} account={account} />)
    fireEvent.click(within(screen.getByRole("complementary", { name: "Settings sections" })).getByRole("button", { name: "Data source" }))
    expect(location.search).toBe("?s=source")
    expect(source()).toBeInTheDocument()
  })

  it("account holds the profile too", () => {
    render(<SettingsView initial="account" vm={base} now={NOW} account={account} />)
    expect(screen.getByRole("region", { name: "Profile" })).toBeInTheDocument()
  })

  it("agents is a section of its own, with the account's tokens", () => {
    render(<SettingsView initial="agents" vm={base} now={NOW} account={account} tokens={[{ id: 1, name: "Hermes", createdAt: 1, lastUsedAt: null }]} />)
    expect(within(screen.getByRole("region", { name: "Agents" })).getByText("Hermes")).toBeInTheDocument()
  })

  it("the account can sign out with a plain form post", () => {
    render(<SettingsView vm={base} now={NOW} account={account} />)
    expect(within(screen.getByRole("region", { name: "Account" })).getByText("me@example.com")).toBeInTheDocument()
    const out = screen.getByRole("button", { name: "Sign out" })
    expect(out.closest("form")).toHaveAttribute("action", "/logout")
    expect(out.closest("form")).toHaveAttribute("method", "post")
  })
})
