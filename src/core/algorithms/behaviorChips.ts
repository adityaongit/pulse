// Behavior Insights on Recovery (spec §11 R34): the behaviours of the day before that held for today's Recovery, each
// toned by the journal-impact comparison of the user's own next-day Recovery after days with it against days without.
import { journalImpact, type ImpactLabel } from "./journalImpact";

export type BehaviorKey = "sleep86" | "strain7" | "earlyWorkout" | "consistentWake";

export const BEHAVIOR_LABEL: Record<BehaviorKey, string> = {
  sleep86: "86%+ Sleep Performance",
  strain7: "7+ Strain",
  earlyWorkout: "Early Workout",
  consistentWake: "Consistent Wake Time",
};

/** A behaviour day D: which behaviours held (D's strain and workouts, and the night that ends on D + 1). */
export type BehaviorDay = { day: string; holds: Partial<Record<BehaviorKey, boolean>> };

export type BehaviorChip = { key: BehaviorKey; label: string; effect: "up" | "down" | "neutral" };

const EFFECT: Record<ImpactLabel, BehaviorChip["effect"]> = { positive: "up", negative: "down", no_clear_effect: "neutral", not_enough_data: "neutral" };

/**
 * The chips for Recovery on `asOf`: every behaviour that held on the day before, in a fixed order. "up" or "down" when
 * journal impact finds a clear next-day Recovery effect over its window, else "neutral".
 */
export function behaviorChips(days: readonly BehaviorDay[], recovery: readonly { day: string; recovery: number | null }[], asOf: string): BehaviorChip[] {
  const yesterday = days.find((d) => d.day === addDay(asOf, -1));
  if (!yesterday) return [];
  const impact = journalImpact(
    days.map((d) => ({ day: d.day, tags: Object.fromEntries(Object.entries(d.holds).filter(([, v]) => v !== undefined)) as Record<string, boolean> })),
    recovery.map((r) => ({ day: r.day, recovery: r.recovery, hrvZ: null, sleepPerf: null })),
    asOf,
  );
  return (Object.keys(BEHAVIOR_LABEL) as BehaviorKey[])
    .filter((k) => yesterday.holds[k])
    .map((key) => ({ key, label: BEHAVIOR_LABEL[key], effect: EFFECT[impact.find((t) => t.tag === key)?.effects.recovery.label ?? "not_enough_data"] }));
}

function addDay(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
