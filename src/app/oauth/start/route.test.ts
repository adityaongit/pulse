import { describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import { consumeState } from "@/server/sources/google/oauth";
import { GET } from "./route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));

const env = {
  BIRTH_DATE: "1990-06-15",
  SEX: "male",
  TZ: "Asia/Kolkata",
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud",
};
const google = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret", APP_URL: "https://pulse.example.com" };

describe("GET /oauth/start", () => {
  it("is a 404 in demo mode", () => {
    h.cfg = parseConfig(env);
    expect(GET().status).toBe(404);
  });

  it("redirects to Google consent with offline access, forced consent and a single-use state", () => {
    h.cfg = parseConfig({ ...env, ...google, GOOGLE_OAUTH_ENABLED: "true" });
    const res = GET();
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.host).toBe("accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://pulse.example.com/oauth/callback");
    const state = url.searchParams.get("state");
    expect(consumeState(state)).toBe(true);
    expect(consumeState(state)).toBe(false);
  });
});
