"use server";
// The coach's Server Actions: consent, the user's provider and key (tested before it is saved), and deleting chats.
// Each checks the session and coach access itself.
import { generateText } from "ai";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, SIGNED_OUT } from "../auth";
import { MAX_NOTES } from "../coach/instructions";
import { providerOf } from "../coach/providers";
import { coachAccess, deleteAllChats, deleteChat, groupChats, listChats, modelFor, removeProvider, saveProvider, savedApiKey, setConsent, setPreferences, type ChatCursor, type ChatGroup } from "../coach/store";
import { ctxOf } from "../queries/common";
import { getConfig } from "../config";
import { getDb } from "../db";
import type { ActionResult } from "./journal";

const NO_ACCESS = { ok: false as const, error: "Coach isn’t turned on for your account." };
const DONE = { ok: true as const, data: undefined };

async function member(): Promise<number | ActionResult<never>> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  if (!(await coachAccess(getDb(), me.userId))) return NO_ACCESS;
  return me.userId;
}

export async function setConsentAction(on: boolean): Promise<ActionResult> {
  const me = await member();
  if (typeof me !== "number") return me;
  await setConsent(getDb(), me, on === true);
  revalidatePath("/coach");
  revalidatePath("/settings");
  return DONE;
}

const KeySchema = z.string().trim().min(8, "That key looks too short.").max(500);
const Provider = z.object({
  provider: z.string().max(32),
  model: z.string().trim().min(1, "Enter a model.").max(120).regex(/^[\w.:/@-]+$/, "That model id has characters no provider uses."),
  apiKey: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), KeySchema.nullable().optional()),
});

/** Saves the provider and key after one tiny test request works, so a bad key is never stored. */
export async function saveProviderAction(input: z.input<typeof Provider>): Promise<ActionResult> {
  const me = await member();
  if (typeof me !== "number") return me;
  const r = Provider.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { provider, model } = r.data;
  const cfg = getConfig();
  const keyless = (provider === "local" && !!cfg.coachLocal) || (provider === "mock" && cfg.coachMock);
  if (!keyless && !providerOf(provider)) return { ok: false, error: "Pick a provider." };
  let apiKey = keyless ? null : (r.data.apiKey ?? null);
  let isReusing = false;
  if (!keyless && !apiKey) {
    const saved = await savedApiKey(getDb(), me);
    if (saved && saved.provider === provider) {
      apiKey = saved.apiKey;
      isReusing = true;
    } else {
      return { ok: false, error: "Paste your API key." };
    }
  }
  if (apiKey && !cfg.authSecret) return { ok: false, error: "This server has no BETTER_AUTH_SECRET, so it can’t store keys safely. Ask whoever runs it." };
  const usedModel = provider === "local" ? cfg.coachLocal!.model : model;
  const m = modelFor(provider, usedModel, apiKey);
  if (!m) return { ok: false, error: "Pick a provider." };
  try {
    await generateText({ model: m, prompt: "Reply with OK.", maxOutputTokens: 5, maxRetries: 0, abortSignal: AbortSignal.timeout(20_000) });
  } catch (e) {
    console.warn(`[coach] key test failed for ${provider}: ${e instanceof Error ? e.name : "error"}`);
    return { ok: false, error: "That didn’t work: check the key and the model id, and that your account has credit." };
  }
  await saveProvider(getDb(), me, provider, usedModel, isReusing ? undefined : apiKey);
  revalidatePath("/coach");
  revalidatePath("/settings");
  return DONE;
}

export async function removeProviderAction(): Promise<ActionResult> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  await removeProvider(getDb(), me.userId);
  revalidatePath("/settings");
  return DONE;
}

const Preferences = z.object({
  instructions: z.string().max(MAX_NOTES, `Keep it under ${MAX_NOTES} characters.`).nullable().optional(),
  briefMinute: z.number().int().min(0).max(1439).nullable().optional(),
});

/** The user's own notes for the coach and the morning-brief time; only the fields sent change. */
export async function setPreferencesAction(input: z.input<typeof Preferences>): Promise<ActionResult> {
  const me = await member();
  if (typeof me !== "number") return me;
  const r = Preferences.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { instructions, briefMinute } = r.data;
  await setPreferences(getDb(), me, {
    ...(instructions !== undefined && { instructions: instructions?.trim() || null }),
    ...(briefMinute !== undefined && { briefMinute }),
  });
  revalidatePath("/settings");
  return DONE;
}

const Cursor = z.object({ updatedAt: z.number().int().nonnegative(), id: z.string().max(64) });

/** The next page of chats after `cursor`, grouped by recency in the user's time zone. */
export async function moreChatsAction(cursor: z.input<typeof Cursor>): Promise<ActionResult<{ groups: ChatGroup[]; next: ChatCursor | null }>> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  const c = Cursor.safeParse(cursor);
  if (!c.success) return { ok: false, error: "Couldn’t load older chats." };
  const db = getDb();
  const ctx = await ctxOf(db, me.userId).catch(() => null);
  if (!ctx) return { ok: false, error: "Couldn’t load older chats." };
  const { chats, next } = await listChats(db, me.userId, c.data);
  return { ok: true, data: { groups: groupChats(chats, ctx.now, ctx.timeZone), next } };
}

export async function deleteChatAction(id: string): Promise<ActionResult> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  await deleteChat(getDb(), me.userId, String(id));
  revalidatePath("/coach");
  return DONE;
}

export async function deleteAllChatsAction(): Promise<ActionResult> {
  const me = await currentUser();
  if (!me) return SIGNED_OUT;
  await deleteAllChats(getDb(), me.userId);
  revalidatePath("/coach");
  return DONE;
}
