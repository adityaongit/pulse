import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import { disconnectGoogle } from "./actions";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, revalidate: vi.fn(), session: null as unknown }));
vi.mock("@/server/auth", async (orig) => ({ ...(await orig<object>()), currentSession: async () => h.session }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const env = { TZ: "Asia/Kolkata" };
const live = parseConfig({ ...env, GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret" });
const ownerSession = { kind: "owner", email: "me@example.com" };

let db: Db;
const tokens = () => db.select().from(oauthTokens).all();

const fetchMock = vi.fn<typeof fetch>(async () => new Response("", { status: 200 }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  db = h.db = openDb(":memory:");
  db.insert(oauthTokens)
    .values({ id: 1, accessToken: "at", refreshToken: "rt", expiresAt: 1, scope: "s", updatedAt: 1 })
    .run();
});
afterEach(() => {
  vi.unstubAllGlobals();
  db.$client.close();
  vi.clearAllMocks();
});

describe("disconnectGoogle", () => {
  it("refuses anyone but the signed-in owner and keeps the grant", async () => {
    h.cfg = live;
    for (const session of [null, { kind: "demo" }]) {
      h.session = session;
      expect(await disconnectGoogle()).toEqual({ ok: false, error: "Signed out. Sign in again." });
    }
    h.session = ownerSession;
    h.cfg = parseConfig(env);
    expect(await disconnectGoogle()).toEqual({ ok: false, error: "Google is not enabled" });
    expect(tokens()).toHaveLength(1);
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("revokes every permission at Google, forgets the grant and revalidates the app", async () => {
    h.cfg = live;
    h.session = ownerSession;
    expect(await disconnectGoogle()).toEqual({ ok: true, data: undefined });
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://oauth2.googleapis.com/revoke");
    expect(tokens()).toEqual([]);
    expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
  });

  it("keeps the grant when Google can't be reached, so Disconnect can be retried", async () => {
    h.cfg = live;
    h.session = ownerSession;
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await disconnectGoogle()).toEqual({ ok: false, error: "Couldn't reach Google to remove access. Try again." });
    expect(tokens()).toHaveLength(1);
  });
});
