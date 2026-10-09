import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorker, syncAndWait, withUserLock } from "./worker";
import { freshDb } from "./testing";
import { GoogleError } from "./sources/google/oauth";

const MIN = 60_000;
const U = 7;
const log = { info: vi.fn(), error: vi.fn() };

function setup(pull = vi.fn<(userId: number) => Promise<{ changed: boolean }>>(async () => ({ changed: true })), users = async () => [U]) {
  const recompute = vi.fn(async (_: number, changed: boolean) => void changed);
  const worker = createWorker({ name: "test", source: { pull }, recompute, users, intervalMs: 15 * MIN, log });
  return { worker, pull, recompute, state: () => worker.stateOf(U) };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("createWorker", () => {
  it("start() twice starts one loop", async () => {
    const { worker, pull } = setup();
    worker.start();
    worker.start();
    await tick();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledTimes(1);
    await tick(15 * MIN);
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("intervalMs 0 (serverless): start() runs no loop, runCycle() runs one cycle and schedules nothing", async () => {
    const pull = vi.fn(async () => ({ changed: true }));
    const worker = createWorker({ name: "test", source: { pull }, recompute: async () => {}, users: async () => [U], intervalMs: 0, log });
    worker.start();
    await tick(60 * MIN);
    expect(pull).not.toHaveBeenCalled();
    await worker.runCycle();
    expect(pull).toHaveBeenCalledTimes(1);
    await tick(60 * MIN);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("requestSync returns the run it starts, so a serverless caller can wait on it", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    expect(worker.requestSync({ userId: U })).toBeUndefined(); // fresh: gated
    const run = worker.requestSync({ userId: U, force: true });
    expect(run).toBeInstanceOf(Promise);
    await run;
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("passes the source's changed flag to recompute", async () => {
    const { worker, recompute } = setup(vi.fn(async () => ({ changed: false })));
    worker.start();
    await tick();
    expect(recompute).toHaveBeenCalledWith(U, false);
  });

  it("a cycle syncs its users a few at a time, each one once, never the same user twice at once", async () => {
    let active = 0;
    let most = 0;
    const pull = vi.fn<(userId: number) => Promise<{ changed: boolean }>>(async () => {
      most = Math.max(most, ++active);
      await new Promise((r) => setTimeout(r, 1000));
      active--;
      return { changed: true };
    });
    const { worker, recompute } = setup(pull, async () => [1, 2, 3, 4, 5, 6]);
    worker.start();
    await tick(0);
    expect(pull.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4]); // the first four start together
    await tick(1000);
    expect(pull.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4, 5, 6]); // the rest follow as slots free up
    await tick(2000);
    expect(recompute.mock.calls.map((c) => c[0]).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(most).toBe(4);
  });

  it("requestSync({ force, pull: false }) recomputes without a pull, and a queued run keeps the stronger ask", async () => {
    const { worker, pull, recompute } = setup();
    worker.start();
    await tick();
    expect(pull).toHaveBeenCalledTimes(1);
    worker.requestSync({ userId: U, force: true, pull: false });
    await tick();
    expect(pull).toHaveBeenCalledTimes(1);
    expect(recompute).toHaveBeenLastCalledWith(U, false);
    // During a recompute-only run, a forced pull request queues a run that pulls.
    const slow = vi.fn<(userId: number) => Promise<{ changed: boolean }>>(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return { changed: true };
    });
    const w2 = setup(slow);
    w2.worker.start();
    await tick(0); // the first cycle's run is in its 1-second pull
    w2.worker.requestSync({ userId: U, force: true, pull: false });
    w2.worker.requestSync({ userId: U, force: true });
    await tick(3000);
    expect(slow).toHaveBeenCalledTimes(2);
  });

  it("a user whose lock is held elsewhere is skipped, not failed", async () => {
    const pull = vi.fn<(userId: number) => Promise<{ changed: boolean }>>(async () => ({ changed: true }));
    const worker = createWorker({ name: "t", source: { pull }, recompute: async () => {}, users: async () => [1, 2], lock: async (id, fn) => (id === 1 ? false : (await fn(), true)), log });
    worker.start();
    await tick();
    expect(pull.mock.calls.map((c) => c[0])).toEqual([2]);
    expect(worker.stateOf(1)).toMatchObject({ lastError: null, lastSuccessAt: null });
  });

  it("a run that throws records the error and the loop keeps going", async () => {
    const pull = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ changed: false });
    const { worker, state } = setup(pull);
    worker.start();
    await tick();
    expect(state().lastError).toBe("boom");
    expect(state().lastSuccessAt).toBeNull();
    await tick(15 * MIN);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(state().lastError).toBeNull();
    expect(state().lastSuccessAt).not.toBeNull();
  });

  it("requestSync() during a run starts no second run", async () => {
    let finish = () => {};
    const pull = vi.fn(() => new Promise<{ changed: boolean }>((r) => (finish = () => r({ changed: false }))));
    const { worker, state } = setup(pull);
    worker.start();
    await tick(10 * MIN); // still in the first run
    expect(worker.isRunning(U)).toBe(true);
    worker.requestSync({ userId: U });
    expect(pull).toHaveBeenCalledTimes(1);
    finish();
    await tick();
    expect(state().lastSuccessAt).not.toBeNull();
    expect(worker.isRunning(U)).toBe(false);
  });

  it("requestSync() 2 minutes after a success does nothing; 6 minutes after starts a run", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    await tick(2 * MIN);
    worker.requestSync({ userId: U });
    await tick();
    expect(pull).toHaveBeenCalledTimes(1);
    await tick(4 * MIN);
    worker.requestSync({ userId: U });
    await tick();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("the 5-minute gate is per user", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    worker.requestSync({ userId: 8 });
    await tick();
    expect(pull.mock.calls.map((c) => c[0])).toEqual([U, 8]);
  });

  it("requestSync() before start() does nothing", async () => {
    const { worker, pull } = setup();
    worker.requestSync({ userId: U });
    await tick();
    expect(pull).not.toHaveBeenCalled();
  });

  it("requestSync({ force }) 2 minutes after a run starts one anyway", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    await tick(2 * MIN);
    worker.requestSync({ userId: U, force: true });
    await tick();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("requestSync({ force }) during a run queues one more run right after it", async () => {
    let finish = () => {};
    const pull = vi.fn(() => new Promise<{ changed: boolean }>((r) => (finish = () => r({ changed: false }))));
    const { worker } = setup(pull);
    worker.start();
    await tick();
    worker.requestSync({ userId: U, force: true });
    worker.requestSync({ userId: U, force: true });
    expect(pull).toHaveBeenCalledTimes(1);
    finish();
    await tick();
    expect(pull).toHaveBeenCalledTimes(2); // one follow-up, however many requests
    finish();
    await tick();
    await tick(14 * MIN); // then back on the 15-minute schedule
    expect(pull).toHaveBeenCalledTimes(2);
    await tick(MIN);
    expect(pull).toHaveBeenCalledTimes(3);
  });
});

describe("pullHeartRate (live)", () => {
  function live(hr = vi.fn<(userId: number) => Promise<void>>(async () => {})) {
    const pull = vi.fn<(userId: number) => Promise<{ changed: boolean }>>(async () => {
      await new Promise((r) => setTimeout(r, 1000));
      return { changed: false };
    });
    const worker = createWorker({ name: "test", source: { pull, pullHeartRate: hr }, recompute: async () => {}, users: async () => [U], intervalMs: 15 * MIN, log });
    return { worker, pull, hr };
  }

  it("runs at most once a minute per user, however often it is asked", async () => {
    const { worker, hr } = live();
    await Promise.all([worker.pullHeartRate(U), worker.pullHeartRate(U)]);
    await worker.pullHeartRate(U);
    expect(hr).toHaveBeenCalledTimes(1);
    await worker.pullHeartRate(8); // another user has their own minute
    expect(hr).toHaveBeenCalledTimes(2);
    await tick(MIN);
    await worker.pullHeartRate(U);
    expect(hr).toHaveBeenCalledTimes(3);
  });

  it("is skipped while the user's full run is going", async () => {
    const { worker, hr } = live();
    worker.start();
    await tick(0); // the first cycle's run is in its 1-second pull
    expect(worker.isRunning(U)).toBe(true);
    await worker.pullHeartRate(U);
    expect(hr).not.toHaveBeenCalled();
  });

  it("after a 429 (or a revoked grant) stops until the next full run, then resumes", async () => {
    for (const err of [new GoogleError("RESOURCE_EXHAUSTED", 429), new GoogleError("auth_revoked", 401)]) {
      const { worker, hr } = live(vi.fn(async () => Promise.reject(err)));
      await worker.pullHeartRate(U);
      await tick(5 * MIN);
      await worker.pullHeartRate(U);
      expect(hr).toHaveBeenCalledTimes(1);
      worker.start();
      await tick(2000); // the full run finishes
      await worker.pullHeartRate(U);
      expect(hr).toHaveBeenCalledTimes(2);
    }
  });

  it("another failure only waits out the minute, and never throws", async () => {
    const { worker, hr } = live(vi.fn(async () => Promise.reject(new GoogleError("network"))));
    await expect(worker.pullHeartRate(U)).resolves.toBeUndefined();
    await tick(MIN);
    await worker.pullHeartRate(U);
    expect(hr).toHaveBeenCalledTimes(2);
  });

  it("a source without one (the demo seed) does nothing", async () => {
    const { worker } = setup();
    await expect(worker.pullHeartRate(U)).resolves.toBeUndefined();
  });
});

describe("syncAndWait", () => {
  it("resolves after the forced run, with its error", async () => {
    vi.useRealTimers(); // it polls on real time
    const g = globalThis as typeof globalThis & { __pulseWorker?: unknown };
    let fail = false;
    const w = createWorker({
      name: "t",
      source: { pull: async () => (fail ? Promise.reject(new Error("[google] sleep: http_503 (HTTP 503)")) : { changed: false }) },
      recompute: async () => {},
      users: async () => [U],
      log: { info: () => {}, error: () => {} },
    });
    g.__pulseWorker = w;
    w.start();
    await vi.waitFor(() => expect(w.stateOf(U).lastRunAt).not.toBeNull());
    expect(await syncAndWait(U, 5_000)).toEqual({ ok: true, error: null });
    fail = true;
    expect(await syncAndWait(U, 5_000)).toEqual({ ok: false, error: "[google] sleep: http_503 (HTTP 503)" });
    delete g.__pulseWorker;
  });
});

describe("withUserLock", () => {
  it("takes and releases the lock around the run (PGlite is one session, so it can't show a refusal)", async () => {
    vi.useRealTimers();
    const db = await freshDb({ install: false });
    let ran = 0;
    expect(await withUserLock(db, 1, async () => void ran++)).toBe(true);
    expect(await withUserLock(db, 1, async () => void ran++)).toBe(true); // released
    expect(ran).toBe(2);
    const { rows } = await import("./db");
    expect(await rows(db, (await import("./db")).sql`select 1 from pg_locks where locktype = 'advisory'`)).toEqual([]);
  });
});
