import { beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "./db";
import { instance } from "./db/schema";
import { claimOrCheckOwner, isHttps, signSession, verifySession } from "./session";

let db: Db;
beforeEach(() => {
  db = openDb(":memory:");
});
const google = (ownerEmail: string | null = null) => ({ googleEnabled: true, ownerEmail });
const demo = { googleEnabled: false, ownerEmail: null };

describe("session", () => {
  it("round-trips an owner session while that account owns the instance", async () => {
    claimOrCheckOwner(db, "me@example.com", null);
    const t = await signSession(db, { kind: "owner", email: "me@example.com" });
    expect(await verifySession(db, t, google())).toEqual({ kind: "owner", email: "me@example.com" });
  });

  it("refuses missing, forged and expired tokens", async () => {
    claimOrCheckOwner(db, "me@example.com", null);
    const t = await signSession(db, { kind: "owner", email: "me@example.com" });
    expect(await verifySession(db, undefined, google())).toBeNull();
    expect(await verifySession(db, t.slice(0, -2) + "xx", google())).toBeNull();
    // Signed by another instance's secret.
    const other = openDb(":memory:");
    claimOrCheckOwner(other, "me@example.com", null);
    expect(await verifySession(db, await signSession(other, { kind: "owner", email: "me@example.com" }), google())).toBeNull();
    expect(await verifySession(db, t, { ...google(), now: Date.now() + 91 * 86_400_000 })).toBeNull();
  });

  it("a demo session only counts on a demo instance, an owner session only for the current owner", async () => {
    const d = await signSession(db, { kind: "demo" });
    expect(await verifySession(db, d, demo)).toEqual({ kind: "demo" });
    expect(await verifySession(db, d, google())).toBeNull();
    const o = await signSession(db, { kind: "owner", email: "me@example.com" });
    expect(await verifySession(db, o, google("boss@example.com"))).toBeNull();
    expect(await verifySession(db, o, demo)).toBeNull();
  });

  it("the secret is generated once and kept", async () => {
    await signSession(db, { kind: "demo" });
    const s = db.select().from(instance).get()!.sessionSecret;
    expect(s).toMatch(/^[\w-]{43}$/);
    await signSession(db, { kind: "demo" });
    expect(db.select().from(instance).get()!.sessionSecret).toBe(s);
  });
});

describe("claimOrCheckOwner", () => {
  it("the first account claims; later ones are refused; case doesn't matter", () => {
    expect(claimOrCheckOwner(db, "Me@Example.com", null)).toBe(true);
    expect(claimOrCheckOwner(db, "me@example.com", null)).toBe(true);
    expect(claimOrCheckOwner(db, "other@example.com", null)).toBe(false);
    expect(db.select().from(instance).get()!.ownerEmail).toBe("me@example.com");
  });

  it("OWNER_EMAIL decides alone and claims nothing", () => {
    expect(claimOrCheckOwner(db, "me@example.com", "boss@example.com")).toBe(false);
    expect(claimOrCheckOwner(db, "BOSS@example.com", "boss@example.com")).toBe(true);
    expect(db.select().from(instance).get()?.ownerEmail ?? null).toBeNull();
  });
});

it("isHttps reads the forwarded protocol first", () => {
  expect(isHttps(new Request("http://x/"))).toBe(false);
  expect(isHttps(new Request("https://x/"))).toBe(true);
  expect(isHttps(new Request("http://x/", { headers: { "x-forwarded-proto": "https" } }))).toBe(true);
});
