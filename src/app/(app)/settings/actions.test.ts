import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { openDb, type Db } from "@/server/db";
import { oauthTokens } from "@/server/db/schema";
import { disconnectGoogle } from "./actions";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown, revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
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
const tokens = () => db.select().from(oauthTokens).all();

beforeEach(() => {
  db = h.db = openDb(":memory:");
  db.insert(oauthTokens)
    .values({ id: 1, accessToken: "at", refreshToken: "rt", expiresAt: 1, scope: "s", updatedAt: 1 })
    .run();
});
afterEach(() => {
  db.$client.close();
  vi.clearAllMocks();
});

describe("disconnectGoogle", () => {
  it("refuses when Google is not enabled and keeps the grant", async () => {
    h.cfg = parseConfig(env);
    expect(await disconnectGoogle()).toEqual({ ok: false, error: "Google is not enabled" });
    expect(tokens()).toHaveLength(1);
    expect(h.revalidate).not.toHaveBeenCalled();
  });

  it("forgets the grant and revalidates the app", async () => {
    h.cfg = live;
    expect(await disconnectGoogle()).toEqual({ ok: true, data: undefined });
    expect(tokens()).toEqual([]);
    expect(h.revalidate).toHaveBeenCalledWith("/", "layout");
  });
});
