// Google OAuth: consent URL, single-use state, code exchange and access-token refresh.
// Pattern from Hælan's api/oauth.ts and api/tokens.ts (AGPL-3.0).
//
// Hygiene rule: errors and logs carry a status and a short code only, never a token or a response
// body. JSON.parse's own error quotes the input, so bodies are parsed through parseJson.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { oauthTokens } from "../../db/schema";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_TTL_MS = 10 * 60_000;
const EXPIRY_MARGIN_S = 60;

export const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
] as const;

/**
 * `code` is ours (`auth_revoked`, `not_connected`, `http_503`, ...) or Google's own error code
 * (`invalid_grant`, `INVALID_ARGUMENT`). Safe to store in `sync_state.last_error` and to log.
 */
export class GoogleError extends Error {
  override name = "GoogleError";
  constructor(
    readonly code: string,
    readonly status?: number,
    where?: string,
  ) {
    super(`[google] ${where ? `${where}: ` : ""}${code}${status ? ` (HTTP ${status})` : ""}`);
  }
}

type Google = { clientId: string; clientSecret: string };
type Deps = { fetch?: typeof fetch; now?: () => number };

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Google's error code from a token-endpoint (`{error: "invalid_grant"}`) or API (`{error: {status, details}}`) body. */
export function errorCode(body: unknown): string | undefined {
  const e = (body as { error?: unknown } | null | undefined)?.error;
  const { details, status } = (e ?? {}) as { status?: unknown; details?: unknown };
  const reason = Array.isArray(details) ? details.find((d) => d?.reason)?.reason : undefined;
  const code = typeof e === "string" ? e : (reason ?? status);
  // Only enum-shaped codes: a free-text field must never reach a log.
  return typeof code === "string" && /^[A-Za-z_]{1,64}$/.test(code) ? code : undefined;
}

export const redirectUri = (appUrl: string) => `${appUrl}/oauth/callback`;

// globalThis, not module scope: Next bundles /oauth/start and /oauth/callback separately.
const g = globalThis as typeof globalThis & { __pulseOAuthStates?: Map<string, number> };
const states = () => (g.__pulseOAuthStates ??= new Map());

/** A random state, valid once for 10 minutes. Held in memory: a restart mid-consent just means consenting again. */
export function createState(now = Date.now()): string {
  for (const [s, expires] of states()) if (expires <= now) states().delete(s);
  const state = randomBytes(32).toString("base64url");
  states().set(state, now + STATE_TTL_MS);
  return state;
}

/** True once for a state createState issued under 10 minutes ago; false for missing, unknown, reused or expired. */
export function consumeState(state: string | null, now = Date.now()): boolean {
  if (!state) return false;
  const expires = states().get(state);
  states().delete(state);
  return expires !== undefined && expires > now;
}

export function authUrl(o: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    // offline + consent is what returns a refresh token. Without prompt=consent, a second grant to
    // the same client (localhost, then production) returns an access token only.
    access_type: "offline",
    prompt: "consent",
    state: o.state,
  }).toString();
  return url.toString();
}

async function tokenRequest(fetchFn: typeof fetch, params: Record<string, string>, where: string) {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = parseJson(await res.text()) as
    | { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown }
    | undefined;
  if (!res.ok) return { ok: false as const, status: res.status, code: errorCode(body) ?? `http_${res.status}` };
  if (typeof body?.access_token !== "string" || typeof body.expires_in !== "number") {
    throw new GoogleError("bad_token_response", res.status, where);
  }
  return {
    ok: true as const,
    status: res.status,
    accessToken: body.access_token,
    expiresIn: body.expires_in,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : undefined,
    scope: typeof body.scope === "string" ? body.scope : undefined,
  };
}

/**
 * Exchanges an authorization code and stores the grant in the single `oauth_tokens` row, clearing
 * any revocation. A response without a refresh token stores nothing and throws `auth_revoked`:
 * accepting it would give a connection that syncs for an hour and then stops.
 */
export async function exchangeCode(
  db: Db,
  o: { google: Google; redirectUri: string; code: string } & Deps,
): Promise<void> {
  const { fetch: fetchFn = fetch, now = Date.now } = o;
  const r = await tokenRequest(
    fetchFn,
    {
      code: o.code,
      client_id: o.google.clientId,
      client_secret: o.google.clientSecret,
      redirect_uri: o.redirectUri,
      grant_type: "authorization_code",
    },
    "token exchange",
  );
  if (!r.ok) throw new GoogleError(r.code, r.status, "token exchange");
  if (!r.refreshToken) {
    throw new GoogleError("auth_revoked", r.status, "token exchange returned no refresh_token; revoke the app's access in your Google account and connect again");
  }
  const t = Math.floor(now() / 1000);
  const row = {
    accessToken: r.accessToken,
    refreshToken: r.refreshToken,
    expiresAt: t + r.expiresIn,
    scope: r.scope ?? SCOPES.join(" "),
    revokedAt: null,
    updatedAt: t,
  };
  db.insert(oauthTokens)
    .values({ id: 1, ...row })
    .onConflictDoUpdate({ target: oauthTokens.id, set: row })
    .run();
}

export function markRevoked(db: Db, now = Date.now()) {
  const t = Math.floor(now / 1000);
  db.update(oauthTokens).set({ revokedAt: t, updatedAt: t }).where(eq(oauthTokens.id, 1)).run();
}

/**
 * The stored access token, refreshed when it expires within a minute or when `force` is set (after a 401).
 * Throws `not_connected` with no grant, and `auth_revoked` once revoked; `invalid_grant` on refresh marks it revoked.
 */
export async function getAccessToken(db: Db, google: Google, o: Deps & { force?: boolean } = {}): Promise<string> {
  const { fetch: fetchFn = fetch, now = Date.now, force = false } = o;
  const row = db.select().from(oauthTokens).get();
  if (!row) throw new GoogleError("not_connected");
  if (row.revokedAt !== null) throw new GoogleError("auth_revoked");
  const t = Math.floor(now() / 1000);
  if (!force && row.expiresAt > t + EXPIRY_MARGIN_S) return row.accessToken;

  const r = await tokenRequest(
    fetchFn,
    {
      client_id: google.clientId,
      client_secret: google.clientSecret,
      refresh_token: row.refreshToken,
      grant_type: "refresh_token",
    },
    "token refresh",
  );
  if (!r.ok) {
    // Only invalid_grant means reconnect. A 5xx is Google having a bad day, not a revocation.
    if (r.code === "invalid_grant") {
      markRevoked(db, now());
      throw new GoogleError("auth_revoked", r.status, "token refresh");
    }
    throw new GoogleError(r.code, r.status, "token refresh");
  }
  db.update(oauthTokens)
    .set({
      accessToken: r.accessToken,
      expiresAt: t + r.expiresIn,
      refreshToken: r.refreshToken ?? row.refreshToken,
      scope: r.scope ?? row.scope,
      updatedAt: t,
    })
    .where(eq(oauthTokens.id, 1))
    .run();
  return r.accessToken;
}
