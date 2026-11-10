import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseConfig, type Config } from "../config";
import type { Db } from "../db";
import { coachSetup, setCoachMode, setConsent } from "../coach/store";
import { freshDb, USER } from "../testing";
import { removeProviderAction, saveProviderAction } from "./coach";

const h = vi.hoisted(() => ({
  db: undefined as unknown,
  cfg: undefined as unknown,
  user: null as unknown,
  generateText: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("next/cache", () => ({ revalidatePath: h.revalidate }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("../config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("ai", async (orig) => ({ ...(await orig<object>()), generateText: h.generateText }));

const google = (extra: Record<string, string> = {}) =>
  parseConfig({ DATA_SOURCE: "google", GOOGLE_CLIENT_ID: "c", GOOGLE_CLIENT_SECRET: "s", BETTER_AUTH_SECRET: "x".repeat(32), ADMIN_EMAILS: "owner@pulse.test", ...extra });
const as = (userId: number) => (h.user = { userId, email: "x@pulse.test", name: "X", username: null, image: null });

let db: Db;

beforeEach(async () => {
  h.cfg = google();
  db = h.db = await freshDb();
  await setCoachMode(db, "everyone");
  await setConsent(db, USER, true);
  as(USER);
  h.generateText.mockReset();
  h.revalidate.mockReset();
});

describe("saveProviderAction with custom / local providers", () => {
  it("rejects when signed out or without coach access", async () => {
    h.user = null;
    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "http://localhost:11434/v1" })).toEqual({
      ok: false,
      error: "Signed out. Sign in again.",
    });

    as(USER);
    await setCoachMode(db, "off");
    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "http://localhost:11434/v1" })).toEqual({
      ok: false,
      error: "Coach isn’t turned on for your account.",
    });
  });

  it("validates endpoint URL safely: requires http/https and blocks metadata SSRF hosts", async () => {
    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "" })).toEqual({
      ok: false,
      error: "Enter the endpoint URL.",
    });

    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "not-a-valid-url" })).toEqual({
      ok: false,
      error: "Enter a valid URL (e.g. http://localhost:11434/v1).",
    });

    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "ftp://localhost:11434/v1" })).toEqual({
      ok: false,
      error: "URL must start with http:// or https://",
    });

    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "http://169.254.169.254/latest/meta-data/" })).toEqual({
      ok: false,
      error: "Invalid endpoint host.",
    });

    expect(await saveProviderAction({ provider: "custom", model: "llama3.2", baseUrl: "http://metadata.google.internal/computeMetadata/v1" })).toEqual({
      ok: false,
      error: "Invalid endpoint host.",
    });
  });

  it("saves custom / local provider without an API key when test call passes", async () => {
    h.generateText.mockResolvedValueOnce({ text: "OK" });

    const res = await saveProviderAction({
      provider: "custom",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
    });

    expect(res).toEqual({ ok: true, data: undefined });
    expect(h.generateText).toHaveBeenCalledTimes(1);

    const setup = await coachSetup(db, USER);
    expect(setup).toEqual({
      provider: "custom",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
      last4: null,
      consent: true,
      instructions: null,
      briefMinute: null,
    });
  });

  it("saves custom provider with an optional API key", async () => {
    h.generateText.mockResolvedValueOnce({ text: "OK" });

    const res = await saveProviderAction({
      provider: "custom",
      model: "llama3.2",
      baseUrl: "https://ai.example.com/v1",
      apiKey: "sk-custom-secret-key-1234",
    });

    expect(res).toEqual({ ok: true, data: undefined });

    const setup = await coachSetup(db, USER);
    expect(setup).toEqual({
      provider: "custom",
      model: "llama3.2",
      baseUrl: "https://ai.example.com/v1",
      last4: "1234",
      consent: true,
      instructions: null,
      briefMinute: null,
    });
  });

  it("returns a helpful error when test request fails", async () => {
    h.generateText.mockRejectedValueOnce(new Error("Connection refused"));

    const res = await saveProviderAction({
      provider: "custom",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
    });

    expect(res).toEqual({
      ok: false,
      error: "That didn’t work: check the endpoint URL, model id, or key, and that the server is reachable.",
    });

    // Verify nothing got saved
    const setup = await coachSetup(db, USER);
    expect(setup.provider).toBeNull();
  });

  it("removeProviderAction clears the provider and endpoint URL", async () => {
    h.generateText.mockResolvedValueOnce({ text: "OK" });
    await saveProviderAction({
      provider: "custom",
      model: "llama3.2",
      baseUrl: "http://localhost:11434/v1",
    });

    const res = await removeProviderAction();
    expect(res).toEqual({ ok: true, data: undefined });

    const setup = await coachSetup(db, USER);
    expect(setup.provider).toBeNull();
    expect(setup.baseUrl).toBeNull();
  });
});
