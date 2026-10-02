import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { checkAccess } from "./access";
import { parseConfig } from "./config";

const teamDomain = "https://team.cloudflareaccess.com";
const aud = "aud-tag";
const env = { BIRTH_DATE: "1990-06-15", SEX: "male", TZ: "Asia/Kolkata" };
const access = parseConfig({ ...env, CF_ACCESS_TEAM_DOMAIN: teamDomain, CF_ACCESS_AUD: aud }).access;

let getKey: ReturnType<typeof createLocalJWKSet>;
let sign: (o?: { aud?: string; exp?: string | number }) => Promise<string>;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  getKey = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
  sign = (o = {}) =>
    new SignJWT({ email: "me@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(teamDomain)
      .setAudience(o.aud ?? aud)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? "1h")
      .sign(privateKey);
});

const req = (path: string, token?: string) =>
  new Request(`http://pulse:3000${path}`, token ? { headers: { "Cf-Access-Jwt-Assertion": token } } : {});
const status = async (r: Request, a = access) => (await checkAccess(r, a, getKey))?.status ?? "pass";

describe("checkAccess", () => {
  it("rejects a missing assertion", async () => {
    expect(await status(req("/"))).toBe(403);
  });

  it("rejects a tampered assertion", async () => {
    const [h, p, s] = (await sign()).split(".");
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    const forged = Buffer.from(JSON.stringify({ ...claims, email: "evil@example.com" })).toString("base64url");
    expect(await status(req("/", [h, forged, s].join(".")))).toBe(403);
  });

  it("rejects an expired assertion", async () => {
    expect(await status(req("/", await sign({ exp: Math.floor(Date.now() / 1000) - 60 })))).toBe(403);
  });

  it("rejects the wrong aud", async () => {
    expect(await status(req("/", await sign({ aud: "other-app" })))).toBe(403);
  });

  it("passes a valid assertion", async () => {
    expect(await status(req("/sleep?d=2026-10-01", await sign()))).toBe("pass");
  });

  it("passes /healthz without an assertion", async () => {
    expect(await status(req("/healthz"))).toBe("pass");
  });

  it("does not exempt the manifest", async () => {
    expect(await status(req("/manifest.webmanifest"))).toBe(403);
  });

  it("bypasses only when config says so", async () => {
    const dev = parseConfig({ ...env, NODE_ENV: "development", DEV_ACCESS_BYPASS: "1" }).access;
    expect(await status(req("/"), dev)).toBe("pass");
    expect(() => parseConfig({ ...env, NODE_ENV: "production", DEV_ACCESS_BYPASS: "1" })).toThrow(/DEV_ACCESS_BYPASS/);
    expect(await status(req("/"), access)).toBe(403);
  });
});
