import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { parseConfig, type Config } from "../config";
import type { Db } from "../db";
import { coachSettings } from "../db/schema";
import { addUser, freshDb } from "../testing";
import { coachSetup, saveProvider, setCoachMode, setConsent } from "../coach/store";
import { saveProviderAction } from "./coach";

const h = vi.hoisted(() => ({
  cfg: undefined as unknown,
  user: null as unknown,
  db: undefined as unknown,
  generateText: vi.fn(),
}));

vi.mock("../config", async (orig) => ({ ...(await orig<object>()), getConfig: () => h.cfg as Config }));
vi.mock("../auth", async (orig) => ({ ...(await orig<object>()), currentUser: async () => h.user }));
vi.mock("../db", async (orig) => ({ ...(await orig<object>()), getDb: () => h.db as Db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("ai", async (orig) => ({
  ...(await orig<object>()),
  generateText: vi.fn(async (args) => {
    h.generateText(args);
    if (args.model?.modelId === "nonexistent-model") throw new Error("not_found");
    return { text: "OK" };
  }),
}));

const as = (userId: number) => (h.user = { userId, email: "user@pulse.test", name: "User", username: null, image: null });

let db: Db;
let member: number;

beforeEach(async () => {
  h.cfg = parseConfig({
    DATA_SOURCE: "google",
    GOOGLE_CLIENT_ID: "c",
    GOOGLE_CLIENT_SECRET: "s",
    BETTER_AUTH_SECRET: "x".repeat(32),
  });
  db = h.db = await freshDb();
  member = await addUser(db, "member@pulse.test");
  await setCoachMode(db, "everyone");
  await setConsent(db, member, true);
  as(member);
  h.generateText.mockClear();
});

describe("saveProviderAction", () => {
  it("rejects when signed out or without coach access", async () => {
    h.user = null;
    const res1 = await saveProviderAction({ provider: "openai", model: "gpt-4o", apiKey: "sk-test-key-12345" });
    expect(res1.ok).toBe(false);

    as(member);
    await setCoachMode(db, "off");
    const res2 = await saveProviderAction({ provider: "openai", model: "gpt-4o", apiKey: "sk-test-key-12345" });
    expect(res2).toEqual({ ok: false, error: "Coach isn’t turned on for your account." });
  });

  it("saves a new provider and key after test call succeeds", async () => {
    const res = await saveProviderAction({ provider: "openai", model: "gpt-4o", apiKey: "sk-test-key-12345" });
    expect(res).toEqual({ ok: true, data: undefined });
    expect(h.generateText).toHaveBeenCalledTimes(1);

    const setup = await coachSetup(db, member);
    expect(setup.provider).toBe("openai");
    expect(setup.model).toBe("gpt-4o");
    expect(setup.last4).toBe("2345");
  });

  it("allows changing model without re-entering API key when keeping the same provider", async () => {
    await saveProvider(db, member, "openai", "gpt-4o", "sk-secret-key-1234");
    const [initialRow] = await db.select().from(coachSettings).where(eq(coachSettings.userId, member));

    // Change model with empty string apiKey
    const res = await saveProviderAction({ provider: "openai", model: "gpt-4o-mini", apiKey: "" });
    expect(res).toEqual({ ok: true, data: undefined });
    expect(h.generateText).toHaveBeenCalledTimes(1);

    const [updatedRow] = await db.select().from(coachSettings).where(eq(coachSettings.userId, member));
    expect(updatedRow.model).toBe("gpt-4o-mini");
    expect(updatedRow.keyLast4).toBe("1234");
    expect(updatedRow.keyCiphertext).toEqual(initialRow.keyCiphertext);
  });

  it("allows changing model when apiKey is null or omitted", async () => {
    await saveProvider(db, member, "openai", "gpt-4o", "sk-secret-key-1234");
    const [initialRow] = await db.select().from(coachSettings).where(eq(coachSettings.userId, member));

    const res = await saveProviderAction({ provider: "openai", model: "gpt-4.1-mini", apiKey: null });
    expect(res).toEqual({ ok: true, data: undefined });

    const [updatedRow] = await db.select().from(coachSettings).where(eq(coachSettings.userId, member));
    expect(updatedRow.model).toBe("gpt-4.1-mini");
    expect(updatedRow.keyCiphertext).toEqual(initialRow.keyCiphertext);
  });

  it("requires API key when switching to a different provider even if a key is saved for another", async () => {
    await saveProvider(db, member, "openai", "gpt-4o", "sk-secret-key-1234");

    const res = await saveProviderAction({ provider: "anthropic", model: "claude-3-7-sonnet-latest", apiKey: "" });
    expect(res).toEqual({ ok: false, error: "Paste your API key." });

    // Model and provider shouldn't change
    const setup = await coachSetup(db, member);
    expect(setup.provider).toBe("openai");
    expect(setup.model).toBe("gpt-4o");
  });

  it("does not update model if the test request fails", async () => {
    await saveProvider(db, member, "openai", "gpt-4o", "sk-secret-key-1234");

    const res = await saveProviderAction({ provider: "openai", model: "nonexistent-model", apiKey: "" });
    expect(res).toEqual({ ok: false, error: "That didn’t work: check the key and the model id, and that your account has credit." });

    const setup = await coachSetup(db, member);
    expect(setup.model).toBe("gpt-4o");
  });
});
