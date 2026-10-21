// OAuth credentials never leave this module except when issued; only SHA-256 hashes reach Postgres.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getConfig } from "../config";
import type { Db } from "../db";
import { mcpOAuthGrants as grants, mcpOAuthCodes as codes, mcpOAuthAccessTokens as access, mcpOAuthRefreshTokens as refresh } from "../db/schema";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const secret = (prefix: string) => prefix + randomBytes(32).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
export const issuerOf = (url: string) => (getConfig().appUrl ?? new URL(url).origin).replace(/\/+$/, "");
export const resourceOf = (url: string) => `${issuerOf(url)}/api/mcp`;
export const oauthHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export function protectedResource(url: string) {
  return { resource: resourceOf(url), authorization_servers: [issuerOf(url)], scopes_supported: ["pulse"], bearer_methods_supported: ["header"] };
}
export function authorizationServer(url: string) {
  const issuer = issuerOf(url);
  return {
    issuer, authorization_endpoint: `${issuer}/oauth/mcp/authorize`, token_endpoint: `${issuer}/oauth/mcp/token`,
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true, authorization_response_iss_parameter_supported: true, scopes_supported: ["pulse"],
  };
}

export function safeRedirect(uri: string) {
  try {
    const u = new URL(uri);
    return u.origin === "https://chatgpt.com" && !u.username && !u.password && !u.hash &&
      (uri === "https://chatgpt.com/connector_platform_oauth_redirect" || uri.startsWith("https://chatgpt.com/connector/oauth/"));
  } catch { return false; }
}

export function authorizeRedirect(uri: string, params: URLSearchParams, issuer: string, result: { code: string } | { error: string }) {
  const target = new URL(uri);
  target.searchParams.delete("code");
  target.searchParams.delete("error");
  target.searchParams.delete("state");
  for (const [key, value] of Object.entries(result)) target.searchParams.set(key, value);
  if (params.has("state")) target.searchParams.set("state", params.get("state")!);
  target.searchParams.set("iss", issuer);
  return target.toString();
}

const Client = z.object({ client_id: z.string(), client_name: z.string().trim().min(1).max(200), redirect_uris: z.array(z.string()).max(100) });
export async function validateAuthorize(params: URLSearchParams, resource: string) {
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) throw new Error("invalid_request");
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const client = new URL(clientId);
  if (client.protocol !== "https:" || client.hostname !== "chatgpt.com" || client.port || client.username || client.password || client.hash ||
    !safeRedirect(redirectUri) || params.get("response_type") !== "code" || params.get("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") ?? "") || params.get("resource") !== resource ||
    (params.has("scope") && params.get("scope") !== "pulse")) throw new Error("invalid_request");

  const response = await fetch(clientId, { redirect: "error", signal: AbortSignal.timeout(5000), headers: { Accept: "application/json" }, cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("invalid_request");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) throw new Error("invalid_request");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const doc = Client.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  if (doc.client_id !== clientId || !doc.redirect_uris.includes(redirectUri)) throw new Error("invalid_request");
  return { clientId, clientName: doc.client_name, redirectUri, resource, codeChallenge: params.get("code_challenge")! };
}
export type Authorization = Awaited<ReturnType<typeof validateAuthorize>>;

export async function createCode(db: Db, userId: number, auth: Authorization) {
  const code = secret("oc_");
  await db.transaction(async (tx) => {
    await tx.insert(grants).values({ userId, clientId: auth.clientId, clientName: auth.clientName })
      .onConflictDoUpdate({ target: [grants.userId, grants.clientId], set: { clientName: auth.clientName } });
    await tx.insert(codes).values({ userId, clientId: auth.clientId, codeHash: hash(code), codeChallenge: auth.codeChallenge,
      redirectUri: auth.redirectUri, resource: auth.resource, expiresAt: now() + 60 });
  });
  return code;
}

async function issue(db: Db, row: { userId: number; clientId: string; resource: string }) {
  const accessToken = secret("oat_");
  const refreshToken = secret("ort_");
  await db.insert(access).values({ ...row, tokenHash: hash(accessToken), scope: "pulse", expiresAt: now() + 3600 });
  await db.insert(refresh).values({ ...row, tokenHash: hash(refreshToken) });
  return { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 3600, scope: "pulse" };
}

export async function exchangeToken(db: Db, params: URLSearchParams, resource: string) {
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1) || !params.get("client_id") || params.get("resource") !== resource)
    return { error: "invalid_request" };
  const clientId = params.get("client_id")!;
  const grantType = params.get("grant_type");
  if (grantType !== "authorization_code" && grantType !== "refresh_token") return { error: "unsupported_grant_type" };
  return db.transaction(async (tx) => {
    if (grantType === "authorization_code") {
      const verifier = params.get("code_verifier") ?? "";
      if (!params.get("code") || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return { error: "invalid_grant" };
      const [row] = await tx.delete(codes).where(and(eq(codes.codeHash, hash(params.get("code")!)), eq(codes.clientId, clientId),
        eq(codes.resource, resource), eq(codes.redirectUri, params.get("redirect_uri") ?? ""), gt(codes.expiresAt, now()),
        eq(codes.codeChallenge, createHash("sha256").update(verifier).digest("base64url")))).returning();
      if (!row) return { error: "invalid_grant" };
      return issue(tx, { userId: row.userId, clientId, resource });
    }
    const token = params.get("refresh_token") ?? "";
    if (!token.startsWith("ort_")) return { error: "invalid_grant" };
    const [row] = await tx.delete(refresh).where(and(eq(refresh.tokenHash, hash(token)), eq(refresh.clientId, clientId), eq(refresh.resource, resource))).returning();
    if (!row) return { error: "invalid_grant" };
    return issue(tx, { userId: row.userId, clientId, resource });
  });
}

export async function userForOAuthToken(db: Db, token: string, resource: string) {
  if (!/^oat_[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [row] = await db.select({ userId: access.userId }).from(access).where(and(eq(access.tokenHash, hash(token)), eq(access.resource, resource),
    eq(access.scope, "pulse"), gt(access.expiresAt, now())));
  return row?.userId ?? null;
}
export type OAuthGrant = { clientId: string; clientName: string };
export const listOAuthGrants = (db: Db, userId: number): Promise<OAuthGrant[]> => db.select({ clientId: grants.clientId, clientName: grants.clientName }).from(grants).where(eq(grants.userId, userId));
export async function revokeOAuthGrant(db: Db, userId: number, clientId: string) {
  await db.delete(grants).where(and(eq(grants.userId, userId), eq(grants.clientId, clientId)));
}
