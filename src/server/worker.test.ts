import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorker, syncAndWait } from "./worker";

const MIN = 60_000;
const log = { info: vi.fn(), error: vi.fn() };

function setup(pull = vi.fn(async () => ({ changed: true }))) {
  const recompute = vi.fn(async (changed: boolean) => void changed);
  const worker = createWorker({ name: "test", source: { pull }, recompute, intervalMs: 15 * MIN, log });
  return { worker, pull, recompute };
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

  it("passes the source's changed flag to recompute", async () => {
    const { worker, recompute } = setup(vi.fn(async () => ({ changed: false })));
    worker.start();
    await tick();
    expect(recompute).toHaveBeenCalledWith(false);
  });

  it("a run that throws records the error and the loop keeps going", async () => {
    const pull = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ changed: false });
    const { worker } = setup(pull);
    worker.start();
    await tick();
    expect(worker.state.lastError).toBe("boom");
    expect(worker.state.lastSuccessAt).toBeNull();
    await tick(15 * MIN);
    expect(pull).toHaveBeenCalledTimes(2);
    expect(worker.state.lastError).toBeNull();
    expect(worker.state.lastSuccessAt).not.toBeNull();
  });

  it("requestSync() during a run starts no second run", async () => {
    let finish = () => {};
    const pull = vi.fn(() => new Promise<{ changed: boolean }>((r) => (finish = () => r({ changed: false }))));
    const { worker } = setup(pull);
    worker.start();
    await tick(10 * MIN); // still in the first run
    worker.requestSync();
    expect(pull).toHaveBeenCalledTimes(1);
    finish();
    await tick();
    expect(worker.state.lastSuccessAt).not.toBeNull();
  });

  it("requestSync() 2 minutes after a success does nothing; 6 minutes after starts a run", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    await tick(2 * MIN);
    worker.requestSync();
    await tick();
    expect(pull).toHaveBeenCalledTimes(1);
    await tick(4 * MIN);
    worker.requestSync();
    await tick();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("a requested run reschedules the loop instead of adding a second timer", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    await tick(6 * MIN);
    worker.requestSync(); // run 2 at 6 min, next scheduled at 21 min
    await tick();
    await tick(9 * MIN); // 15 min: the original schedule must not fire
    expect(pull).toHaveBeenCalledTimes(2);
    await tick(6 * MIN); // 21 min
    expect(pull).toHaveBeenCalledTimes(3);
  });

  it("requestSync() before start() does nothing", async () => {
    const { worker, pull } = setup();
    worker.requestSync();
    await tick();
    expect(pull).not.toHaveBeenCalled();
  });

  it("requestSync({ force }) 2 minutes after a run starts one anyway", async () => {
    const { worker, pull } = setup();
    worker.start();
    await tick();
    await tick(2 * MIN);
    worker.requestSync({ force: true });
    await tick();
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("requestSync({ force }) during a run queues one more run right after it", async () => {
    let finish = () => {};
    const pull = vi.fn(() => new Promise<{ changed: boolean }>((r) => (finish = () => r({ changed: false }))));
    const { worker } = setup(pull);
    worker.start();
    await tick();
    worker.requestSync({ force: true });
    worker.requestSync({ force: true });
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

describe("syncAndWait", () => {
  it("resolves after the forced run, with its error", async () => {
    vi.useRealTimers(); // it polls on real time
    const g = globalThis as typeof globalThis & { __pulseWorker?: unknown };
    let fail = false;
    const w = createWorker({
      name: "t",
      source: { pull: async () => (fail ? Promise.reject(new Error("[google] sleep: http_503 (HTTP 503)")) : { changed: false }) },
      recompute: async () => {},
      log: { info: () => {}, error: () => {} },
    });
    g.__pulseWorker = w;
    w.start();
    await vi.waitFor(() => expect(w.state.lastRunAt).not.toBeNull());
    expect(await syncAndWait(5_000)).toEqual({ ok: true, error: null });
    fail = true;
    expect(await syncAndWait(5_000)).toEqual({ ok: false, error: "[google] sleep: http_503 (HTTP 503)" });
    delete g.__pulseWorker;
  });
});
