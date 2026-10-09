import { describe, expect, it } from "vitest";
import { ConfigError, parseConfig } from "./config";

const google = { GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" };

describe("parseConfig", () => {
  it("defaults: demo mode, port 3000, the local dev database, sign-up by invite", () => {
    const c = parseConfig({});
    expect(c.dataSource).toBe("demo");
    expect(c.google).toBeNull();
    expect(c.port).toBe(3000);
    expect(c.databaseUrl).toBe("postgres://pulse:pulse@localhost:5432/pulse");
    expect(c.signup).toBe("invite");
    expect(c.authSecret).toBeNull();
  });

  it("DB_POOL_MAX: 10 by default, 2 on Vercel, else as set; DATABASE_SSL_CA as PEM, escaped PEM or base64", () => {
    expect(parseConfig({}).dbPoolMax).toBe(10);
    expect(parseConfig({ VERCEL: "1" }).dbPoolMax).toBe(2);
    expect(parseConfig({ VERCEL: "1", DB_POOL_MAX: "1" }).dbPoolMax).toBe(1);
    expect(() => parseConfig({ DB_POOL_MAX: "0" })).toThrow(/DB_POOL_MAX/);
    const pem = "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----";
    expect(parseConfig({}).databaseSslCa).toBeNull();
    expect(parseConfig({ DATABASE_SSL_CA: pem }).databaseSslCa).toBe(pem);
    expect(parseConfig({ DATABASE_SSL_CA: pem.replace(/\n/g, "\\n") }).databaseSslCa).toBe(pem);
    expect(parseConfig({ DATABASE_SSL_CA: Buffer.from(pem).toString("base64") }).databaseSslCa).toBe(pem);
  });

  it("Google mode exposes the client, with no APP_URL by default", () => {
    const c = parseConfig({ ...google, DATA_SOURCE: "google" });
    expect(c.google).toEqual({ clientId: "id", clientSecret: "secret", appUrl: null });
  });

  it("APP_URL drops its trailing slash; DATABASE_URL, BETTER_AUTH_SECRET and DISABLE_SIGNUP pass through", () => {
    const c = parseConfig({
      ...google,
      DATA_SOURCE: "google",
      APP_URL: "https://pulse.example.com/",
      DATABASE_URL: "postgres://u:p@db:5432/pulse",
      BETTER_AUTH_SECRET: "x".repeat(32),
      DISABLE_SIGNUP: "true",
    });
    expect(c.google).toMatchObject({ appUrl: "https://pulse.example.com" });
    expect(c.appUrl).toBe("https://pulse.example.com");
    expect(c.databaseUrl).toBe("postgres://u:p@db:5432/pulse");
    expect(c.authSecret).toBe("x".repeat(32));
    expect(c.signup).toBe("closed");
  });

  it("SIGNUP picks invite, open or closed, and rejects anything else", () => {
    expect(parseConfig({ SIGNUP: "open" }).signup).toBe("open");
    expect(parseConfig({ SIGNUP: "closed" }).signup).toBe("closed");
    expect(parseConfig({ SIGNUP: "open", DISABLE_SIGNUP: "true" }).signup).toBe("closed");
    expect(() => parseConfig({ SIGNUP: "anyone" })).toThrow(/SIGNUP: must be invite, open or closed/);
  });

  it("ADMIN_EMAILS: a trimmed, lowercased list; empty by default; a bad address is named", () => {
    expect(parseConfig({}).adminEmails).toEqual([]);
    expect(parseConfig({ ADMIN_EMAILS: " Me@Example.com, ops@example.com ," }).adminEmails).toEqual(["me@example.com", "ops@example.com"]);
    expect(() => parseConfig({ ADMIN_EMAILS: "me@example.com, nope" })).toThrow(/ADMIN_EMAILS/);
  });

  it("coach: the owner's local model needs its URL and model together; off by default", () => {
    expect(parseConfig({}).coachLocal).toBeNull();
    expect(parseConfig({ COACH_LOCAL_URL: "http://localhost:11434/v1", COACH_LOCAL_MODEL: "llama3.2" }).coachLocal).toEqual({ url: "http://localhost:11434/v1", model: "llama3.2" });
    expect(() => parseConfig({ COACH_LOCAL_URL: "http://localhost:11434/v1" })).toThrow(/COACH_LOCAL_MODEL: set COACH_LOCAL_URL and COACH_LOCAL_MODEL together/);
    expect(parseConfig({}).coachMock).toBe(false);
  });

  it("android: package name and fingerprints together, fingerprints uppercased and split; off by default", () => {
    const fp = Array.from({ length: 32 }, () => "ab").join(":");
    expect(parseConfig({}).android).toBeNull();
    expect(parseConfig({ ANDROID_PACKAGE_NAME: "in.portlabs.pulse", ANDROID_CERT_SHA256: `${fp}, ${fp.toUpperCase()}` }).android).toEqual({
      packageName: "in.portlabs.pulse",
      fingerprints: [fp.toUpperCase(), fp.toUpperCase()],
    });
    expect(() => parseConfig({ ANDROID_PACKAGE_NAME: "in.portlabs.pulse" })).toThrow(/ANDROID_CERT_SHA256: required together/);
    expect(() => parseConfig({ ANDROID_PACKAGE_NAME: "pulse", ANDROID_CERT_SHA256: fp })).toThrow(/ANDROID_PACKAGE_NAME/);
    expect(() => parseConfig({ ANDROID_PACKAGE_NAME: "in.portlabs.pulse", ANDROID_CERT_SHA256: "AB:CD" })).toThrow(/ANDROID_CERT_SHA256/);
  });

  it("Google mode without a client ID fails with a named error", () => {
    const env = { ...google, DATA_SOURCE: "google", GOOGLE_CLIENT_ID: undefined };
    expect(() => parseConfig(env)).toThrow(ConfigError);
    expect(() => parseConfig(env)).toThrow(/GOOGLE_CLIENT_ID: required when DATA_SOURCE=google/);
  });

  it("treats empty values as unset", () => {
    expect(() => parseConfig({ ...google, DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("rejects a bad database URL, short secret, app URL or DATA_SOURCE, naming each", () => {
    const err = (() => {
      try {
        parseConfig({ DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: "short", APP_URL: "nope", DATA_SOURCE: "maybe" });
      } catch (e) {
        return e as Error;
      }
    })();
    expect(err).toBeInstanceOf(ConfigError);
    for (const key of ["DATABASE_URL", "BETTER_AUTH_SECRET", "APP_URL", "DATA_SOURCE"]) expect(err?.message).toContain(key);
  });
});
