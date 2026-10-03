import { getConfig } from "./config";
import { getDb } from "./db";
import { ensureDefaultTags } from "./journalTags";
import { recomputeIfNeeded } from "./pipeline";
import { googleSource } from "./sources/google/sync";
import { seedSource } from "./sources/seed/generate";
import type { Source } from "./sources/types";

const INTERVAL_MS = 15 * 60_000;
const FRESH_MS = 5 * 60_000;

type WorkerDeps = {
  name: string;
  source: Source;
  recompute: (changed: boolean) => Promise<void>;
  intervalMs?: number;
  log?: Pick<Console, "info" | "error">;
};

/** A sync loop: pull, then recompute, then wait. Runs never overlap and a failed run never stops the loop. */
export function createWorker({ name, source, recompute, intervalMs = INTERVAL_MS, log = console }: WorkerDeps) {
  let started = false;
  let running = false;
  let again = false; // a forced request arrived mid-run: run once more as soon as this one ends
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state = {
    lastRunAt: null as number | null,
    lastSuccessAt: null as number | null,
    lastError: null as string | null,
    running: false,
  };

  async function run() {
    running = state.running = true;
    clearTimeout(timer);
    try {
      const { changed } = await source.pull();
      await recompute(changed);
      state.lastSuccessAt = Date.now();
      state.lastError = null;
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
      log.error(`[worker] run failed: ${state.lastError}`);
    } finally {
      state.lastRunAt = Date.now();
      running = state.running = false;
      timer = setTimeout(run, again ? 0 : intervalMs);
      again = false;
    }
  }

  return {
    state,
    start() {
      if (started) return;
      started = true;
      log.info(`[worker] started (source: ${name})`);
      void run();
    },
    /**
     * Runs now unless a run is in progress or the last one finished under 5 minutes ago.
     * Gated on the last finished run, not the last success, so a failing source isn't retried on every page load.
     * `force` (a new Google grant, a journal write) skips that gate, and mid-run queues one more run right after.
     */
    requestSync({ force = false } = {}) {
      if (!started) return;
      if (running) {
        again ||= force;
        return;
      }
      if (!force && state.lastRunAt !== null && Date.now() - state.lastRunAt < FRESH_MS) return;
      void run();
    },
  };
}

export type Worker = ReturnType<typeof createWorker>;

// globalThis singleton: survives dev reloads and is shared by the instrumentation and route bundles.
const g = globalThis as typeof globalThis & { __pulseWorker?: Worker };

/** Starts the process-wide worker once. Called from instrumentation register(). */
export function startWorker() {
  if (g.__pulseWorker) return;
  const google = getConfig().googleOAuthEnabled;
  ensureDefaultTags(getDb()); // both modes: the Journal's default behaviours exist before the first sync
  g.__pulseWorker = createWorker({
    name: google ? "google" : "seed",
    source: google ? googleSource : seedSource,
    recompute: recomputeIfNeeded,
  });
  g.__pulseWorker.start();
}

/**
 * Fire-and-forget from page loads, so a morning visit doesn't wait for the next scheduled run.
 * `force` skips the 5-minute gate: for writes the next scores depend on (a new grant, a journal check-in).
 */
export function requestSync(opts?: { force?: boolean }) {
  g.__pulseWorker?.requestSync(opts);
}

/**
 * "Sync now": a forced run, resolved when it has finished (a run already going finishes first, then the
 * forced one). Gives up waiting after `timeoutMs`; the run itself carries on.
 */
export async function syncAndWait(timeoutMs = 60_000): Promise<{ ok: boolean; error: string | null }> {
  const w = g.__pulseWorker;
  if (!w) return { ok: false, error: "The sync worker isn't running" };
  let runs = w.state.running ? 2 : 1;
  let seen = w.state.lastRunAt;
  w.requestSync({ force: true });
  const end = Date.now() + timeoutMs;
  while (runs > 0 && Date.now() < end) {
    await new Promise((r) => setTimeout(r, 200));
    if (w.state.lastRunAt !== seen) {
      seen = w.state.lastRunAt;
      runs--;
    }
  }
  if (runs > 0) return { ok: true, error: null }; // still going: the status updates when it lands
  return { ok: w.state.lastError === null, error: w.state.lastError };
}
