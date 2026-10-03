import { beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../../db";
import { oauthTokens } from "../../db/schema";
import { authUrl, consumeState, createState, exchangeCode, getAccessToken, GoogleError, SCOPES } from "./oauth";

const google = { clientId: "cid", clientSecret: "csecret" };
const NOW = Date.parse("2026-10-02T06:00:00Z");
const T = NOW / 1000;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const tokenStub = (...responses: Response[]) => vi.fn<typeof fetch>(async () => responses.shift()!);
const sent = (f: { mock: { calls: unknown[][] } }, i = 0) =>
  Object.fromEntries(new URLSearchParams(String((f.mock.calls[i][1] as RequestInit).body)));

let db: Db;
const row = () => db.select().from(oauthTokens).get();
const seed = (o: Partial<typeof oauthTokens.$inferInsert> = {}) =>
  db
    .insert(oauthTokens)
    .values({ id: 1, accessToken: "at-old", refreshToken: "rt-old", expiresAt: T + 3600, scope: "s", updatedAt: T, ...o })
    .run();

beforeEach(() => {
  db = openDb(":memory:");
});

const expectGoogleError = async (p: Promise<unknown>, code: string) => {
  const err = await p.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(GoogleError);
  expect((err as GoogleError).code).toBe(code);
  return err as GoogleError;
};

describe("authUrl", () => {
  it("asks for offline access with forced consent and every read scope", () => {
    const u = new URL(authUrl({ clientId: "cid", redirectUri: "https://p.example/oauth/callback", state: "st" }));
    expect(`${u.origin}${u.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      client_id: "cid",
      redirect_uri: "https://p.example/oauth/callback",
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: "st",
    });
    expect(SCOPES).toHaveLength(12);
    // Read-only everywhere except nutrition, which has no read-only scope.
    for (const s of SCOPES)
      expect(s).toMatch(/^https:\/\/www\.googleapis\.com\/auth\/googlehealth\.(\w+\.readonly|nutrition\.writeonly)$/);
  });
});

describe("state", () => {
  it("is random and valid exactly once", () => {
    const s = createState(NOW);
    expect(s).toMatch(/^[\w-]{43}$/);
    expect(createState(NOW)).not.toBe(s);
    expect(consumeState(s, NOW + 1000)).toBe(true);
    expect(consumeState(s, NOW + 2000)).toBe(false);
  });

  it("expires after 10 minutes", () => {
    const fresh = createState(NOW);
    const stale = createState(NOW);
    expect(consumeState(fresh, NOW + 10 * 60_000 - 1)).toBe(true);
    expect(consumeState(stale, NOW + 10 * 60_000)).toBe(false);
  });

  it("rejects missing, empty and unknown states", () => {
    expect(consumeState(null)).toBe(false);
    expect(consumeState("")).toBe(false);
    expect(consumeState("forged")).toBe(false);
  });
});

describe("exchangeCode", () => {
  const exchange = (fetch: typeof globalThis.fetch) =>
    exchangeCode(db, { google, redirectUri: "https://p.example/oauth/callback", code: "c0de", fetch, now: () => NOW });

  it("posts the code and stores the grant in the single row", async () => {
    const f = tokenStub(json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3599, scope: "a b" }));
    await exchange(f);
    expect(sent(f)).toEqual({
      code: "c0de",
      client_id: "cid",
      client_secret: "csecret",
      redirect_uri: "https://p.example/oauth/callback",
      grant_type: "authorization_code",
    });
    expect(row()).toEqual({
      id: 1,
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: T + 3599,
      scope: "a b",
      revokedAt: null,
      updatedAt: T,
    });
  });

  it("reconnecting replaces the grant and clears a revocation", async () => {
    seed({ revokedAt: T - 10 });
    await exchange(tokenStub(json(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 })));
    expect(row()).toMatchObject({ accessToken: "at-1", refreshToken: "rt-1", revokedAt: null, scope: SCOPES.join(" ") });
    expect(db.select().from(oauthTokens).all()).toHaveLength(1);
  });

  it("without a refresh_token stores nothing and surfaces auth_revoked", async () => {
    seed();
    const before = row();
    const err = await expectGoogleError(exchange(tokenStub(json(200, { access_token: "at-1", expires_in: 3600 }))), "auth_revoked");
    expect(err.message).not.toContain("at-1");
    expect(row()).toEqual(before);
  });

  it("a rejected code surfaces Google's code but no body text, and stores nothing", async () => {
    const body = { error: "invalid_grant", error_description: "Bad Request SECRET-DETAIL" };
    const err = await expectGoogleError(exchange(tokenStub(json(400, body))), "invalid_grant");
    expect(err.status).toBe(400);
    expect(JSON.stringify(err) + err.message + err.stack).not.toContain("SECRET-DETAIL");
    expect(row()).toBeUndefined();
  });

  it("a non-JSON error body falls back to the status", async () => {
    const err = await expectGoogleError(exchange(tokenStub(new Response("<html>SECRET</html>", { status: 502 }))), "http_502");
    expect(err.message).not.toContain("SECRET");
  });
});

describe("getAccessToken", () => {
  const get = (f: typeof fetch, o: { force?: boolean; now?: number } = {}) =>
    getAccessToken(db, google, { fetch: f, now: () => o.now ?? NOW, force: o.force });

  it("returns the stored token while valid, without a request", async () => {
    seed();
    const f = tokenStub();
    expect(await get(f)).toBe("at-old");
    expect(f.mock.calls).toHaveLength(0);
  });

  it("refreshes within a minute of expiry and stores the new token, keeping an unrotated refresh token", async () => {
    seed({ expiresAt: T + 59 });
    const f = tokenStub(json(200, { access_token: "at-new", expires_in: 3600 }));
    expect(await get(f)).toBe("at-new");
    expect(sent(f)).toEqual({ client_id: "cid", client_secret: "csecret", refresh_token: "rt-old", grant_type: "refresh_token" });
    expect(row()).toMatchObject({ accessToken: "at-new", refreshToken: "rt-old", expiresAt: T + 3600, revokedAt: null });
  });

  it("stores a rotated refresh token", async () => {
    seed({ expiresAt: T - 1 });
    await get(tokenStub(json(200, { access_token: "at-new", refresh_token: "rt-new", expires_in: 3600 })));
    expect(row()?.refreshToken).toBe("rt-new");
  });

  it("force refreshes a token that is still valid", async () => {
    seed();
    expect(await get(tokenStub(json(200, { access_token: "at-new", expires_in: 3600 })), { force: true })).toBe("at-new");
  });

  it("invalid_grant marks the token revoked, and later calls fail without a request", async () => {
    seed({ expiresAt: T - 1 });
    await expectGoogleError(get(tokenStub(json(400, { error: "invalid_grant" }))), "auth_revoked");
    expect(row()?.revokedAt).toBe(T);
    const f = tokenStub();
    await expectGoogleError(get(f), "auth_revoked");
    expect(f.mock.calls).toHaveLength(0);
  });

  it("a 503 on refresh is not a revocation", async () => {
    seed({ expiresAt: T - 1 });
    await expectGoogleError(get(tokenStub(json(503, {}))), "http_503");
    expect(row()?.revokedAt).toBeNull();
  });

  it("a malformed token response is an error, and the old token is kept", async () => {
    seed({ expiresAt: T - 1 });
    await expectGoogleError(get(tokenStub(json(200, { access_token: "at-new" }))), "bad_token_response");
    expect(row()?.accessToken).toBe("at-old");
  });

  it("without a grant throws not_connected", async () => {
    await expectGoogleError(get(tokenStub()), "not_connected");
  });
});
