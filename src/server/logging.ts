// Logging for one user (spec §11 LG1): validated, written to Google (or kept local in demo mode). The log sheets
// reach it through the session-checked action in actions/log.ts; the coach through its approved log tools.
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CYCLE_SYMPTOMS, FLOWS, isCycleKind, MEALS, MOODS, OVULATION_RESULTS, RECONNECT, SYMPTOMS, VALENCES } from "@/lib/log";
import type { ActionResult } from "./actions/journal";
import { getConfig } from "./config";
import { getDb } from "./db";
import { isReadable, logAccess, rewindSync, saveEntries, type LogResult, type LogWriter, type NewEntry } from "./log";
import { getProfile } from "./profile";
import { createGoogleClient } from "./sources/google/client";
import { addDays, fromWall, localDay } from "./time";
import { requestSync } from "./worker";

const keys = <T extends readonly (readonly [string, ...unknown[]])[]>(list: T) => list.map((x) => x[0]) as unknown as [T[number][0], ...T[number][0][]];
/** Local wall time `YYYY-MM-DDTHH:mm`; omitted means now. */
const At = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Choose a time").optional();
const grams = z.number().min(0).max(1000).nullable();
const tenth = (g: number | null) => (g === null ? null : Math.round(g * 10) / 10);

const Input = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("water"), ml: z.number().int().min(10, "At least 10 ml").max(5000, "At most 5,000 ml"), at: At }),
  z.object({
    kind: z.literal("food"),
    name: z.string().trim().max(80).transform((s) => s || null),
    meal: z.enum(keys(MEALS)),
    kcal: z.number().int().min(0).max(10_000, "At most 10,000 kcal"),
    protein: grams,
    carbs: grams,
    fat: grams,
    at: At,
  }),
  z.object({
    kind: z.literal("weight"),
    kg: z.number().min(20, "Between 20 and 300 kg").max(300, "Between 20 and 300 kg"),
    fatPct: z.number().min(2, "Between 2 and 75%").max(75, "Between 2 and 75%").nullable(),
    at: At,
  }),
  z.object({
    kind: z.literal("mood"),
    moods: z.array(z.enum(keys(MOODS))).min(1, "Choose how you feel").max(5),
    valence: z.enum(keys(VALENCES)).nullable(),
    at: At,
  }),
  z.object({ kind: z.literal("symptoms"), symptoms: z.array(z.enum(keys(SYMPTOMS))).min(1, "Choose a symptom").max(10), at: At }),
  z.object({ kind: z.literal("period"), start: z.iso.date(), end: z.iso.date(), flow: z.enum(keys(FLOWS)).nullable() }),
  z.object({ kind: z.literal("ovulation"), result: z.enum(keys(OVULATION_RESULTS)), at: At }),
]);
export type LogInput = z.input<typeof Input>;

export const LOG_MESSAGE: Record<Exclude<LogResult, { ok: true }>["reason"], string> = {
  reconnect: RECONNECT,
  failed: "Google Health didn’t take it. Try again in a minute.",
  foreign: "This was logged in another app. Delete it there.",
};

/** One Google client per action: it holds the rate limiter. Null in demo mode, where nothing leaves Pulse. */
export function logWriter(userId: number, timeZone: string): LogWriter | null {
  const { google } = getConfig();
  return google ? createGoogleClient({ db: getDb(), userId, google, timeZone }) : null;
}

/** Logs water, food, weight (and body fat), mood, symptoms, or (female profiles) a period or ovulation test for `userId`. */
export async function logFor(userId: number, input: LogInput): Promise<ActionResult<{ demo: boolean }>> {
  const r = Input.safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0].message };
  const v = r.data;
  const db = getDb();
  const { dataSource } = getConfig();
  const p = await getProfile(db, userId);
  if (!p) return { ok: false, error: "Finish setting up your profile first" };
  const tz = p.timeZone;
  const female = p.sex === "female";
  // Cycle tracking never exists on a male profile, whatever a request says.
  if (!female && (isCycleKind(v.kind) || (v.kind === "symptoms" && v.symptoms.some((s) => CYCLE_SYMPTOMS.has(s))))) {
    return { ok: false, error: "Not available for this profile" };
  }

  const now = Math.floor(Date.now() / 1000);
  const today = localDay(now, tz);
  const ts = "at" in v && v.at ? fromWall(v.at, tz) : now;
  if (ts > now + 60) return { ok: false, error: "Can’t log the future" };
  if (ts < now - 366 * 86_400) return { ok: false, error: "Can’t log more than a year back" };

  let entries: NewEntry[];
  switch (v.kind) {
    case "water":
      entries = [{ type: "hydration-log", ts, data: { ml: v.ml } }];
      break;
    case "food":
      // Grams to a tenth, as Google's copy comes back (map.ts), so the sync never rewrites what was logged.
      entries = [{ type: "nutrition-log", ts, data: { name: v.name, meal: v.meal, kcal: v.kcal, protein: tenth(v.protein), carbs: tenth(v.carbs), fat: tenth(v.fat) } }];
      break;
    case "weight":
      entries = [
        { type: "weight", ts, data: { kg: Math.round(v.kg * 10) / 10 } },
        ...(v.fatPct != null ? [{ type: "body-fat" as const, ts, data: { pct: Math.round(v.fatPct * 10) / 10 } }] : []),
      ];
      break;
    case "mood":
      entries = [{ type: "moods", ts, data: { moods: v.moods, valence: v.valence } }];
      break;
    case "symptoms":
      entries = [{ type: "symptoms", ts, data: { symptoms: v.symptoms } }];
      break;
    case "period": {
      if (v.end < v.start) return { ok: false, error: "The last day is before the first" };
      if (v.end > today) return { ok: false, error: "Can’t log a future day" };
      if (v.start < addDays(today, -366)) return { ok: false, error: "Can’t log more than a year back" };
      if (v.end > addDays(v.start, 14)) return { ok: false, error: "A period is 15 days at most" };
      entries = [{ type: "menstrual-period", ts: fromWall(`${v.start}T00:00`, tz), data: { start: v.start, end: v.end, flow: v.flow } }];
      break;
    }
    case "ovulation":
      entries = [{ type: "ovulation-test", ts, data: { result: v.result } }];
      break;
  }

  // A grant without the write scope fails at Google with 403 anyway; asking first saves the request and says why.
  const access = await logAccess(db, userId, dataSource === "google" ? "google" : "demo");
  if (entries.some((e) => access[e.type] === "reconnect" || access[e.type] === "not_connected")) return { ok: false, error: RECONNECT };

  const res = await saveEntries(db, userId, entries, { tz, writer: dataSource === "google" ? logWriter(userId, tz) : null, now });
  revalidatePath("/journal");
  if (!res.ok) return { ok: false, error: LOG_MESSAGE[res.reason] };
  // Water, food and weight come back through the sync, which owns their totals: fetch them now, from the entry's day.
  const readable = entries.filter((e) => isReadable(e.type));
  if (dataSource === "google" && readable.length) {
    for (const e of readable) await rewindSync(db, userId, e.type, localDay(e.ts, tz), tz);
    requestSync({ userId, force: true });
  }
  return { ok: true, data: { demo: dataSource !== "google" } };
}
