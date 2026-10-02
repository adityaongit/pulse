// Test helpers: a seeded demo database in a temp directory, and the options the pipeline and queries need.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Db, openDb } from "./db";
import { type PipelineOptions, recompute } from "./pipeline";
import type { QueryCtx } from "./queries/common";
import { seedPull } from "./sources/seed/generate";

export const TZ = "Asia/Kolkata";
export const PROFILE = { birthDate: "1990-01-01", sex: "male" as const, maxHr: 183, maxHrSet: true, heightCm: 178 };
export const OPTS: PipelineOptions = { timeZone: TZ, profile: PROFILE };
/** Friday 14:00, after wake; the seeded range then starts on Monday 2026-04-06 (day index 0). */
export const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
export const ANCHOR = "2026-04-06";
export const DAY_S = 86_400;

export const dayAt = (i: number) => new Date(Date.parse(ANCHOR) + i * DAY_S * 1000).toISOString().slice(0, 10);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-test-"));
let n = 0;
export const tempFile = () => path.join(dir, `${n++}.db`);

/** A demo database seeded up to each of `nows` in turn (unix seconds), optionally recomputed. */
export function seeded(nows: number[] = [NOW], { compute = true } = {}): Db {
  const db = openDb(tempFile());
  for (const now of nows) seedPull(db, { now, timeZone: TZ, maxHr: PROFILE.maxHr });
  if (compute) recompute(db, OPTS);
  return db;
}

export const ctxFor = (db: Db, now = NOW): QueryCtx => ({ db, timeZone: TZ, profile: PROFILE, mode: "demo", now });

/** Every row of a table, in key order, as one string. */
export function dump(db: Db, table: string, order = "1") {
  return JSON.stringify(db.$client.prepare(`select * from ${table} order by ${order}`).raw().all());
}

/** Copies a database file (after a checkpoint, so the copy is whole) and opens the copy. */
export function copyDb(db: Db): Db {
  db.$client.pragma("wal_checkpoint(TRUNCATE)");
  const to = tempFile();
  fs.copyFileSync(db.$client.name, to);
  return openDb(to);
}

/** Removes every temp database; call from afterAll. */
export const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
