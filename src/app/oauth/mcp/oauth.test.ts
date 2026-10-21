import { describe, expect, it, vi } from "vitest";
import { GET as resource } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as nestedResource } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as server } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as authorize } from "./authorize/route";
import { POST as token } from "./token/route";

const { session, config } = vi.hoisted(() => ({ session: vi.fn(), config: { appUrl: null as string | null } }));
vi.mock("@/server/auth", () => ({ currentUser: session }));
vi.mock("@/server/config", () => ({ getConfig: () => config }));

describe("OAuth HTTP endpoints", () => {
  it("serves identical resource discovery at both paths and issuer metadata without a session", async () => {
    const req = new Request("https://public.test/.well-known/oauth-protected-resource");
    const doc = await resource(req).json();
    expect(doc).toEqual({ resource: "https://public.test/api/mcp", authorization_servers: ["https://public.test"], scopes_supported: ["pulse"], bearer_methods_supported: ["header"] });
    expect(await nestedResource(req).json()).toEqual(doc);
    expect(await server(req).json()).toEqual({ issuer: "https://public.test", authorization_endpoint: "https://public.test/oauth/mcp/authorize", token_endpoint: "https://public.test/oauth/mcp/token", response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, scopes_supported: ["pulse"] });
    config.appUrl = "https://canonical.test/";
    expect(await server(req).json()).toMatchObject({ issuer: "https://canonical.test" });
    config.appUrl = null;
    expect(session).not.toHaveBeenCalled();
  });
  it("returns 400 without a safe callback; validation errors echo issuer and state on a safe callback", async () => {
    expect((await authorize(new Request("https://pulse.test/oauth/mcp/authorize?redirect_uri=https://evil.test"))).status).toBe(400);
    const params = new URLSearchParams({ redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect", state: "same & state" });
    const res = await authorize(new Request(`https://pulse.test/oauth/mcp/authorize?${params}`));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("invalid_request");
    expect(location.searchParams.get("iss")).toBe("https://pulse.test");
    expect(location.searchParams.get("state")).toBe("same & state");
  });
  it("returns an authenticated visitor to consent and preserves the original query through login", async () => {
    const clientId = "https://chatgpt.com/oauth/client.json";
    const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ client_id: clientId, client_name: "ChatGPT", redirect_uris: [redirectUri] })));
    const params = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, resource: "https://pulse.test/api/mcp", code_challenge_method: "S256", code_challenge: "a".repeat(43), state: "unchanged" });
    const req = new Request(`https://pulse.test/oauth/mcp/authorize?${params}`);
    session.mockResolvedValue(null);
    let res = await authorize(req);
    expect(new URL(res.headers.get("location")!, req.url).searchParams.get("next")).toBe(`/oauth/mcp/authorize?${params}`);
    session.mockResolvedValue({ userId: 1 });
    res = await authorize(req);
    expect(res.headers.get("location")).toBe(`/oauth/mcp/consent?${params}`);
    vi.unstubAllGlobals();
  });
  it("rejects client authentication and non-form token requests without caching", async () => {
    for (const headers of [{ "content-type": "application/json" }, { "content-type": "application/x-www-form-urlencoded", authorization: "Basic synthetic" }] as Record<string, string>[]) {
      const res = await token(new Request("https://pulse.test/oauth/mcp/token", { method: "POST", headers, body: "{}" }));
      expect(res.status).toBe(400);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
  });
});
