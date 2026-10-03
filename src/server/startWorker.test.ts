import { afterEach, expect, it, vi } from "vitest";

vi.mock("./sources/seed/generate", () => ({ seedSource: { pull: async () => ({ changed: false }) } }));
vi.mock("./sources/google/sync", () => ({ googleSource: { pull: async () => ({ changed: false }) } }));
vi.mock("./pipeline", () => ({ recomputeIfNeeded: async () => {} }));
const ensureDefaultTags = vi.fn(() => 0);
vi.mock("./db", () => ({ getDb: () => ({}) }));
vi.mock("./journalTags", () => ({ ensureDefaultTags }));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  delete (globalThis as { __pulseWorker?: unknown }).__pulseWorker;
});

it("startWorker() is a process-wide singleton that logs one start", async () => {
  vi.useFakeTimers();
  vi.stubEnv("GOOGLE_OAUTH_ENABLED", "false");
  vi.stubEnv("TZ", "UTC");
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const { startWorker } = await import("./worker");
  startWorker();
  startWorker();
  expect(info).toHaveBeenCalledTimes(1);
  expect(info).toHaveBeenCalledWith("[worker] started (source: seed)");
  expect(ensureDefaultTags).toHaveBeenCalledTimes(1);
});
