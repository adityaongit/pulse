// The sync worker: every 15 minutes it walks the users with something to sync, one after another, so one person's
// backfill can't flood Google's per-project quota for everyone. Per user: pull, then recompute. A Postgres advisory
// lock per user keeps two processes (a second replica, a dev server beside a probe) off the same user.
import { asc, isNull } from "drizzle-orm";
import { after } from "next/server";
import pg from "pg";
import { getConfig } from "./config";
import { type Db, getDb, row, sql } from "./db";
import { oauthTokens } from "./db/schema";
import { ensureDefaultTags } from "./journalTags";
import { recomputeIfNeeded } from "./pipeline";
import { googleSource } from "./sources/google/sync";
import { ensureDemoUser, seedSource } from "./sources/seed/generate";
import type { Source } from "./sources/types";

const INTERVAL_MS = 15 * 60_000;
const FRESH_MS = 5 * 60_000;
/** The advisory lock's first key: "Pulse" in ASCII, so it can't collide with another app's locks on the database. */
const LOCK_KEY = 0x50756c73;

export type UserState = { running: boolean; lastRunAt: number | null; lastSuccessAt: number | null; lastError: string | null };

type WorkerDeps = {
  name: string;
  source: Source;
  recompute: (userId: number, changed: boolean) => Promise<void>;
  /** The users a scheduled cycle syncs, in order. */
  users: () => Promise<number[]>;
  /** Runs `fn` holding the user's lock; false (fn not run) when another process holds it. */
  lock?: (userId: number, fn: () => Promise<void>) => Promise<boolean>;
  /** 0: no timer loop (serverless, where a cron calls runCycle instead). */
  intervalMs?: number;
  log?: Pick<Console, "info" | "error">;
};

/**
 * A sync loop over users. A user's runs never overlap, a failed run never stops the loop, and a cycle runs its
 * users one at a time. requestSync() runs one user now, outside the cycle.
 */
export function createWorker({ name, source, recompute, users, lock = (_, fn) => fn().then(() => true), intervalMs = INTERVAL_MS, log = console }: WorkerDeps) {
  let started = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const states = new Map<number, UserState & { again: boolean }>();
  const stateOf = (userId: number) => {
    let s = states.get(userId);
    if (!s) states.set(userId, (s = { running: false, lastRunAt: null, lastSuccessAt: null, lastError: null, again: false }));
    return s;
  };

  async function runUser(userId: number): Promise<void> {
    const s = stateOf(userId);
    s.running = true;
    try {
      const got = await lock(userId, async () => {
        const { changed } = await source.pull(userId);
        await recompute(userId, changed);
      });
      if (got) {
        s.lastSuccessAt = Date.now();
        s.lastError = null;
      }
    } catch (err) {
      s.lastError = err instanceof Error ? err.message : String(err);
      log.error(`[worker] user ${userId} run failed: ${s.lastError}`);
    } finally {
      s.lastRunAt = Date.now();
      s.running = false;
    }
    if (s.again) {
      s.again = false;
      await runUser(userId);
    }
  }

  async function cycle() {
    clearTimeout(timer);
    try {
      for (const userId of await users()) if (!stateOf(userId).running) await runUser(userId);
    } catch (err) {
      log.error(`[worker] listing users failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (intervalMs) timer = setTimeout(cycle, intervalMs);
    }
  }

  return {
    start() {
      if (started) return;
      started = true;
      log.info(`[worker] started (source: ${name})`);
      if (intervalMs) void cycle();
    },
    /** One scheduled cycle over every user, resolved when it has finished. */
    runCycle: cycle,
    /**
     * Runs the user now unless their run is in progress or their last one finished under 5 minutes ago.
     * Gated on the last finished run, not the last success, so a failing source isn't retried on every page load.
     * `force` (a new Google grant, a journal write) skips that gate, and mid-run queues one more run right after.
     */
    requestSync({ userId, force = false }: { userId: number; force?: boolean }): Promise<void> | undefined {
      if (!started) return;
      const s = stateOf(userId);
      if (s.running) {
        s.again ||= force;
        return;
      }
      if (!force && s.lastRunAt !== null && Date.now() - s.lastRunAt < FRESH_MS) return;
      return runUser(userId);
    },
    isRunning: (userId: number) => states.get(userId)?.running ?? false,
    stateOf(userId: number): UserState {
      const { running, lastRunAt, lastSuccessAt, lastError } = stateOf(userId);
      return { running, lastRunAt, lastSuccessAt, lastError };
    },
  };
}

export type Worker = ReturnType<typeof createWorker>;

/**
 * Runs `fn` holding an advisory lock on (LOCK_KEY, userId). On a pool, a dedicated client holds a transaction-level
 * lock for the run: a transaction keeps one server connection even behind a transaction-mode pooler (Neon on
 * Vercel), where a session lock and its unlock could land on different connections. PGlite (tests) is one session.
 */
export async function withUserLock(db: Db, userId: number, fn: () => Promise<void>): Promise<boolean> {
  const pool = (db as unknown as { $client?: unknown }).$client;
  if (pool instanceof pg.Pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const r = await client.query<{ ok: boolean }>("select pg_try_advisory_xact_lock($1, $2) as ok", [LOCK_KEY, userId]);
      if (r.rows[0]?.ok) await fn();
      return r.rows[0]?.ok ?? false;
    } finally {
      await client.query("rollback").catch(() => {}); // ends the transaction, releasing the lock; it wrote nothing
      client.release();
    }
  }
  const got = await row<{ ok: boolean }>(db, sql`select pg_try_advisory_lock(${LOCK_KEY}, ${userId}) as ok`);
  if (!got?.ok) return false;
  try {
    await fn();
  } finally {
    await db.execute(sql`select pg_advisory_unlock(${LOCK_KEY}, ${userId})`);
  }
  return true;
}

// globalThis singleton: survives dev reloads and is shared by the instrumentation and route bundles. Queries read
// `isRunning` / `stateOf` off it without importing this module.
const g = globalThis as typeof globalThis & { __pulseWorker?: Worker };

/** Starts the process-wide worker once. Called from instrumentation register(). */
export function startWorker() {
  if (g.__pulseWorker) return;
  const google = getConfig().dataSource === "google";
  // Demo instance: the one demo user, created on the first cycle (and retried on the next if that fails).
  let demo: Promise<number> | undefined;
  const demoUser = () =>
    (demo ??= (async () => {
      const db = getDb();
      const id = await ensureDemoUser(db);
      await ensureDefaultTags(db, id); // the Journal's default behaviours exist before the first sync
      return id;
    })().catch((err) => {
      demo = undefined;
      throw err;
    }));
  // Google instance: everyone with a live grant. A revoked one waits for the user to reconnect.
  const grantees = async () =>
    (await getDb().select({ id: oauthTokens.userId }).from(oauthTokens).where(isNull(oauthTokens.revokedAt)).orderBy(asc(oauthTokens.userId))).map((r) => r.id);
  g.__pulseWorker = createWorker({
    name: google ? "google" : "seed",
    source: google ? googleSource : seedSource,
    recompute: recomputeIfNeeded,
    users: google ? grantees : async () => [await demoUser()],
    lock: (userId, fn) => withUserLock(getDb(), userId, fn),
    // Vercel freezes a function between requests, so a timer loop would stall mid-sync: /api/cron runs the cycles.
    intervalMs: process.env.VERCEL ? 0 : INTERVAL_MS,
  });
  g.__pulseWorker.start();
}

/**
 * Fire-and-forget from page loads, so a morning visit doesn't wait for the next scheduled run.
 * `force` skips the 5-minute gate: for writes the next scores depend on (a new grant, a journal check-in).
 */
export function requestSync(opts: { userId: number; force?: boolean }) {
  const run = g.__pulseWorker?.requestSync(opts);
  if (run) after(run); // keeps a serverless function alive until the run lands
}

/** The cron's cycle (Vercel): every user, one after another. */
export async function runCycle() {
  await g.__pulseWorker?.runCycle();
}

/**
 * "Sync now": a forced run for the user, resolved when it has finished (a run already going finishes first, then
 * the forced one). Gives up waiting after `timeoutMs`; the run itself carries on.
 */
export async function syncAndWait(userId: number, timeoutMs = 60_000): Promise<{ ok: boolean; error: string | null }> {
  const w = g.__pulseWorker;
  if (!w) return { ok: false, error: "The sync worker isn’t running" };
  let runs = w.isRunning(userId) ? 2 : 1;
  let seen = w.stateOf(userId).lastRunAt;
  w.requestSync({ userId, force: true });
  const end = Date.now() + timeoutMs;
  while (runs > 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 200));
    const now = w.stateOf(userId).lastRunAt;
    if (now !== seen) {
      seen = now;
      runs--;
    }
  }
  if (runs > 0) return { ok: true, error: null }; // still going: the status updates when it lands
  const { lastError } = w.stateOf(userId);
  return { ok: lastError === null, error: lastError };
}
