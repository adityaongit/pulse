import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./config";

const now = new Date("2026-10-02T12:00:00Z");
const base = {
  BIRTH_DATE: "1990-06-15",
  SEX: "male",
  TZ: "Asia/Kolkata",
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com/",
  CF_ACCESS_AUD: "aud-123",
};
const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", APP_URL: "https://pulse.example.com/" };

describe("parseConfig", () => {
  it("demo mode is valid without Google variables and resolves data/demo.db", () => {
    const c = parseConfig({ ...base, GOOGLE_OAUTH_ENABLED: "false" }, now);
    expect(c.googleOAuthEnabled).toBe(false);
    expect(c.google).toBeNull();
    expect(c.databasePath).toBe(path.resolve("data/demo.db"));
  });

  it("defaults to demo mode on port 3000", () => {
    const c = parseConfig(base, now);
    expect(c.googleOAuthEnabled).toBe(false);
    expect(c.port).toBe(3000);
  });

  it("Google mode resolves data/pulse.db and exposes the client", () => {
    const c = parseConfig({ ...base, ...google, GOOGLE_OAUTH_ENABLED: "true" }, now);
    expect(c.databasePath).toBe(path.resolve("data/pulse.db"));
    expect(c.google).toEqual({ clientId: "id", clientSecret: "secret", appUrl: "https://pulse.example.com" });
  });

  it("DATABASE_PATH overrides the mode default", () => {
    expect(parseConfig({ ...base, DATABASE_PATH: "/tmp/x.db" }, now).databasePath).toBe("/tmp/x.db");
  });

  it("Google mode without a client ID fails with a named error", () => {
    const env = { ...base, ...google, GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: undefined };
    expect(() => parseConfig(env, now)).toThrow(ConfigError);
    expect(() => parseConfig(env, now)).toThrow(/GOOGLE_CLIENT_ID: required when GOOGLE_OAUTH_ENABLED=true/);
  });

  it("treats empty values as unset", () => {
    const env = { ...base, ...google, GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "" };
    expect(() => parseConfig(env, now)).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("missing CF_ACCESS_AUD with the bypass off fails", () => {
    expect(() => parseConfig({ ...base, CF_ACCESS_AUD: undefined }, now)).toThrow(/CF_ACCESS_AUD: required unless DEV_ACCESS_BYPASS=1/);
  });

  it("DEV_ACCESS_BYPASS=1 without NODE_ENV=development fails", () => {
    for (const NODE_ENV of ["production", "test", undefined]) {
      expect(() => parseConfig({ ...base, DEV_ACCESS_BYPASS: "1", NODE_ENV }, now)).toThrow(/DEV_ACCESS_BYPASS/);
    }
  });

  it("DEV_ACCESS_BYPASS=1 in development needs no Access values", () => {
    const env = { ...base, CF_ACCESS_TEAM_DOMAIN: undefined, CF_ACCESS_AUD: undefined, DEV_ACCESS_BYPASS: "1", NODE_ENV: "development" };
    expect(parseConfig(env, now).access).toEqual({ bypass: true });
  });

  it("Access values are kept when the bypass is off", () => {
    expect(parseConfig(base, now).access).toEqual({
      bypass: false,
      teamDomain: "https://team.cloudflareaccess.com",
      aud: "aud-123",
    });
  });

  it("max HR is MAX_HR when set, otherwise Tanaka from age", () => {
    expect(parseConfig({ ...base, MAX_HR: "190" }, now).profile.maxHr).toBe(190);
    // Age 36 on 2026-10-02: 208 - 0.7 * 36 = 182.8
    expect(parseConfig(base, now).profile.maxHr).toBe(183);
    // Birthday not reached yet, age 35: 208 - 0.7 * 35 = 183.5
    expect(parseConfig({ ...base, BIRTH_DATE: "1990-12-01" }, now).profile.maxHr).toBe(184);
  });

  it("rejects malformed profile values, naming each", () => {
    const env = { ...base, BIRTH_DATE: "15/06/1990", SEX: "x", TZ: "Mars/Olympus", MAX_HR: "abc" };
    const err = (() => {
      try {
        parseConfig(env, now);
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    for (const key of ["BIRTH_DATE", "SEX", "TZ", "MAX_HR"]) expect(err?.message).toContain(key);
  });

  it("rejects a non-boolean GOOGLE_OAUTH_ENABLED", () => {
    expect(() => parseConfig({ ...base, GOOGLE_OAUTH_ENABLED: "maybe" }, now)).toThrow(/GOOGLE_OAUTH_ENABLED/);
  });
});
