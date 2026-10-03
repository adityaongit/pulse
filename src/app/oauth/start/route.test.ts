import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import { consumeState } from "@/server/sources/google/oauth";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = { TZ: "Asia/Kolkata" };
const google = { GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" };
const start = (url = "http://192.168.1.10:3000/oauth/start") => GET(new Request(url));
const location = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => {
  h.db = openDb(":memory:");
});

describe("GET /oauth/start", () => {
  it("is a 404 on a demo instance", () => {
    h.cfg = parseConfig(env);
    expect(start().status).toBe(404);
  });

  it("redirects to Google with offline access, consent (no grant yet) and a single-use state", () => {
    h.cfg = parseConfig({ ...env, ...google });
    const res = start();
    expect(res.status).toBe(302);
    const url = location(res);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("scope")).toMatch(/^openid email profile /);
    // No APP_URL: the redirect follows the host the request came in on.
    expect(url.searchParams.get("redirect_uri")).toBe("http://192.168.1.10:3000/oauth/callback");
    const state = url.searchParams.get("state");
    expect(consumeState(state)).toBe(true);
    expect(consumeState(state)).toBe(false);
  });

  it("APP_URL pins the redirect host", () => {
    h.cfg = parseConfig({ ...env, ...google, APP_URL: "https://pulse.example.com" });
    expect(location(start()).searchParams.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
  });

  it("a returning owner with a working grant only picks the account", () => {
    h.cfg = parseConfig({ ...env, ...google });
    (h.db as Db).insert(oauthTokens).values({ id: 1, accessToken: "a", refreshToken: "r", expiresAt: 1, scope: "s", updatedAt: 1 }).run();
    expect(location(start()).searchParams.get("prompt")).toBe("select_account");
  });
});
