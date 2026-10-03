"use server";
// Journal writes (KTD1): Server Actions validated with zod. Results are returned, not thrown, so a form can show them.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getConfig } from "../config";
import { getDb } from "../db";
import { journalEntries, journalTags } from "../db/schema";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Today's local `YYYY-MM-DD` in the configured time zone (en-CA formats dates as ISO). */
const localToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: getConfig().timeZone }).format(new Date());

const Entry = z.object({
  day: z.iso.date(),
  tag: z.string().min(1).max(64),
  // A yes/no behaviour, or a count (e.g. drinks); stored as an integer. null clears the answer: no row
  // means "not answered", which journal impact keeps apart from an answered "no" (0).
  value: z.union([z.boolean(), z.number().int().min(0).max(1000)]).transform(Number).nullable(),
});

/** Upserts (or, with value null, deletes) one (day, tag) for today or a past day. Repeating it changes nothing. */
export async function saveJournalEntry(input: z.input<typeof Entry>): Promise<ActionResult> {
  const r = Entry.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { day, tag, value } = r.data;
  if (day > localToday()) return { ok: false, error: "Can't log a future day" };
  const db = getDb();
  if (!db.select().from(journalTags).where(eq(journalTags.tag, tag)).get()) return { ok: false, error: `Unknown tag: ${tag}` };
  if (value === null) db.delete(journalEntries).where(and(eq(journalEntries.day, day), eq(journalEntries.tag, tag))).run();
  else
    db.insert(journalEntries)
      .values({ day, tag, value })
      .onConflictDoUpdate({ target: [journalEntries.day, journalEntries.tag], set: { value } })
      .run();
  revalidatePath("/journal");
  revalidatePath("/");
  return { ok: true, data: undefined };
}

const CustomTag = z.object({ label: z.string().trim().min(1).max(40) });

/** Adds a custom tag; its key is the label as snake_case. Fails when that key already exists. */
export async function addCustomTag(input: z.input<typeof CustomTag>): Promise<ActionResult<{ tag: string }>> {
  const r = CustomTag.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const { label } = r.data;
  const tag = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!tag) return { ok: false, error: "Label needs a letter or digit" };
  const added = getDb().insert(journalTags).values({ tag, label, isDefault: false }).onConflictDoNothing().run().changes;
  if (!added) return { ok: false, error: `Tag already exists: ${tag}` };
  revalidatePath("/journal");
  return { ok: true, data: { tag } };
}
