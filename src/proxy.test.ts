import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { saveProfile } from "@/server/profile";
import { claimOrCheckOwner, SESSION_COOKIE, signSession } from "@/server/session";
import { config, proxy } from "./proxy";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

let db: Db;
const google = parseConfig({ TZ: "UTC", GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s" });
const demo = parseConfig({ TZ: "UTC" });
const go = async (path: string, cookie?: string) => {
  const res = await proxy(new NextRequest(`http://pulse:3000${path}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} }));
  return res ? new URL(res.headers.get("location")!).pathname : "pass";
};
const owner = async () => {
  claimOrCheckOwner(db, "me@example.com", null);
  return signSession(db, { kind: "owner", email: "me@example.com" });
};

beforeEach(() => {
  db = h.db = openDb(":memory:");
  h.cfg = google;
});

describe("proxy", () => {
  it("signed out: every screen goes to /login, and /login itself passes", async () => {
    expect(await go("/")).toBe("/login");
    expect(await go("/settings")).toBe("/login");
    expect(await go("/onboarding")).toBe("/login");
    expect(await go("/login")).toBe("pass");
  });

  it("signed in without a profile: onboarding first; with one: no onboarding and no login", async () => {
    const t = await owner();
    expect(await go("/", t)).toBe("/onboarding");
    expect(await go("/onboarding", t)).toBe("pass");
    saveProfile(db, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null });
    expect(await go("/", t)).toBe("pass");
    expect(await go("/onboarding", t)).toBe("/");
    expect(await go("/login", t)).toBe("/");
  });

  it("a demo session is only valid on a demo instance", async () => {
    saveProfile(db, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null });
    const t = await signSession(db, { kind: "demo" });
    expect(await go("/", t)).toBe("/login");
    h.cfg = demo;
    expect(await go("/", t)).toBe("pass");
  });

  it("the matcher leaves Google's redirect, the health check, build assets and public files open", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const p of ["/oauth/callback", "/oauth/start", "/healthz", "/_next/static/x.js", "/icon.svg", "/manifest.webmanifest", "/icons/oauth-logo-120.png"])
      expect(re.test(p), p).toBe(false);
    for (const p of ["/", "/settings", "/login", "/onboarding", "/strain/2026-10-01"]) expect(re.test(p), p).toBe(true);
  });
});
