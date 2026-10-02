import { Activity, HeartPulse, Hourglass, RefreshCw, Watch, type LucideIcon } from "lucide-react";

// The single source of reason copy (spec §5.14) and the metric shape every view model uses (§4.8).

export const REASON_CODES = [
  "calibrating",
  "no_hrv_last_night",
  "awaiting_sleep_sync",
  "insufficient_hr_data",
  "band_not_worn",
  "no_data",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export type MetricTag = "stale_baseline" | "updated";

/** One nullable metric in a view model. `undefined` (the whole metric) means still loading. */
export type Metric<T> = {
  value: T | null;
  reason: ReasonCode | null;
  provisional: boolean;
  tags?: MetricTag[];
  /** For `calibrating`. */
  nightsLeft?: number;
};

type ReasonEntry = { icon: LucideIcon | null; short: string; long: (nightsLeft?: number) => string };

export const REASONS: Record<ReasonCode, ReasonEntry> = {
  calibrating: {
    icon: Hourglass,
    short: "Calibrating",
    long: (n) =>
      n === undefined ? "Calibrating" : `Calibrating: ${n} ${n === 1 ? "night" : "nights"} left`,
  },
  no_hrv_last_night: {
    icon: HeartPulse,
    short: "No HRV last night",
    long: () => "No HRV last night (needs about 3 h of sleep)",
  },
  awaiting_sleep_sync: {
    icon: RefreshCw,
    short: "Waiting for sleep",
    long: () => "Waiting for last night's sleep to sync",
  },
  insufficient_hr_data: {
    icon: Activity,
    short: "Not enough data",
    long: () => "Not enough heart-rate data",
  },
  band_not_worn: { icon: Watch, short: "Not worn", long: () => "No data: band not worn" },
  no_data: { icon: null, short: "--", long: () => "No data" },
};

/** Any unknown or missing code falls back to `no_data`. */
export function normalizeReason(code: string | null | undefined): ReasonCode {
  return (REASON_CODES as readonly string[]).includes(code ?? "") ? (code as ReasonCode) : "no_data";
}

export function reasonCopy(code: string | null | undefined, nightsLeft?: number) {
  const key = normalizeReason(code);
  const r = REASONS[key];
  return { code: key, icon: r.icon, short: r.short, long: r.long(nightsLeft) };
}

/** Tags shown next to a number, with the explanation used in tooltips and info sheets. */
export const TAG_COPY = {
  provisional: {
    label: "Provisional",
    explain: "Based on fewer than 14 nights. It firms up as your baseline fills in.",
  },
  stale_baseline: {
    label: "Baseline stale",
    explain: "Your baseline has 14 nights or more missing. Scores firm up as new nights arrive.",
  },
  updated: { label: "Updated", explain: "Updated after a late sync added data." },
} as const;
