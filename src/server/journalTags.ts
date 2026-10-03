// The Journal's default behaviours, shared by both data sources.
import type { Db } from "./db";
import { journalTags } from "./db/schema";

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

/** Inserts any missing default tag; existing rows (and custom tags) are left alone. Returns rows inserted. */
export function ensureDefaultTags(db: Db): number {
  return db
    .insert(journalTags)
    .values(DEFAULT_JOURNAL_TAGS.map(({ tag, label }) => ({ tag, label, isDefault: true })))
    .onConflictDoNothing()
    .run().changes;
}

/** A custom tag's key: the label as snake_case ("Cold plunge" → "cold_plunge"); "" when it has no letter or digit. */
export const tagKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Adds a custom tag at the end of its group. False when the key already exists. */
export function addTag(db: Db, tag: string, label: string): boolean {
  return (
    db.$client
      .prepare("insert into journal_tags (tag, label, is_default, position) values (?, ?, 0, (select coalesce(max(position), 0) + 1 from journal_tags)) on conflict do nothing")
      .run(tag, label).changes > 0
  );
}

/** Hides a tag from the check-in sheet or shows it again. Its answers are untouched. False for an unknown tag. */
export function setTagHidden(db: Db, tag: string, hidden: boolean): boolean {
  return db.$client.prepare("update journal_tags set hidden = ? where tag = ?").run(hidden ? 1 : 0, tag).changes > 0;
}

/**
 * Orders `tags` (one check-in group, in its new order) by writing their positions 0..n-1. Other groups keep
 * theirs: groups render apart, so only the order inside a group matters. False, writing nothing, if any tag is unknown.
 */
export function reorderTags(db: Db, tags: string[]): boolean {
  const c = db.$client;
  const known = c.prepare("select 1 from journal_tags where tag = ?").pluck();
  if (new Set(tags).size !== tags.length || tags.some((t) => !known.get(t))) return false;
  const set = c.prepare("update journal_tags set position = ? where tag = ?");
  c.transaction(() => tags.forEach((t, i) => set.run(i, t)))();
  return true;
}
