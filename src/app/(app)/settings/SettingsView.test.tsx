import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SettingsVM } from "@/server/queries/types"
import { SettingsView } from "./SettingsView"

// The Disconnect button's server action touches the database; the view only needs its shape.
vi.mock("./actions", () => ({ disconnectGoogle: vi.fn() }))
vi.mock("@/server/actions/profile", () => ({ saveProfileAction: vi.fn() }))
vi.mock("@/server/actions/avatar", () => ({ uploadAvatar: vi.fn(), removeAvatar: vi.fn() }))
vi.mock("@/server/actions/sync", () => ({ syncNow: vi.fn() }))
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
  profile: { birthDate: "1990-01-01", age: 36, sex: "male", maxHr: 186, maxHrSource: "estimated", timeZone: "Asia/Kolkata", heightCm: null },
  version: "0.1.0",
  scoringVersion: 2,
}
const account = { email: "me@example.com", avatar: null, seed: "me@example.com", customPhoto: false }
const source = () => screen.getByRole("region", { name: "Data source" })

describe("Settings view", () => {
  it("journey 9: not connected offers Connect Google to /oauth/start", () => {
    render(<SettingsView vm={{ ...base, source: { label: "Google Health", status: "not_connected" } }} now={NOW} account={account} />)
    expect(within(source()).getByText("Not connected")).toBeInTheDocument()
    expect(within(source()).getByRole("link", { name: "Connect Google" })).toHaveAttribute("href", "/oauth/start")
  })

  it("journey 9: importing shows backfill progress", () => {
    render(<SettingsView vm={{ ...base, import: { done: 42, total: 180 } }} now={NOW} account={account} />)
    expect(screen.getByText("Importing history: 42 of 180 days")).toBeInTheDocument()
    expect(screen.getByRole("progressbar", { name: "Import progress" })).toBeInTheDocument()
  })

  it("journey 10: revoked asks to reconnect", () => {
    render(<SettingsView vm={{ ...base, source: { label: "Google Health", status: "revoked" } }} now={NOW} account={account} />)
    expect(within(source()).getByText("Access revoked")).toBeInTheDocument()
    expect(within(source()).getByRole("link", { name: "Reconnect Google" })).toHaveAttribute("href", "/oauth/start")
  })

  it("connected offers Sync now and Disconnect; failing types open the per-type list", () => {
    render(<SettingsView vm={base} now={NOW} account={account} />)
    expect(within(source()).getByRole("button", { name: "Sync now" })).toBeInTheDocument()
    expect(within(source()).getByRole("button", { name: "Disconnect" })).toBeInTheDocument()
    expect(within(source()).getByText("1 failing")).toBeInTheDocument()
    expect(source().querySelector("details")).toHaveAttribute("open")
    expect(screen.getByText("12 minutes ago")).toBeInTheDocument()
    expect(screen.getByText("HTTP 429")).toBeInTheDocument()
  })

  it("demo mode has no actions and names the switch; About credits noop", () => {
    render(<SettingsView vm={{ ...base, mode: "demo", source: { label: "Demo data", status: "demo" } }} now={NOW} account={account} />)
    expect(within(source()).queryByRole("link")).not.toBeInTheDocument()
    expect(screen.getByText(/GOOGLE_OAUTH_ENABLED=true/)).toBeInTheDocument()
    expect(screen.getByText(/Scoring is ported from noop/)).toBeInTheDocument()
  })

  it("profile is editable and the account can sign out with a plain form post", () => {
    render(<SettingsView vm={base} now={NOW} account={account} />)
    const profile = screen.getByRole("region", { name: "Profile" })
    expect(within(profile).getByRole("button", { name: "Edit profile" })).toBeInTheDocument()
    expect(within(profile).getByText("Not set")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Account" })).getByText("me@example.com")).toBeInTheDocument()
    const out = screen.getByRole("button", { name: "Sign out" })
    expect(out.closest("form")).toHaveAttribute("action", "/logout")
    expect(out.closest("form")).toHaveAttribute("method", "post")
  })
})
