import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { SCENARIO } from "../src/server/sources/seed/scenario";

/** The e2e server's throwaway demo DB (playwright.config.ts deletes it before each server start). */
export const E2E_DB = path.join(os.tmpdir(), "pulse-e2e", "e2e-demo.db");

export type DayKey = "today" | "past" | "calibrating" | "illness" | "bandOff";
export const DAY_KEYS: DayKey[] = ["today", "past", "calibrating", "illness", "bandOff"];

const addDays = (day: string, n: number) => {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

let cached: Record<DayKey, string | null> | undefined;

/**
 * Scenario days as `?d=` values (null = today, no param). Day indices count from the first seeded
 * day, read from the DB, so they stay right on a reused server that seeded on an earlier date.
 */
export function days(): Record<DayKey, string | null> {
  if (cached) return cached;
  const db = new Database(E2E_DB, { readonly: true, fileMustExist: true });
  const { first } = db.prepare("select min(day) as first from daily_metrics").get() as { first: string };
  const at = (i: number) => addDays(first, i);
  // The latest run before the band-off: Strain lists it, so journeys and the sweep find an activity there.
  const { run } = db.prepare("select max(day) as run from exercises where type = 'RUNNING' and day < ?").get(at(SCENARIO.bandOff.day)) as { run: string };
  db.close();
  cached = {
    today: null,
    past: run, // after the illness, before the band-off: an ordinary scored day with a run
    calibrating: at(2), // inside SCENARIO.calibratingDays
    illness: at(SCENARIO.illness.start + 2), // peak severity
    bandOff: at(SCENARIO.bandOff.day + 1),
  };
  return cached;
}

/** `path` with `?d=` for the day (none for today). */
export const withDay = (route: string, d: string | null) => (d ? `${route}${route.includes("?") ? "&" : "?"}d=${d}` : route);
