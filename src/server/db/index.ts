// The Postgres connection: one `pg` pool per process (globalThis, so Next's separate bundles and dev reloads share
// it). Tests swap in an in-process PGlite database with setDb(). Migrations run at boot (instrumentation.ts).
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate as pgMigrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { type Config, getConfig } from "../config";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Works for the node-postgres pool and for PGlite (tests), and for a transaction handle. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

// count(*) and sums come back as int8 (string by default) and numeric (string): numbers fit every value Pulse stores.
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export const MIGRATIONS = path.join(process.cwd(), "drizzle");

const g = globalThis as typeof globalThis & { __pulseDb?: Db; __pulsePool?: pg.Pool };

/**
 * The pool's settings. With DATABASE_SSL_CA, TLS is verified against that CA and the URL's ssl* parameters are
 * dropped: pg lets the URL's parameters win over the `ssl` option, and `sslmode=require` would check the server
 * against the public CAs only (Aiven signs with its own). On Vercel, idle connections close sooner, since a frozen
 * instance holds them against the plan's connection limit.
 */
export function poolOptions(cfg: Pick<Config, "databaseUrl" | "databaseSslCa" | "dbPoolMax">, vercel = !!process.env.VERCEL): pg.PoolConfig {
  let connectionString = cfg.databaseUrl;
  let ssl: pg.PoolConfig["ssl"];
  if (cfg.databaseSslCa) {
    const url = new URL(connectionString);
    for (const k of [...url.searchParams.keys()]) if (k.startsWith("ssl") || k === "uselibpqcompat") url.searchParams.delete(k);
    connectionString = url.toString();
    ssl = { ca: cfg.databaseSslCa, rejectUnauthorized: true };
  }
  return { connectionString, ssl, max: cfg.dbPoolMax, ...(vercel ? { idleTimeoutMillis: 5_000 } : {}) };
}

/** The app database: a pool on DATABASE_URL, created on first use. */
export function getDb(): Db {
  if (g.__pulseDb) return g.__pulseDb;
  const pool = (g.__pulsePool ??= new pg.Pool(poolOptions(getConfig())));
  return (g.__pulseDb = drizzle(pool, { schema }) as unknown as Db);
}

/** Replaces the app database (tests: a PGlite instance). */
export function setDb(db: Db | undefined) {
  g.__pulseDb = db;
}

/** Applies pending migrations, retrying while Postgres starts (compose brings it up alongside the app). */
export async function migrateDb(db = getDb(), { retries = 30, waitMs = 2000 } = {}) {
  for (let i = 0; ; i++) {
    try {
      await pgMigrate(db as never, { migrationsFolder: MIGRATIONS });
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      const notUp = code === "ECONNREFUSED" || code === "57P03" || code === "ENOTFOUND" || code === "EAI_AGAIN";
      if (!notUp || i >= retries) throw err;
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

/** Rows of a raw query, the same on node-postgres and PGlite. Use `sql` with parameters, never string-built SQL. */
export async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  const r = (await db.execute(query)) as unknown as { rows: T[] };
  return r.rows;
}

/** The first row of a raw query, or undefined. */
export async function row<T>(db: Db, query: SQL): Promise<T | undefined> {
  return (await rows<T>(db, query))[0];
}

export { sql };
