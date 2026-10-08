// The Journal's default behaviours, shared by both data sources.
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { type Db, rows, sql } from "./db";
import { journalTags } from "./db/schema";
import { behavior } from "@/lib/behaviors";

export const DEFAULT_JOURNAL_TAGS = [
  { tag: "alcohol", label: "Alcohol" },
  { tag: "late_caffeine", label: "Late caffeine" },
  { tag: "late_meal", label: "Late meal" },
  { tag: "screen_in_bed", label: "Screen in bed" },
  { tag: "meditation", label: "Meditation" },
  { tag: "stretching", label: "Stretching" },
  { tag: "sauna", label: "Sauna" },
  { tag: "travel", label: "Travel" },
  { tag: "illness", label: "Illness" },
] as const;

/** Inserts any missing default tag for the user; existing rows (and custom tags) are left alone. Returns rows inserted. */
export async function ensureDefaultTags(db: Db, userId: number): Promise<number> {
  const added = await db
    .insert(journalTags)
    .values(DEFAULT_JOURNAL_TAGS.map(({ tag, label }) => ({ userId, tag, label, isDefault: true })))
    .onConflictDoNothing()
    .returning({ tag: journalTags.tag });
  return added.length;
}

/** A custom tag's key: the label as snake_case ("Cold plunge" → "cold_plunge"); "" when it has no letter or digit. */
export const tagKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Most tags (defaults included) a person can have. Insights bootstrap every tag on every recompute, so this bounds that work. */
export const MAX_TAGS = 60;

/** Adds a custom tag at the end of its group. "exists" when the key is taken, "full" at MAX_TAGS. */
export async function addTag(db: Db, userId: number, tag: string, label: string): Promise<"added" | "exists" | "full"> {
  // The count check lives in the insert itself, so two concurrent adds can't both slip past the cap.
  const added = await rows<{ tag: string }>(
    db,
    sql`insert into journal_tags (user_id, tag, label, position)
      select ${userId}, ${tag}, ${label}, coalesce(max(position), 0) + 1 from journal_tags where user_id = ${userId}
      having count(*) < ${MAX_TAGS}
      on conflict do nothing returning tag`,
  );
  if (added.length) return "added";
  const [{ n }] = await rows<{ n: number }>(db, sql`select count(*)::int as n from journal_tags where user_id = ${userId}`);
  return n >= MAX_TAGS ? "full" : "exists";
}

/** Hides a tag from the check-in sheet or shows it again. Its answers are untouched. False for an unknown tag. */
export async function setTagHidden(db: Db, userId: number, tag: string, hidden: boolean): Promise<boolean> {
  const r = await db
    .update(journalTags)
    .set({ hidden })
    .where(and(eq(journalTags.userId, userId), eq(journalTags.tag, tag)))
    .returning({ tag: journalTags.tag });
  return r.length > 0;
}

/**
 * Orders `tags` (one check-in group, in its new order) by writing their positions 0..n-1. Other groups keep
 * theirs: groups render apart, so only the order inside a group matters. False, writing nothing, if any tag is unknown.
 */
export async function reorderTags(db: Db, userId: number, tags: string[]): Promise<boolean> {
  if (new Set(tags).size !== tags.length) return false;
  if (!tags.length) return true;
  const known = await db
    .select({ tag: journalTags.tag })
    .from(journalTags)
    .where(and(eq(journalTags.userId, userId), inArray(journalTags.tag, tags)));
  if (known.length !== tags.length) return false;
  await db.transaction(async (tx) => {
    for (const [i, t] of tags.entries()) {
      await tx.update(journalTags).set({ position: i }).where(and(eq(journalTags.userId, userId), eq(journalTags.tag, t)));
    }
  });
  return true;
}

/**
 * Makes `tags` the behaviours the journal asks: adds catalogue behaviours the user has no row for (at the end), shows
 * the chosen ones and hides the rest. "unknown" for a key neither in the catalogue nor the user's; "full" past MAX_TAGS.
 */
export async function selectTags(db: Db, userId: number, tags: string[]): Promise<"saved" | "unknown" | "full"> {
  const mine = new Set((await db.select({ tag: journalTags.tag }).from(journalTags).where(eq(journalTags.userId, userId))).map((r) => r.tag));
  const added = [...new Set(tags)].filter((t) => !mine.has(t));
  if (added.some((t) => !behavior(t))) return "unknown";
  if (mine.size + added.length > MAX_TAGS) return "full";
  const [{ max }] = await rows<{ max: number }>(db, sql`select coalesce(max(position), 0)::int as max from journal_tags where user_id = ${userId}`);
  await db.transaction(async (tx) => {
    if (added.length) {
      await tx.insert(journalTags).values(added.map((t, i) => ({ userId, tag: t, label: behavior(t)!.label, position: max + 1 + i }))).onConflictDoNothing();
    }
    await tx.update(journalTags).set({ hidden: true }).where(and(eq(journalTags.userId, userId), notInArray(journalTags.tag, tags.length ? tags : [""])));
    if (tags.length) await tx.update(journalTags).set({ hidden: false }).where(and(eq(journalTags.userId, userId), inArray(journalTags.tag, tags)));
  });
  return "saved";
}
