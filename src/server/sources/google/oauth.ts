// Google OAuth: consent URL, single-use state, code exchange and access-token refresh.
// Pattern from Hælan's api/oauth.ts and api/tokens.ts (AGPL-3.0).
//
// Hygiene rule: errors and logs carry a status and a short code only, never a token or a response
// body. JSON.parse's own error quotes the input, so bodies are parsed through parseJson.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import type { Db } from "../../db";
import { oauthTokens } from "../../db/schema";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const IDENTITY_URL = "https://health.googleapis.com/v4/users/me/identity";
const PROFILE_URL = "https://health.googleapis.com/v4/users/me/profile";
const STATE_TTL_MS = 10 * 60_000;
const EXPIRY_MARGIN_S = 60;
export const FETCH_TIMEOUT_MS = 30_000;

// Every read scope the API has, so one consent covers all data. Nutrition has no read-only scope:
// `nutrition.writeonly` is the only one that lets dataPoints.list return food and hydration logs.
// Pulse never calls create, patch or batchDelete.
export const SCOPES = [
  "activity_and_fitness.readonly",
  "health_metrics_and_measurements.readonly",
  "sleep.readonly",
  "ecg.readonly",
  "irn.readonly",
  "location.readonly",
  "logged_symptoms.readonly",
  "mindfulness.readonly",
  "reproductive_health.readonly",
  "profile.readonly",
  "settings.readonly",
  "nutrition.writeonly",
].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}`);

/** Sign-in (U20) rides on the same consent: the ID token's verified email decides who may in. */
export const LOGIN_SCOPES = ["openid", "email"];

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

/** APP_URL when set, else the origin the request came in on (localhost, a LAN address, a tunnel host). */
export const appOrigin = (req: Request, appUrl: string | null) => appUrl ?? new URL(req.url).origin;
export const redirectUri = (origin: string) => `${origin}/oauth/callback`;

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

/**
 * `consent` the first time and whenever the stored grant is unusable: only a consent screen returns a
 * refresh token. A returning owner with a working grant just picks the account.
 */
export function authUrl(o: { clientId: string; redirectUri: string; state: string; prompt: "consent" | "select_account" }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: [...LOGIN_SCOPES, ...SCOPES].join(" "),
    // offline + consent is what returns a refresh token. Without prompt=consent, a second grant to
    // the same client (localhost, then production) returns an access token only.
    access_type: "offline",
    prompt: o.prompt,
    state: o.state,
  }).toString();
  return url.toString();
}

async function tokenRequest(fetchFn: typeof fetch, params: Record<string, string>, where: string) {
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  const body = parseJson(await res.text()) as
    | { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; scope?: unknown; id_token?: unknown }
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
    idToken: typeof body.id_token === "string" ? body.id_token : undefined,
  };
}

/** True when a grant is stored and not revoked: sign-in can skip the consent screen. */
export function hasGrant(db: Db): boolean {
  const row = db.select({ revokedAt: oauthTokens.revokedAt }).from(oauthTokens).get();
  return !!row && row.revokedAt === null;
}

/**
 * The verified email in an ID token. The token came straight from Google's token endpoint over TLS,
 * so per OpenID Connect Core 3.1.3.7 its signature needn't be checked; audience still is.
 */
function verifiedEmail(idToken: string | undefined, clientId: string): string {
  let claims: ReturnType<typeof decodeJwt>;
  try {
    claims = decodeJwt(idToken ?? "");
  } catch {
    throw new GoogleError("no_id_token");
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId) || typeof claims.email !== "string") throw new GoogleError("no_id_token");
  if (claims.email_verified !== true) throw new GoogleError("email_unverified");
  return claims.email.toLowerCase();
}

/**
 * Exchanges an authorization code, checks the signed-in account with `allow`, and stores the grant in
 * the single `oauth_tokens` row, clearing any revocation. Returns the account's email.
 * - An account `allow` refuses stores nothing and throws `not_owner`.
 * - Without a refresh token (no consent screen), only the access token of a still-working grant is
 *   updated. With no such grant it stores nothing and throws `auth_revoked`: accepting it would give
 *   a connection that syncs for an hour and then stops.
 */
export async function exchangeCode(
  db: Db,
  o: { google: Google; redirectUri: string; code: string; allow: (email: string) => boolean } & Deps,
): Promise<string> {
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
  const email = verifiedEmail(r.idToken, o.google.clientId);
  // Before the owner claim: an account without Google Health would claim the instance and then sync nothing.
  await requireHealthProfile(fetchFn, r.accessToken);
  if (!o.allow(email)) throw new GoogleError("not_owner");
  const t = Math.floor(now() / 1000);
  if (!r.refreshToken) {
    if (!hasGrant(db)) {
      throw new GoogleError("auth_revoked", r.status, "token exchange returned no refresh_token; revoke the app's access in your Google account and connect again");
    }
    db.update(oauthTokens).set({ accessToken: r.accessToken, expiresAt: t + r.expiresIn, updatedAt: t }).where(eq(oauthTokens.id, 1)).run();
    return email;
  }
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
  return email;
}

/**
 * Throws `account_not_linked` when the Google account has no Google Health profile (never set up, or a
 * Fitbit account not yet moved to Google). Any other answer passes: a 5xx must not block sign-in, and the
 * sync reports it.
 */
async function requireHealthProfile(fetchFn: typeof fetch, accessToken: string) {
  const res = await fetchFn(IDENTITY_URL, { headers: { authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.ok) return void (await res.body?.cancel());
  if (errorCode(parseJson(await res.text())) === "ACCOUNT_NOT_LINKED") throw new GoogleError("account_not_linked", res.status, "identity");
}

/**
 * The age Google Health holds for the account, in whole years, or null. Google's profile has no birth date
 * and no sex, only `age`, so onboarding still asks for both and uses this to open the date picker on the
 * right year. Best effort: any failure is just null.
 */
export async function googleAge(db: Db, google: Google, o: Deps = {}): Promise<number | null> {
  const { fetch: fetchFn = fetch } = o;
  try {
    const token = await getAccessToken(db, google, o);
    const res = await fetchFn(PROFILE_URL, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5_000) });
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const age = (parseJson(await res.text()) as { age?: unknown } | undefined)?.age;
    return typeof age === "number" && age >= 13 && age <= 100 ? age : null;
  } catch {
    return null;
  }
}

/**
 * Disconnect: revokes the grant at Google (every scope Pulse holds, as if removed under Google Account ›
 * Third-party access), then forgets it. The stored data stays. Google answering 400 means the token was
 * already invalid, which is the goal anyway; a network failure throws and keeps the row, so it can be retried.
 */
export async function revokeGrant(db: Db, o: Deps = {}): Promise<void> {
  const { fetch: fetchFn = fetch } = o;
  const row = db.select().from(oauthTokens).get();
  if (!row) return;
  const res = await fetchFn(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: row.refreshToken }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  await res.body?.cancel();
  if (!res.ok && res.status !== 400) throw new GoogleError(`http_${res.status}`, res.status, "revoke");
  db.delete(oauthTokens).where(eq(oauthTokens.id, 1)).run();
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
