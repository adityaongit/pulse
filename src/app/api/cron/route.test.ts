// The cron endpoint: the secret by Bearer header, x-cron-secret header or ?secret=, refused without CRON_SECRET.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const h = vi.hoisted(() => ({ cycle: vi.fn(async () => {}) }));
vi.mock("@/server/worker", () => ({ runCycle: h.cycle }));

const SECRET = "s".repeat(32);
const call = (query = "", headers: Record<string, string> = {}, handler = GET) => handler(new Request(`http://pulse:3000/api/cron${query}`, { headers }));

beforeEach(() => vi.stubEnv("CRON_SECRET", SECRET));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/cron", () => {
  it("runs a cycle for Vercel's Bearer header, an x-cron-secret header or ?secret=", async () => {
    for (const res of [
      await call("", { authorization: `Bearer ${SECRET}` }),
      await call("", { "x-cron-secret": SECRET }),
      await call(`?secret=${SECRET}`),
      await call(`?secret=${SECRET}`, {}, POST),
    ]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(h.cycle).toHaveBeenCalledTimes(4);
  });

  it("refuses a missing or wrong secret", async () => {
    for (const res of [await call(), await call("?secret=nope"), await call("", { authorization: "Bearer nope" }), await call(`?secret=${SECRET}x`)]) {
      expect(res.status).toBe(401);
    }
    expect(h.cycle).not.toHaveBeenCalled();
  });

  it("refuses everything while CRON_SECRET is unset, even an empty secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("?secret=")).status).toBe(401);
    expect((await call("", { authorization: "Bearer " })).status).toBe(401);
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await call("?secret=undefined")).status).toBe(401);
    expect(h.cycle).not.toHaveBeenCalled();
  });
});
