import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getConfig } from "../config";
import * as schema from "./schema";

/** Opens (creating the parent directory if needed) and migrates a database file. */
export function openDb(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

export type Db = ReturnType<typeof openDb>;

// globalThis, not module scope: Next loads instrumentation and routes as separate bundles, and dev reloads modules.
const g = globalThis as typeof globalThis & { __pulseDb?: Db };

/** The app database at config.databasePath, opened and migrated on first use. */
export function getDb(): Db {
  return (g.__pulseDb ??= openDb(getConfig().databasePath));
}
