import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { instance, oauthTokens } from "@/server/db/schema";
import { SESSION_COOKIE, signSession, verifySession } from "@/server/session";
import { createState } from "@/server/sources/google/oauth";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, requestSync: vi.fn() }));
vi.mock("@/server/worker", () => ({ requestSync: h.requestSync }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = { TZ: "Asia/Kolkata" };
const googleEnv = { GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
const live = parseConfig({ ...env, ...googleEnv, APP_URL: "https://pulse.example.com" });

const idToken = (email: string) =>
  ["{}", JSON.stringify({ aud: "cid", email, email_verified: true, picture: "https://lh3.googleusercontent.com/a/me" })].map((p) => Buffer.from(p).toString("base64url")).join(".") + ".sig";

let db: Db;
let tokenResponse: () => Response;
const fetchMock = vi.fn<typeof fetch>(async () => tokenResponse());
const errors = vi.spyOn(console, "error").mockImplementation(() => {});
const granted = (email = "me@example.com") => () =>
  new Response(JSON.stringify({ access_token: "at-NEW", refresh_token: "rt-NEW", expires_in: 3600, id_token: idToken(email) }));

const call = (q: Record<string, string>, cookie?: string) =>
  GET(new NextRequest(`http://pulse:3000/oauth/callback?${new URLSearchParams(q)}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }));
const tokens = () => db.select().from(oauthTokens).all();
const owner = () => db.select().from(instance).get()?.ownerEmail ?? null;
const sessionOf = async (res: Response) => {
  const m = /pulse_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "");
  return verifySession(db, m?.[1], { googleEnabled: true, ownerEmail: (h.cfg as Config).google!.ownerEmail });
};
const seedOld = () =>
  db.insert(oauthTokens).values({ id: 1, accessToken: "at-old", refreshToken: "rt-old", expiresAt: 1, scope: "s", updatedAt: 1, revokedAt: 1 }).run();

beforeEach(() => {
  db = openDb(":memory:");
  h.db = db;
  h.cfg = live;
  tokenResponse = granted();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /oauth/callback", () => {
  it("is a 404 on a demo instance", async () => {
    h.cfg = parseConfig(env);
    expect((await call({ state: createState(), code: "c" })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing, wrong, expired or reused state is a 400 that touches nothing", async () => {
    expect((await call({ code: "c" })).status).toBe(400);
    expect((await call({ state: "forged", code: "c" })).status).toBe(400);
    expect((await call({ state: createState(Date.now() - 10 * 60_000 - 1), code: "c" })).status).toBe(400);
    const state = createState();
    expect((await call({ state, code: "c" })).status).toBe(302);
    expect((await call({ state, code: "c" })).status).toBe(400);
    // One sign-in: the token exchange and the Google Health identity check.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("the first sign-in claims the instance, stores the grant, starts the import and lands on Home signed in", async () => {
    const res = await call({ state: createState(), code: "c0de" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://pulse.example.com/");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("code")).toBe("c0de");
    expect(body.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
    expect(owner()).toBe("me@example.com");
    expect(tokens()).toMatchObject([{ accessToken: "at-NEW", refreshToken: "rt-NEW", revokedAt: null }]);
    expect(h.requestSync).toHaveBeenCalledExactlyOnceWith({ force: true });
    expect(await sessionOf(res)).toEqual({ kind: "owner", email: "me@example.com" });
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(db.select().from(instance).get()?.ownerPicture).toBe("https://lh3.googleusercontent.com/a/me");
  });

  it("without APP_URL, redirects go back to the host the request came in on", async () => {
    h.cfg = parseConfig({ ...env, ...googleEnv });
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("http://pulse:3000/");
    expect(new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body)).get("redirect_uri")).toBe("http://pulse:3000/oauth/callback");
    expect(res.headers.get("set-cookie")).not.toMatch(/Secure/i);
  });

  it("another account gets not_owner: no grant, no session, owner unchanged", async () => {
    await call({ state: createState(), code: "c" });
    db.delete(oauthTokens).run();
    tokenResponse = granted("intruder@example.com");
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login?error=not_owner");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(tokens()).toEqual([]);
    expect(owner()).toBe("me@example.com");
  });

  it("OWNER_EMAIL admits only that account, even on a fresh instance", async () => {
    h.cfg = parseConfig({ ...env, ...googleEnv, OWNER_EMAIL: "Boss@Example.com" });
    tokenResponse = granted("me@example.com");
    expect((await call({ state: createState(), code: "c" })).headers.get("location")).toBe("http://pulse:3000/login?error=not_owner");
    tokenResponse = granted("boss@example.com");
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("http://pulse:3000/");
    expect(await sessionOf(res)).toEqual({ kind: "owner", email: "boss@example.com" });
  });

  it("an owner already signed in was reconnecting: back to Settings", async () => {
    await call({ state: createState(), code: "c" });
    const cookie = await signSession(db, { kind: "owner", email: "me@example.com" });
    const res = await call({ state: createState(), code: "c" }, cookie);
    expect(res.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=connected");
    tokenResponse = () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "SECRET-DETAIL" }), { status: 400 });
    const bad = await call({ state: createState(), code: "c" }, cookie);
    expect(bad.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=invalid_grant");
    expect(errors.mock.calls.flat().join(" ")).not.toContain("SECRET-DETAIL");
  });

  it("no refresh_token and no working grant: auth_revoked on /login, without logging the token", async () => {
    seedOld();
    const before = tokens();
    tokenResponse = () => new Response(JSON.stringify({ access_token: "at-NEW", expires_in: 3600, id_token: idToken("me@example.com") }));
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login?error=auth_revoked");
    expect(tokens()).toEqual(before);
    expect(String(errors.mock.calls[0][0])).toContain("auth_revoked");
    expect(String(errors.mock.calls[0][0])).not.toContain("at-NEW");
  });

  it("an account without Google Health can't claim the instance", async () => {
    fetchMock.mockImplementation(async (url) =>
      String(url).endsWith("/identity")
        ? new Response(JSON.stringify({ error: { details: [{ reason: "ACCOUNT_NOT_LINKED" }] } }), { status: 400 })
        : tokenResponse(),
    );
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login?error=account_not_linked");
    expect(owner()).toBeNull();
    expect(tokens()).toEqual([]);
    fetchMock.mockImplementation(async () => tokenResponse());
  });

  it("a denied consent returns to /login without a token request", async () => {
    const res = await call({ state: createState(), error: "access_denied" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login?error=access_denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a network failure logs the error name only", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed at-SECRET"));
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/login?error=error");
    expect(errors.mock.calls.flat().join(" ")).toBe("[oauth] callback failed: TypeError");
  });
});
