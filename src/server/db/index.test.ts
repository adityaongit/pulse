import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "./index";
import * as schema from "./schema";

const tables = Object.values(schema as Record<string, unknown>).filter((t): t is SQLiteTable => is(t, SQLiteTable));

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-db-"));
  file = path.join(dir, "nested", "test.db");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("openDb", () => {
  it("creates the parent directory and every schema table, with matching columns", () => {
    const db = openDb(file);
    const names = db.$client
      .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%'")
      .pluck()
      .all();
    expect(names.sort()).toEqual(tables.map(getTableName).sort());
    for (const t of tables) {
      const cols = db.$client.prepare(`select name from pragma_table_info('${getTableName(t)}')`).pluck().all();
      expect(cols.sort(), getTableName(t)).toEqual(getTableConfig(t).columns.map((c) => c.name).sort());
    }
    db.$client.close();
  });

  it("enables WAL, a busy timeout and foreign keys", () => {
    const db = openDb(file);
    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.$client.pragma("busy_timeout", { simple: true })).toBe(5000);
    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
    db.$client.close();
  });

  it("makes hr_samples and steps_minutes WITHOUT ROWID", () => {
    const db = openDb(file);
    const wr = db.$client.prepare("select name, wr from pragma_table_list where name in ('hr_samples', 'steps_minutes')").all();
    expect(wr).toEqual(
      expect.arrayContaining([
        { name: "hr_samples", wr: 1 },
        { name: "steps_minutes", wr: 1 },
      ]),
    );
    db.$client.close();
  });

  it("booting again is a no-op", () => {
    const first = openDb(file);
    first.insert(schema.intradayDirty).values({ day: "2026-10-01" }).run();
    first.$client.close();
    const db = openDb(file);
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: unknown[] };
    expect(db.$client.prepare("select count(*) from __drizzle_migrations").pluck().get()).toBe(journal.entries.length);
    expect(db.select().from(schema.intradayDirty).all()).toEqual([{ day: "2026-10-01" }]);
    db.$client.close();
  });

  it("dedupes raw_payloads on (type, range_start, range_end, body_hash)", () => {
    const db = openDb(file);
    const row = { type: "sleep", rangeStart: 1, rangeEnd: 2, bodyHash: "abc", gzBody: Buffer.from("x"), fetchedAt: 3 };
    db.insert(schema.rawPayloads).values(row).onConflictDoNothing().run();
    db.insert(schema.rawPayloads).values(row).onConflictDoNothing().run();
    expect(db.select().from(schema.rawPayloads).all()).toHaveLength(1);
    db.insert(schema.rawPayloads).values({ ...row, bodyHash: "def" }).onConflictDoNothing().run();
    expect(db.select().from(schema.rawPayloads).all()).toHaveLength(2);
    db.$client.close();
  });

  it("allows only one oauth_tokens row", () => {
    const db = openDb(file);
    const tok = { accessToken: "a", refreshToken: "r", expiresAt: 1, scope: "s", updatedAt: 1 };
    db.insert(schema.oauthTokens).values({ id: 1, ...tok }).run();
    expect(() => db.insert(schema.oauthTokens).values({ id: 2, ...tok }).run()).toThrow(/CHECK constraint/);
    db.$client.close();
  });

  it("deletes a sleep session's segments with it", () => {
    const db = openDb(file);
    db.insert(schema.sleepSessions)
      .values({ id: "s1", day: "2026-10-01", startTs: 0, endTs: 100, isMain: true, processed: true, source: "seed" })
      .run();
    db.insert(schema.sleepSegments).values({ sessionId: "s1", startTs: 0, endTs: 100, stage: "DEEP" }).run();
    db.delete(schema.sleepSessions).run();
    expect(db.select().from(schema.sleepSegments).all()).toHaveLength(0);
    db.$client.close();
  });
});
