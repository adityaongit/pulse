import { render, screen } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"
import { Children, isValidElement, type ReactNode } from "react"
import ConsentPage from "./page"

const h = vi.hoisted(() => ({ user: { userId: 1, email: "synthetic@pulse.test" } as { userId: number; email: string } | null, createCode: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "pulse.test", "x-forwarded-proto": "https" }) }))
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url) } }))
vi.mock("@/server/auth", () => ({ currentUser: async () => h.user }))
vi.mock("@/server/config", () => ({ getConfig: () => ({ appUrl: "https://pulse.test" }) }))
vi.mock("@/server/db", () => ({ getDb: () => ({}) }))
vi.mock("@/server/mcp/oauth", async (original) => ({ ...await original<object>(), createCode: h.createCode }))
const clientId = "https://chatgpt.com/oauth/client.json"
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect"
const params = { response_type: "code", client_id: clientId, redirect_uri: redirectUri, resource: "https://pulse.test/api/mcp", code_challenge_method: "S256", code_challenge: "a".repeat(43), state: "unchanged" }
const page = () => ConsentPage({ params: Promise.resolve({}), searchParams: Promise.resolve(params) })
function formAction(node: ReactNode): ((data: FormData) => Promise<void>) | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ action?: (data: FormData) => Promise<void>; children?: ReactNode }>(child)) continue
    if (child.type === "form") return child.props.action
    const action = formAction(child.props.children)
    if (action) return action
  }
}
beforeEach(() => {
  h.user = { userId: 1, email: "synthetic@pulse.test" }
  h.createCode.mockReset().mockResolvedValue("synthetic-code")
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ client_id: clientId, client_name: "ChatGPT", redirect_uris: [redirectUri] })))
})
it("shows the account, immediate log consent, and Allow and Deny controls", async () => {
  render(await page())
  expect(screen.getByText(/synthetic@pulse.test/)).toHaveTextContent("Log tools save immediately")
  expect(screen.getByRole("button", { name: "Allow" })).toBeInTheDocument()
  expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument()
})
it("creates a code only on Allow, and echoes issuer and state for both decisions", async () => {
  const action = formAction(await page())!
  for (const decision of ["deny", "allow"]) {
    const data = new FormData(); data.set("decision", decision)
    let target = ""
    try { await action(data) } catch (err) { target = (err as Error).message }
    const url = new URL(target)
    expect(url.searchParams.get("iss")).toBe("https://pulse.test")
    expect(url.searchParams.get("state")).toBe("unchanged")
    expect(url.searchParams.get(decision === "allow" ? "code" : "error")).toBe(decision === "allow" ? "synthetic-code" : "access_denied")
    expect(h.createCode).toHaveBeenCalledTimes(decision === "allow" ? 1 : 0)
  }
})
it("rechecks the session on submission and refuses an account switch", async () => {
  const action = formAction(await page())!
  const data = new FormData(); data.set("decision", "allow")
  h.user = { userId: 2, email: "other@pulse.test" }
  await expect(action(data)).rejects.toThrow("/login?next=")
  expect(h.createCode).not.toHaveBeenCalled()
})
