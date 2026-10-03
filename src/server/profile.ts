// The person's profile (U19): one row in the database, written by onboarding and Settings › Profile.
import { z } from "zod";
import type { Db } from "./db";
import { profile } from "./db/schema";
import { wholeYears } from "./time";

export type Profile = {
  birthDate: string;
  sex: "male" | "female";
  maxHr: number;
  /** False when maxHr is the age estimate. */
  maxHrSet: boolean;
  heightCm: number | null;
};

/** What onboarding and Settings submit. Ages 13 to 100: under 13 Google accounts are restricted anyway. */
export const ProfileInput = z.object({
  birthDate: z.iso.date().refine((d) => {
    const age = wholeYears(d, new Date().toISOString().slice(0, 10));
    return age >= 13 && age <= 100;
  }, "Enter a birth date between 13 and 100 years ago"),
  sex: z.enum(["male", "female"], "Choose one"),
  maxHr: z.coerce.number().int().min(100, "Between 100 and 240").max(240, "Between 100 and 240").nullable(),
  heightCm: z.coerce.number().min(100, "Between 100 and 250 cm").max(250, "Between 100 and 250 cm").nullable(),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

/** The stored profile with max HR resolved (Tanaka, 208 - 0.7 * age, when not measured), or null before onboarding. */
export function getProfile(db: Db, today = new Date().toISOString().slice(0, 10)): Profile | null {
  const row = db.select().from(profile).get();
  if (!row) return null;
  return {
    birthDate: row.birthDate,
    sex: row.sex,
    maxHr: row.maxHr ?? Math.round(208 - 0.7 * wholeYears(row.birthDate, today)),
    maxHrSet: row.maxHr !== null,
    heightCm: row.heightCm,
  };
}

/**
 * Saves the profile and marks every day for recompute: zones, Strain, Pulse Age and fitness level all
 * depend on age, sex and max HR. Returns true when anything changed.
 */
export function saveProfile(db: Db, input: ProfileInput, now = Math.floor(Date.now() / 1000)): boolean {
  const row = { ...input, updatedAt: now };
  const before = db.select().from(profile).get();
  if (before && before.birthDate === row.birthDate && before.sex === row.sex && before.maxHr === row.maxHr && before.heightCm === row.heightCm) {
    return false;
  }
  const c = db.$client;
  c.transaction(() => {
    db.insert(profile).values({ id: 1, ...row }).onConflictDoUpdate({ target: profile.id, set: row }).run();
    c.prepare("insert or ignore into intraday_dirty (day) select distinct day from daily_metrics").run();
  })();
  return true;
}
