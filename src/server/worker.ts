import { getConfig } from "./config";
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state = {
    lastRunAt: null as number | null,
    lastSuccessAt: null as number | null,
    lastError: null as string | null,
  };

  async function run() {
    running = true;
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
      running = false;
      timer = setTimeout(run, intervalMs);
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
     */
    requestSync() {
      if (!started || running) return;
      if (state.lastRunAt !== null && Date.now() - state.lastRunAt < FRESH_MS) return;
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
  g.__pulseWorker = createWorker({
    name: google ? "google" : "seed",
    source: google ? googleSource : seedSource,
    recompute: recomputeIfNeeded,
  });
  g.__pulseWorker.start();
}

/** Fire-and-forget from page loads, so a morning visit doesn't wait for the next scheduled run. */
export function requestSync() {
  g.__pulseWorker?.requestSync();
}
