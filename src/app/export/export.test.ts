// The /export/* route handlers (U21): formats, the session check inside each handler, and no secrets in any file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "@/server/config";
import type { Db } from "@/server/db";
import { instance, oauthTokens } from "@/server/db/schema";
import { toCsv } from "@/server/export";
import { addTag } from "@/server/journalTags";
import { saveProfile } from "@/server/profile";
import { SESSION_COOKIE, signSession } from "@/server/session";
import { cleanup, seeded } from "@/server/testing";
import { GET as backup } from "./backup/route";
import { GET as daily } from "./daily/route";
import { GET as journal } from "./journal/route";

const h = vi.hoisted(() => ({ cfg: undefined as unknown, db: undefined as unknown }));
vi.mock("@/server/config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("@/server/db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));

const demoCfg = parseConfig({ TZ: "Asia/Kolkata" });
const ownerCfg = parseConfig({ TZ: "Asia/Kolkata", GOOGLE_OAUTH_ENABLED: "true", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "csecret", OWNER_EMAIL: "me@example.com" });
const SECRETS = ["at-SECRET-access", "rt-SECRET-refresh"];

let db: Db;
let secret: string;
const req = (url: string, cookie?: string) => new NextRequest(`http://pulse:3000${url}`, { headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {} });
const demo = () => signSession(db, { kind: "demo" });
const owner = () => signSession(db, { kind: "owner", email: "me@example.com" });
const noSecrets = (text: string) => {
  for (const s of [...SECRETS, secret]) expect(text).not.toContain(s);
};

beforeAll(() => {
  db = h.db = seeded();
  db.insert(oauthTokens).values({ id: 1, accessToken: SECRETS[0], refreshToken: SECRETS[1], expiresAt: 1, scope: "s", updatedAt: 1 }).run();
  db.insert(instance).values({ id: 1, sessionSecret: "instance-SECRET-0123456789abcdef", ownerEmail: "me@example.com" }).onConflictDoNothing().run();
  secret = db.select().from(instance).get()!.sessionSecret;
  saveProfile(db, { birthDate: "1990-01-01", sex: "male", maxHr: null, heightCm: null });
  addTag(db, "=cmd", "=HYPERLINK(\"x\")");
  db.$client.prepare("insert into journal_entries (day, tag, value) values ('2026-10-01', '=cmd', 1)").run();
});
afterAll(cleanup);
beforeEach(() => {
  h.cfg = demoCfg;
});

describe("/export/daily and /export/journal", () => {
  it("refuse a request without a session (401), whatever the proxy did", async () => {
    for (const handler of [daily, journal]) expect((await handler(req("/export/x?format=csv"))).status).toBe(401);
    expect((await daily(req("/export/daily?format=csv", "forged.token.value"))).status).toBe(401);
  });

  it("daily CSV: an attachment, one row per day, the documented columns, no secrets", async () => {
    const res = await daily(req("/export/daily?format=csv", await demo()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="pulse-daily-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    const lines = text.trimEnd().split("\r\n");
    expect(lines[0]).toBe("day,recovery_pct,strain,sleep_performance_pct,sleep_minutes,sleep_consistency_pct,hrv_ms,resting_hr_bpm,respiratory_rate_rpm,stress_avg,steps");
    expect(lines.length).toBeGreaterThanOrEqual(181);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},/);
    noSecrets(text);
  });

  it("daily JSON and a bad format", async () => {
    const res = await daily(req("/export/daily?format=json", await demo()));
    const body = (await res.json()) as { timeZone: string; days: Record<string, unknown>[] };
    expect(res.headers.get("content-disposition")).toMatch(/\.json"$/);
    expect(body.timeZone).toBe("Asia/Kolkata");
    expect(Object.keys(body.days[0])).toContain("hrv_ms");
    expect((await daily(req("/export/daily?format=xml", await demo()))).status).toBe(400);
  });

  it("journal CSV defuses formulas in user labels; the JSON lists behaviours; no secrets", async () => {
    const csv = await (await journal(req("/export/journal?format=csv", await demo()))).text();
    expect(csv.split("\r\n")[0]).toBe("day,behaviour,label,answer");
    expect(csv).toContain(`2026-10-01,'=cmd,"'=HYPERLINK(""x"")",1`);
    noSecrets(csv);
    const json = (await (await journal(req("/export/journal?format=json", await demo()))).json()) as { behaviours: { tag: string; custom: boolean }[]; entries: unknown[] };
    expect(json.behaviours.find((b) => b.tag === "alcohol")).toMatchObject({ custom: false });
    expect(json.entries.length).toBeGreaterThan(100);
    noSecrets(JSON.stringify(json));
  });
});

describe("/export/backup", () => {
  it("refuses no session (401) and a demo session (403)", async () => {
    expect((await backup(req("/export/backup"))).status).toBe(401);
    expect((await backup(req("/export/backup", await demo()))).status).toBe(403);
  });

  it("an owner gets a whole SQLite copy with no OAuth grant and no instance row, and the live database keeps both", async () => {
    h.cfg = ownerCfg;
    const res = await backup(req("/export/backup", await owner()));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="pulse-backup-\d{4}-\d{2}-\d{2}\.db"$/);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 16).toString("latin1")).toBe("SQLite format 3\0");
    for (const s of [...SECRETS, secret]) expect(bytes.includes(Buffer.from(s))).toBe(false);
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pulse-restore-")), "copy.db");
    fs.writeFileSync(file, bytes);
    const copy = new Database(file, { readonly: true });
    try {
      expect(copy.prepare("select count(*) from oauth_tokens").pluck().get()).toBe(0);
      expect(copy.prepare("select count(*) from instance").pluck().get()).toBe(0);
      expect(copy.prepare("select count(*) from daily_scores").pluck().get()).toBe(db.$client.prepare("select count(*) from daily_scores").pluck().get());
      expect(copy.prepare("select count(*) from journal_entries").pluck().get()).toBe(db.$client.prepare("select count(*) from journal_entries").pluck().get());
    } finally {
      copy.close();
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
    expect(db.select().from(oauthTokens).get()?.accessToken).toBe(SECRETS[0]);
    expect(db.select().from(instance).get()?.sessionSecret).toBe(secret);
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and newlines, and leaves numbers and nulls plain", () => {
    expect(toCsv({ columns: ["a", "b"], rows: [["x,y", 'say "hi"'], [1.5, null], ["-1", "line\nbreak"]] })).toBe(
      'a,b\r\n"x,y","say ""hi"""\r\n1.5,\r\n\'-1,"line\nbreak"\r\n'
    );
  });
});
