// Own algorithm (docs/algorithms/journal-impact.md): for each journal behaviour, the difference in next-day
// recovery, HRV z-score and sleep performance between "yes" and "no" days over the last 90 days,
// Δ = mean(yes) − mean(no), with a seeded 90% percentile-bootstrap CI.
import { mean } from "../scoring/forecast";
import { percentile } from "../scoring/strain";

export const journalImpactConfig = {
  /** Behaviour days looked at, ending the day before `asOf` (*tunable*). */
  windowDays: 90,
  /** Minimum "yes" days and minimum "no" days (*tunable*). */
  minDays: 5,
  resamples: 1000,
  /** Two-sided CI level. */
  ciLevel: 0.9,
};

/** One day's check-in. A tag missing from `tags` was not answered that day. Numbers > 0 count as yes. */
export interface JournalDay {
  day: string;
  tags: Record<string, boolean | number>;
}

/** Scores of the day after a behaviour; null when not available. */
export interface OutcomeDay {
  day: string;
  /** 0–100 */
  recovery: number | null;
  /** HRV z-score against its baseline. */
  hrvZ: number | null;
  /** 0–100 */
  sleepPerf: number | null;
}

export const IMPACT_METRICS = ["recovery", "hrvZ", "sleepPerf"] as const;
export type ImpactMetric = (typeof IMPACT_METRICS)[number];
/** Every metric is higher-is-better, so "positive" is good. */
export type ImpactLabel = "positive" | "negative" | "no_clear_effect" | "not_enough_data";

export interface Effect {
  nYes: number;
  nNo: number;
  delta: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  label: ImpactLabel;
}

export interface TagImpact {
  tag: string;
  status: "ok" | "not_enough_data";
  /** Answered days in the window, by answer. */
  nYes: number;
  nNo: number;
  effects: Record<ImpactMetric, Effect>;
}

/** Seeded PRNG (mulberry32); also drives the demo seed in server/sources/seed/generate.ts. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** FNV-1a. */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Percentile-bootstrap CI of mean(yes) − mean(no); the stream is keyed by `key`, so results never depend on tag order. */
function bootstrapCI(yes: number[], no: number[], key: string): [number, number] {
  const { resamples, ciLevel } = journalImpactConfig;
  const next = mulberry32(hash(key));
  const resampleMean = (xs: number[]) => {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(next() * xs.length)];
    return s / xs.length;
  };
  const diffs = Array.from({ length: resamples }, () => resampleMean(yes) - resampleMean(no)).sort((a, b) => a - b);
  const tail = ((1 - ciLevel) / 2) * 100;
  return [percentile(diffs, tail), percentile(diffs, 100 - tail)];
}

function effect(yes: number[], no: number[], key: string): Effect {
  const n = { nYes: yes.length, nNo: no.length };
  if (yes.length < journalImpactConfig.minDays || no.length < journalImpactConfig.minDays) {
    return { ...n, delta: null, ciLow: null, ciHigh: null, label: "not_enough_data" };
  }
  const [ciLow, ciHigh] = bootstrapCI(yes, no, key);
  const label = ciLow > 0 ? "positive" : ciHigh < 0 ? "negative" : "no_clear_effect";
  return { ...n, delta: mean(yes) - mean(no), ciLow, ciHigh, label };
}

/**
 * Impact of every tag answered in the window (asOf − 90 … asOf − 1), on the next day's outcomes.
 * Sorted: tags with a recovery effect by |Δ recovery| descending, then other analysed tags, then
 * "not enough data"; ties by tag name.
 */
export function journalImpact(entries: JournalDay[], outcomes: OutcomeDay[], asOf: string): TagImpact[] {
  const from = addDays(asOf, -journalImpactConfig.windowDays);
  const byDay = new Map(outcomes.map((o) => [o.day, o]));
  const arms = new Map<string, { yes: (OutcomeDay | undefined)[]; no: (OutcomeDay | undefined)[] }>();
  // Day order, so the bootstrap draws the same samples whatever order the caller passes.
  for (const e of [...entries].sort((a, b) => a.day.localeCompare(b.day))) {
    if (e.day < from || e.day >= asOf) continue;
    const next = byDay.get(addDays(e.day, 1));
    for (const [tag, v] of Object.entries(e.tags)) {
      const a = arms.get(tag) ?? { yes: [], no: [] };
      arms.set(tag, a);
      (Number(v) > 0 ? a.yes : a.no).push(next);
    }
  }
  const values = (days: (OutcomeDay | undefined)[], m: ImpactMetric) =>
    days.map((d) => d?.[m]).filter((v): v is number => v != null);

  const result: TagImpact[] = [...arms].map(([tag, { yes, no }]) => {
    const enough = yes.length >= journalImpactConfig.minDays && no.length >= journalImpactConfig.minDays;
    // Per-metric n never exceeds the tag's, so a tag below the minimum gives "not enough data" everywhere.
    const effects = Object.fromEntries(
      IMPACT_METRICS.map((m) => [m, effect(values(yes, m), values(no, m), `${tag}:${m}`)]),
    ) as Record<ImpactMetric, Effect>;
    return { tag, status: enough ? "ok" : "not_enough_data", nYes: yes.length, nNo: no.length, effects };
  });
  const rank = (t: TagImpact) =>
    t.status !== "ok" ? -2 : t.effects.recovery.delta == null ? -1 : Math.abs(t.effects.recovery.delta);
  return result.sort((a, b) => rank(b) - rank(a) || a.tag.localeCompare(b.tag));
}
