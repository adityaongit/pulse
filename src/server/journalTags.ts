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
