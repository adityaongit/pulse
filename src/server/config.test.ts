import path from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./config";

const base = { TZ: "Asia/Kolkata" };
const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };

describe("parseConfig", () => {
  it("demo mode is valid without Google variables and resolves data/demo.db", () => {
    const c = parseConfig({ ...base, GOOGLE_OAUTH_ENABLED: "false" });
    expect(c.googleOAuthEnabled).toBe(false);
    expect(c.google).toBeNull();
    expect(c.databasePath).toBe(path.resolve("data/demo.db"));
  });

  it("defaults to demo mode on port 3000", () => {
    const c = parseConfig(base);
    expect(c.googleOAuthEnabled).toBe(false);
    expect(c.port).toBe(3000);
  });

  it("Google mode resolves data/pulse.db and exposes the client, with no APP_URL or owner by default", () => {
    const c = parseConfig({ ...base, ...google, GOOGLE_OAUTH_ENABLED: "true" });
    expect(c.databasePath).toBe(path.resolve("data/pulse.db"));
    expect(c.google).toEqual({ clientId: "id", clientSecret: "secret", appUrl: null, ownerEmail: null });
  });

  it("APP_URL drops its trailing slash and OWNER_EMAIL is lowercased", () => {
    const c = parseConfig({ ...base, ...google, GOOGLE_OAUTH_ENABLED: "true", APP_URL: "https://pulse.example.com/", OWNER_EMAIL: "Me@Example.com" });
    expect(c.google).toMatchObject({ appUrl: "https://pulse.example.com", ownerEmail: "me@example.com" });
  });

  it("DATABASE_PATH overrides the mode default", () => {
    expect(parseConfig({ ...base, DATABASE_PATH: "/tmp/x.db" }).databasePath).toBe("/tmp/x.db");
  });

  it("Google mode without a client ID fails with a named error", () => {
    const env = { ...base, ...google, GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: undefined };
    expect(() => parseConfig(env)).toThrow(ConfigError);
    expect(() => parseConfig(env)).toThrow(/GOOGLE_CLIENT_ID: required when GOOGLE_OAUTH_ENABLED=true/);
  });

  it("treats empty values as unset", () => {
    expect(() => parseConfig({ ...base, ...google, GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("rejects a bad time zone, owner email or GOOGLE_OAUTH_ENABLED, naming each", () => {
    const err = (() => {
      try {
        parseConfig({ TZ: "Mars/Olympus", OWNER_EMAIL: "nope", GOOGLE_OAUTH_ENABLED: "maybe" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    for (const key of ["TZ", "OWNER_EMAIL", "GOOGLE_OAUTH_ENABLED"]) expect(err?.message).toContain(key);
  });
});
