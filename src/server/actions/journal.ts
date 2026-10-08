"use server";
// Journal writes (KTD1): Server Actions validated with zod. Results are returned, not thrown, so a form can show them.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser, SIGNED_OUT } from "../auth";
import { getDb } from "../db";
import { intradayDirty, journalEntries, journalNotes, journalTags } from "../db/schema";
import { addTag, MAX_TAGS, selectTags, tagKey } from "../journalTags";
import { userCtx } from "../queries/common";
import { getBehaviours, getJournal } from "../queries/journal";
import { userTimeZone } from "../profile";
import { localDay } from "../time";
import type { BehavioursVM, JournalVM } from "../queries/types";
import { requestSync } from "../worker";
import { inDayRange } from "@/lib/url";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Today's local `YYYY-MM-DD` in the user's time zone (UTC before onboarding). */
const localToday = async (userId: number) => localDay(Math.floor(Date.now() / 1000), (await userTimeZone(getDb(), userId)) ?? "UTC");

const Entry = z.object({
  day: z.iso.date(),
  tag: z.string().min(1).max(64),
  // A yes/no behaviour, or a count (e.g. drinks); stored as an integer. null clears the answer: no row
  // means "not answered", which journal impact keeps apart from an answered "no" (0).
  value: z.union([z.boolean(), z.number().int().min(0).max(1000)]).transform(Number).nullable(),
  /** The follow-up slider's answer (minutes after midnight or a count); kept only with a "yes". */
  detail: z.number().int().min(0).max(1440).nullable().optional(),
});

/** Upserts (or, with value null, deletes) one (day, tag) for today or a past day. Repeating it changes nothing. */
export async function saveJournalEntry(input: z.input<typeof Entry>): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const { userId } = user;
  const r = Entry.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { day, tag, value } = r.data;
  const detail = value ? (r.data.detail ?? null) : null;
  if (day > (await localToday(userId))) return { ok: false, error: "Can’t log a future day" };
  const db = getDb();
  const [known] = await db.select({ tag: journalTags.tag }).from(journalTags).where(and(eq(journalTags.userId, userId), eq(journalTags.tag, tag)));
  if (!known) return { ok: false, error: `Unknown tag: ${tag}` };
  if (value === null) {
    await db.delete(journalEntries).where(and(eq(journalEntries.userId, userId), eq(journalEntries.day, day), eq(journalEntries.tag, tag)));
  } else {
    await db
      .insert(journalEntries)
      .values({ userId, day, tag, value, detail })
      .onConflictDoUpdate({ target: [journalEntries.userId, journalEntries.day, journalEntries.tag], set: { value, detail } });
  }
  // Stage 2 reads the journal (impact, Insights, Monitor context) but a check-in is no source change, so
  // mark the day dirty (persistent, survives a restart; stage 1 redoes only that day, to the same result)
  // and kick the worker past its 5-minute gate. Fire-and-forget: the action doesn't wait on the recompute.
  await db.insert(intradayDirty).values({ userId, day }).onConflictDoNothing();
  requestSync({ userId, force: true });
  revalidatePath("/journal");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

/**
 * Read-only: the journal's behaviours, a day's answers and note, and the day strip. The sheet opens over any screen (`?checkin=1`,
 * spec §11 UX2), so it fetches what the Journal page would have passed it.
 */
export async function loadCheckIn(day: string): Promise<ActionResult<Pick<JournalVM, "tags" | "checkIn" | "strip">>> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const r = z.iso.date().safeParse(day);
  if (!r.success) return { ok: false, error: "Invalid day" };
  const ctx = await userCtx(user.userId);
  if (!inDayRange(r.data, localDay(ctx.now, ctx.timeZone))) return { ok: false, error: "Invalid day" };
  // ponytail: getJournal also builds the strip, history and teaser the sheet drops; a lean query if it ever shows.
  const { tags, checkIn, strip } = await getJournal(r.data, ctx);
  return { ok: true, data: { tags, checkIn, strip } };
}

const Note = z.object({ day: z.iso.date(), text: z.string().max(2000) });

/** Sets (or, when blank, removes) a day's journal note. Notes feed no score, so nothing is recomputed. */
export async function saveJournalNote(input: z.input<typeof Note>): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const r = Note.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { userId } = user;
  const { day } = r.data;
  const text = r.data.text.trim();
  if (day > (await localToday(userId))) return { ok: false, error: "Can’t log a future day" };
  const n = journalNotes;
  if (!text) await getDb().delete(n).where(and(eq(n.userId, userId), eq(n.day, day)));
  else await getDb().insert(n).values({ userId, day, text }).onConflictDoUpdate({ target: [n.userId, n.day], set: { text } });
  revalidatePath("/journal");
  return { ok: true, data: undefined };
}

/** Read-only: every behaviour the user has, hidden ones included, for Select Behaviors over the journal. */
export async function loadBehaviours(): Promise<ActionResult<BehavioursVM>> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  return { ok: true, data: await getBehaviours(await userCtx(user.userId)) };
}

const Selection = z.object({ tags: z.array(z.string().min(1).max(64)).max(200) });

/**
 * Select Behaviors' Save: the journal asks exactly `tags`. Catalogue behaviours not yet added are added; every other
 * behaviour is hidden, its past answers kept.
 */
export async function saveBehaviors(input: z.input<typeof Selection>): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const r = Selection.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const result = await selectTags(getDb(), user.userId, r.data.tags);
  if (result === "unknown") return { ok: false, error: "Unknown behaviour" };
  if (result === "full") return { ok: false, error: `Too many behaviours: the limit is ${MAX_TAGS}` };
  revalidateTags();
  revalidatePath("/");
  return { ok: true, data: undefined };
}

const CustomTag = z.object({ label: z.string().trim().min(1).max(40) });

/** Adds a custom tag; its key is the label as snake_case. Fails when that key already exists. */
export async function addCustomTag(input: z.input<typeof CustomTag>): Promise<ActionResult<{ tag: string }>> {
  const user = await currentUser();
  if (!user) return SIGNED_OUT;
  const r = CustomTag.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { label } = r.data;
  const tag = tagKey(label);
  if (!tag) return { ok: false, error: "Label needs a letter or digit" };
  const added = await addTag(getDb(), user.userId, tag, label);
  if (added === "exists") return { ok: false, error: `Tag already exists: ${tag}` };
  if (added === "full") return { ok: false, error: `Too many behaviours: the limit is ${MAX_TAGS}` };
  revalidateTags();
  return { ok: true, data: { tag } };
}

const revalidateTags = () => {
  revalidatePath("/journal");
  revalidatePath("/more/behaviours");
};


