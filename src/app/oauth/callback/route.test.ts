import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import { createState } from "@/server/sources/google/oauth";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = {
  BIRTH_DATE: "1990-06-15",
  SEX: "male",
  TZ: "Asia/Kolkata",
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud",
};
const live = parseConfig({
  ...env,
  GOOGLE_OAUTH_ENABLED: "true",
  GOOGLE_CLIENT_ID: "cid",
  GOOGLE_CLIENT_SECRET: "csecret",
  APP_URL: "https://pulse.example.com",
});

let db: Db;
let tokenResponse: () => Response;
const fetchMock = vi.fn<typeof fetch>(async () => tokenResponse());
const errors = vi.spyOn(console, "error").mockImplementation(() => {});
const granted = () => new Response(JSON.stringify({ access_token: "at-NEW", refresh_token: "rt-NEW", expires_in: 3600 }));

const call = (q: Record<string, string>) =>
  GET(new Request(`http://pulse:3000/oauth/callback?${new URLSearchParams(q)}`));
const tokens = () => db.select().from(oauthTokens).all();
const seedOld = () =>
  db
    .insert(oauthTokens)
    .values({ id: 1, accessToken: "at-old", refreshToken: "rt-old", expiresAt: 1, scope: "s", updatedAt: 1 })
    .run();

beforeEach(() => {
  db = openDb(":memory:");
  h.db = db;
  h.cfg = live;
  tokenResponse = granted;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /oauth/callback", () => {
  it("is a 404 in demo mode", async () => {
    h.cfg = parseConfig(env);
    expect((await call({ state: createState(), code: "c" })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a missing or wrong state is rejected and leaves oauth_tokens unchanged", async () => {
    seedOld();
    const before = tokens();
    createState();
    expect((await call({ code: "c" })).status).toBe(400);
    expect((await call({ state: "forged", code: "c" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(tokens()).toEqual(before);
  });

  it("an expired state is rejected", async () => {
    const state = createState(Date.now() - 10 * 60_000 - 1);
    expect((await call({ state, code: "c" })).status).toBe(400);
  });

  it("a valid state exchanges the code, stores the grant and returns to settings", async () => {
    const res = await call({ state: createState(), code: "c0de" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=connected");
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.get("code")).toBe("c0de");
    expect(body.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
    expect(tokens()).toMatchObject([{ id: 1, accessToken: "at-NEW", refreshToken: "rt-NEW", revokedAt: null }]);
  });

  it("a reused state is rejected", async () => {
    const state = createState();
    expect((await call({ state, code: "c" })).status).toBe(302);
    expect((await call({ state, code: "c" })).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("no refresh_token stores nothing and surfaces auth_revoked, without logging the token", async () => {
    seedOld();
    const before = tokens();
    tokenResponse = () => new Response(JSON.stringify({ access_token: "at-NEW", expires_in: 3600 }));
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=auth_revoked");
    expect(tokens()).toEqual(before);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain("auth_revoked");
    expect(String(errors.mock.calls[0][0])).not.toContain("at-NEW");
  });

  it("a rejected code logs Google's code only, never the body", async () => {
    tokenResponse = () =>
      new Response(JSON.stringify({ error: "invalid_grant", error_description: "SECRET-DETAIL" }), { status: 400 });
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=invalid_grant");
    expect(errors.mock.calls.flat().join(" ")).not.toContain("SECRET-DETAIL");
    expect(tokens()).toEqual([]);
  });

  it("a denied consent returns to settings without a token request", async () => {
    const res = await call({ state: createState(), error: "access_denied" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=access_denied");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a network failure logs the error name only", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed at-SECRET"));
    const res = await call({ state: createState(), code: "c" });
    expect(res.headers.get("location")).toBe("https://pulse.example.com/settings?oauth=error");
    expect(errors.mock.calls.flat().join(" ")).toBe("[oauth] callback failed: TypeError");
  });
});
