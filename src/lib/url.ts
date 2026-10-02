import { addDays as addDaysFns, format, isValid, parseISO, startOfISOWeek } from "date-fns";

// URL state: the selected day `?d=YYYY-MM-DD` (KTD15) and the trend range `?r=` (spec §5.5, §8).

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const iso = (date: Date) => format(date, "yyyy-MM-dd");

/** Today as YYYY-MM-DD in `timeZone` (default: the runtime zone). */
export function todayIn(timeZone?: string, now = new Date()) {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const addDays = (day: string, n: number) => iso(addDaysFns(parseISO(day), n));

/** Monday and Sunday of the ISO week containing `day`. */
export function weekOf(day: string): [string, string] {
  const mon = startOfISOWeek(parseISO(day));
  return [iso(mon), iso(addDaysFns(mon, 6))];
}

function isDay(raw: string) {
  if (!DAY.test(raw)) return false;
  const date = parseISO(raw);
  return isValid(date) && iso(date) === raw; // rejects 2026-02-31
}

/**
 * Reads `?d=`. Missing → today. Unparsable or future → today with `rejected: true`, so the page can
 * replace the URL without `d`.
 */
export function parseDay(raw: string | string[] | undefined, today: string) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === undefined || v === "") return { d: today, isToday: true, rejected: false };
  if (!isDay(v) || v > today) return { d: today, isToday: true, rejected: true };
  return { d: v, isToday: v === today, rejected: false };
}

export const RANGES = ["w", "m", "6m"] as const;
export type TrendRange = (typeof RANGES)[number];
export const RANGE_DAYS: Record<TrendRange, number> = { w: 7, m: 30, "6m": 182 };

/** Reads `?r=`; anything else is the default `m`. */
export function parseRange(raw: string | string[] | undefined): TrendRange {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (RANGES as readonly string[]).includes(v ?? "") ? (v as TrendRange) : "m";
}

/** Sets or removes one query param on a `search` string ("?a=1" or "a=1"); returns "?…" or "". */
export function withParam(search: string, key: string, value: string | null) {
  const p = new URLSearchParams(search);
  if (value === null) p.delete(key);
  else p.set(key, value);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Link to a day-aware screen carrying `d` (omitted for today). Keeps a `#hash` and any query
 * already on `href`: dayHref("/sleep#planner", "2026-09-26", today) → "/sleep?d=2026-09-26#planner".
 */
export function dayHref(href: string, d: string, today: string) {
  const [pathAndQuery, hash] = href.split("#");
  const [path, query = ""] = pathAndQuery.split("?");
  const q = withParam(query, "d", d === today ? null : d);
  return `${path}${q}${hash ? `#${hash}` : ""}`;
}

// --- Navigation structure (spec §4.2, §4.5) ---

export type Tab = "home" | "health" | "journal" | "more";
export const TAB_ROOT: Record<Tab, string> = { home: "/", health: "/health", journal: "/journal", more: "/more" };

/** The tab a route belongs to. Detail routes map to their parent tab. */
export function tabForPath(pathname: string): Tab {
  const first = pathname.split("/")[1] ?? "";
  if (first === "health") return "health";
  if (first === "journal") return "journal";
  if (first === "more" || first === "settings") return "more";
  return "home";
}

/** Where DetailHeader's back goes without history: the parent tab root. */
export const parentHref = (pathname: string) => TAB_ROOT[tabForPath(pathname)];
