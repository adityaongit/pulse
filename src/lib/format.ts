import { format as fmtDate, parseISO } from "date-fns";
import type { DeltaDir, Tone } from "./bands";

// Number, date and spoken-label formatting (spec §3.3, §6). Formatters are referenced by key so a
// server component can hand them to a client component (functions do not cross that boundary).

/** The product name for the Healthspan age. Swap to "Pulse Age" here if preferred (spec §11). */
export const AGE_LABEL = "WHOOP Age";
export const MISSING = "--";
const MINUS = "−";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const minus = (s: string) => s.replace("-", MINUS);
// "-0.0" collapses to "0.0"; the hyphen becomes a real minus sign.
const fixed = (v: number, d: number) => {
  const s = v.toFixed(d);
  return minus(/^-0(\.0+)?$/.test(s) ? s.slice(1) : s);
};
const signed = (v: number, d: number) => (Number(v.toFixed(d)) > 0 ? `+${fixed(v, d)}` : fixed(v, d));
const pad = (n: number) => String(n).padStart(2, "0");

/** Minutes → "7:42". */
export function hmm(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

export const FORMATS = {
  int: (v: number) => fixed(v, 0),
  grouped: (v: number) => minus(grouped.format(Math.round(v))),
  decimal1: (v: number) => fixed(v, 1),
  decimal2: (v: number) => fixed(v, 2),
  signed1: (v: number) => signed(v, 1),
  signedInt: (v: number) => signed(v, 0),
  /** Minutes → h:mm. */
  duration: hmm,
  /** Seconds → h:mm:ss. */
  durationHMS: (s: number) => {
    const t = Math.max(0, Math.round(s));
    return `${Math.floor(t / 3600)}:${pad(Math.floor(t / 60) % 60)}:${pad(t % 60)}`;
  },
} satisfies Record<string, (v: number) => string>;
export type FormatKey = keyof typeof FORMATS;

/** Formats a value by key; null, undefined and non-finite numbers render as "--". */
export function formatValue(key: FormatKey, v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? MISSING : FORMATS[key](v);
}

/** Symbol units sit tight against the value (`ml-0.5`); word units get a gap (`ml-1`). */
export const isSymbolUnit = (unit: string) => unit === "%" || unit === "x";

// --- Dates and clock times ---

/** "Today", "Yesterday", else "Mon, Sep 28". Dates are YYYY-MM-DD in the user's zone. */
export function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  const y = parseISO(today);
  y.setDate(y.getDate() - 1);
  if (date === fmtDate(y, "yyyy-MM-dd")) return "Yesterday";
  return fmtDate(parseISO(date), "EEE, MMM d");
}

/** "Sep 22 - Sep 28". */
export const rangeLabel = (from: string, to: string) =>
  `${fmtDate(parseISO(from), "MMM d")} - ${fmtDate(parseISO(to), "MMM d")}`;

const clocks = new Map<string, Intl.DateTimeFormat>();
/** Epoch ms → 24-hour "HH:mm" in `timeZone` (default: the runtime zone). */
export function clock(ms: number, timeZone?: string) {
  const key = timeZone ?? "";
  let f = clocks.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
    clocks.set(key, f);
  }
  return f.format(ms);
}

/** "38 minutes", "1 hour 12 minutes". */
export function durationWords(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  const part = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!h) return part(r, "minute");
  return r ? `${part(h, "hour")} ${part(r, "minute")}` : part(h, "hour");
}

/** Relative age of a timestamp: "12 minutes ago", "3 hours ago". */
export function ago(ms: number, now: number) {
  const min = Math.max(0, Math.round((now - ms) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} ${min === 1 ? "minute" : "minutes"} ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.round(h / 24);
  return `${d} days ago`;
}

// --- Spoken labels (aria) ---

const UNIT_WORDS: Record<string, string> = {
  "%": "percent",
  ms: "milliseconds",
  bpm: "beats per minute",
  rpm: "breaths per minute",
  "°C": "degrees",
  kcal: "calories",
  "ml/kg/min": "millilitres per kilo per minute",
  x: "times",
  min: "minutes",
  h: "hours",
};

/** "124 milliseconds", "−0.4 degrees" → reads the minus sign as "minus". */
export function spoken(value: string, unit?: string) {
  const v = value.replace(MINUS, "minus ");
  if (!unit) return v;
  return `${v} ${UNIT_WORDS[unit] ?? unit}`;
}

export type DialAria = {
  variant: "recovery" | "strain" | "sleep" | "stat" | "gauge";
  label: string;
  value?: number | null;
  valueText?: string;
  unit?: string;
  provisional?: boolean;
  reason?: string | null;
  reasonText?: string;
  bandWord?: string;
  target?: readonly [number, number] | null;
  soFar?: boolean;
};

/** "Recovery 72 percent, green", "Strain 9.4 of 21 so far, target 12.0 to 15.0", "Recovery unavailable: calibrating, 4 nights left". */
export function dialAriaLabel(a: DialAria) {
  if (a.value === null || a.value === undefined) {
    const why = (a.reasonText ?? "no data").replace(/^(\w)/, (c) => c.toLowerCase()).replace(": ", ", ");
    return `${a.label} unavailable: ${why}`;
  }
  const v = spoken(a.valueText ?? String(a.value), a.unit);
  const prov = a.provisional ? " provisional," : "";
  if (a.variant === "strain") {
    const t = a.target ? `, target ${a.target[0].toFixed(1)} to ${a.target[1].toFixed(1)}` : "";
    return `${a.label}${prov} ${v} of 21${a.soFar ? " so far" : ""}${t}`;
  }
  const word = a.bandWord ? `, ${a.bandWord.toLowerCase()}` : "";
  return `${a.label}${prov} ${v}${word}`;
}

const TONE_WORD: Record<Tone, string> = { good: ", good", bad: ", worse than usual", neutral: "" };

/** "Heart rate variability 124 milliseconds, above your 30-day average of 98, good". */
export function statSentence(o: {
  label: string;
  valueText: string;
  unit?: string;
  averageText?: string;
  averageLabel?: string;
  dir?: DeltaDir;
  tone?: Tone;
}) {
  let s = `${o.label} ${spoken(o.valueText, o.unit)}`;
  if (o.averageText && o.averageText !== MISSING) {
    const rel = o.dir === "up" ? "above" : o.dir === "down" ? "below" : "in line with";
    s += `, ${rel} your ${o.averageLabel ?? "30-day average"} of ${o.averageText}`;
    if (o.tone) s += TONE_WORD[o.tone];
  }
  return s;
}
