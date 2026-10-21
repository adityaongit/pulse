import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "../db";
import { mcpOAuthCodes, mcpOAuthAccessTokens, mcpOAuthRefreshTokens } from "../db/schema";
import { freshDb, addUser, USER } from "../testing";
import { authorizeRedirect, createCode, exchangeToken, listOAuthGrants, revokeOAuthGrant, safeRedirect, userForOAuthToken, validateAuthorize } from "./oauth";
import { loginReturn } from "@/lib/login-return";

const clientId = "https://chatgpt.com/oauth/client.json";
const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
const resource = "https://pulse.test/api/mcp";
const verifier = "a".repeat(43);
const auth = { clientId, clientName: "ChatGPT", redirectUri, resource, codeChallenge: createHash("sha256").update(verifier).digest("base64url") };
const query = () => new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: redirectUri, resource, code_challenge: auth.codeChallenge, code_challenge_method: "S256", scope: "pulse", state: "a & b" });
const codeParams = (code: string) => new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, resource, code, code_verifier: verifier });
const refreshParams = (token: string) => new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, resource, refresh_token: token });
let db: Db;
beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"], now: 1_800_000_000_000 });
  db = await freshDb();
});
afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function tokens(userId = USER) {
  const result = await exchangeToken(db, codeParams(await createCode(db, userId, auth)), resource);
  if (!("access_token" in result)) throw new Error("Exchange failed");
  return result;
}

describe("OAuth storage and exchange", () => {
  it("uses PKCE once, stores hashes only, and binds the access token to its user and resource", async () => {
    const code = await createCode(db, USER, auth);
    const wrong = codeParams(code); wrong.set("code_verifier", "b".repeat(43));
    expect(await exchangeToken(db, wrong, resource)).toEqual({ error: "invalid_grant" });
    const mismatch = codeParams(code); mismatch.set("resource", "https://other.test/api/mcp");
    expect(await exchangeToken(db, mismatch, resource)).toEqual({ error: "invalid_request" });
    const otherClient = codeParams(code); otherClient.set("client_id", "https://chatgpt.com/oauth/other.json");
    expect(await exchangeToken(db, otherClient, resource)).toEqual({ error: "invalid_grant" });
    const otherRedirect = codeParams(code); otherRedirect.set("redirect_uri", "https://chatgpt.com/connector/oauth/other");
    expect(await exchangeToken(db, otherRedirect, resource)).toEqual({ error: "invalid_grant" });
    const result = await exchangeToken(db, codeParams(code), resource);
    expect(result).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "pulse" });
    if (!("access_token" in result)) throw new Error("Exchange failed");
    expect(result.access_token).toMatch(/^oat_[A-Za-z0-9_-]{43}$/);
    expect(result.refresh_token).toMatch(/^ort_[A-Za-z0-9_-]{43}$/);
    expect(await userForOAuthToken(db, result.access_token, resource)).toBe(USER);
    expect(await userForOAuthToken(db, result.access_token, "https://other.test/api/mcp")).toBeNull();
    expect(await exchangeToken(db, codeParams(code), resource)).toEqual({ error: "invalid_grant" });
    const rows = JSON.stringify([await db.select().from(mcpOAuthCodes), await db.select().from(mcpOAuthAccessTokens), await db.select().from(mcpOAuthRefreshTokens)]);
    for (const value of [code, verifier, result.access_token, result.refresh_token]) expect(rows).not.toContain(value);
  });

  it("expires codes after 60 seconds and access after one hour", async () => {
    const result = await tokens();
    const code = await createCode(db, USER, auth);
    vi.setSystemTime(Date.now() + 60_000);
    expect(await exchangeToken(db, codeParams(code), resource)).toEqual({ error: "invalid_grant" });
    vi.setSystemTime(Date.now() + 3_540_000);
    expect(await userForOAuthToken(db, result.access_token, resource)).toBeNull();
  });

  it("only one concurrent exchange spends a code or refresh token", async () => {
    const params = codeParams(await createCode(db, USER, auth));
    const results = await Promise.all([exchangeToken(db, params, resource), exchangeToken(db, params, resource)]);
    expect(results.filter((r) => "access_token" in r)).toHaveLength(1);
    const result = results.find((r) => "access_token" in r)!;
    if (!("refresh_token" in result)) throw new Error("Exchange failed");
    const rotated = await Promise.all([exchangeToken(db, refreshParams(result.refresh_token), resource), exchangeToken(db, refreshParams(result.refresh_token), resource)]);
    expect(rotated.filter((r) => "access_token" in r)).toHaveLength(1);
  });

  it("rotates refresh tokens and revokes only that user's entire client grant", async () => {
    const other = await addUser(db);
    const theirs = await tokens(other);
    const mine = await tokens();
    const rotated = await exchangeToken(db, refreshParams(mine.refresh_token), resource);
    expect(rotated).toHaveProperty("access_token");
    expect(await exchangeToken(db, refreshParams(mine.refresh_token), resource)).toEqual({ error: "invalid_grant" });
    expect(await listOAuthGrants(db, USER)).toEqual([{ clientId, clientName: "ChatGPT" }]);
    const pending = await createCode(db, USER, auth);
    await revokeOAuthGrant(db, USER, clientId);
    expect(await listOAuthGrants(db, USER)).toEqual([]);
    expect(await userForOAuthToken(db, mine.access_token, resource)).toBeNull();
    if (!("access_token" in rotated)) throw new Error("Rotation failed");
    expect(await userForOAuthToken(db, rotated.access_token, resource)).toBeNull();
    expect(await exchangeToken(db, refreshParams(rotated.refresh_token), resource)).toEqual({ error: "invalid_grant" });
    expect(await exchangeToken(db, codeParams(pending), resource)).toEqual({ error: "invalid_grant" });
    expect(await userForOAuthToken(db, theirs.access_token, resource)).toBe(other);
  });
});

describe("authorization validation", () => {
  const document = { client_id: clientId, client_name: "ChatGPT", redirect_uris: [redirectUri] };
  it("fetches trusted CIMD without following redirects and validates exact metadata", async () => {
    const fetcher = vi.fn(async () => Response.json(document)); vi.stubGlobal("fetch", fetcher);
    expect(await validateAuthorize(query(), resource)).toEqual(auth);
    expect(fetcher).toHaveBeenCalledWith(clientId, expect.objectContaining({ redirect: "error", cache: "no-store", signal: expect.any(AbortSignal) }));
    fetcher.mockImplementation(async () => Response.json({ ...document, redirect_uris: [] }));
    await expect(validateAuthorize(query(), resource)).rejects.toThrow();
    fetcher.mockImplementation(async () => Response.json({ ...document, client_name: "" }));
    await expect(validateAuthorize(query(), resource)).rejects.toThrow();
    fetcher.mockImplementation(async () => new Response(" ".repeat(16385)));
    await expect(validateAuthorize(query(), resource)).rejects.toThrow();
  });
  it("rejects untrusted redirect URIs, resources, clients, scopes and PKCE before fetch", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const [key, value] of [
      ["redirect_uri", "https://evil.test/callback"], ["redirect_uri", "https://chatgpt.com.evil.test/connector/oauth/x"],
      ["client_id", "https://evil.test/client.json"], ["client_id", "http://chatgpt.com/client.json"],
      ["client_id", "https://chatgpt.com:8443/client.json"], ["resource", "https://evil.test/api/mcp"],
      ["scope", "email"], ["code_challenge_method", "plain"], ["code_challenge", ""], ["response_type", "token"],
    ]) {
      const params = query(); params.set(key, value);
      await expect(validateAuthorize(params, resource)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(safeRedirect("https://chatgpt.com/connector/oauth/example")).toBe(true);
  });
  it("echoes state and issuer on success, denial and validation redirects", () => {
    for (const result of [{ code: "synthetic" }, { error: "access_denied" }, { error: "invalid_request" }]) {
      const url = new URL(authorizeRedirect(redirectUri, query(), "https://pulse.test", result));
      expect(url.searchParams.get("state")).toBe("a & b");
      expect(url.searchParams.get("iss")).toBe("https://pulse.test");
    }
    expect(new URL(authorizeRedirect(redirectUri, new URLSearchParams(), "https://pulse.test", { error: "access_denied" })).searchParams.has("state")).toBe(false);
  });
  it("resumes only a local authorization path after login", () => {
    const target = `/oauth/mcp/authorize?${query()}`;
    expect(loginReturn(target)).toBe(target);
    for (const value of ["https://evil.test", "//evil.test", "/oauth/mcp/authorize/../evil?x", null]) expect(loginReturn(value)).toBe("/");
  });
});
