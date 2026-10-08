// The typical range on an activity's zone rows (spec §11 R39): for each zone, the middle half of the share of time
// earlier activities of the same kind spent in it. See docs/algorithms/zone-typical-range.md.
import { percentile } from "../scoring/strain";

/** Fewer earlier activities than this give no range: one or two workouts are not "typical". */
export const MIN_ACTIVITIES = 3;

export type ShareRange = { low: number; high: number };

/**
 * `prior`: seconds per zone, one array per earlier activity (zones in the same order as the rows). Returns, per zone,
 * the 25th and 75th percentile of that zone's share (0-1) of the activity's zone time, or null with fewer than
 * MIN_ACTIVITIES activities that spent any time in a zone.
 */
export function zoneShareRanges(prior: readonly (readonly number[])[], zones: number): ShareRange[] | null {
  const shares = prior
    .map((p) => ({ p, total: p.reduce((a, b) => a + b, 0) }))
    .filter((x) => x.total > 0)
    .map(({ p, total }) => Array.from({ length: zones }, (_, i) => (p[i] ?? 0) / total));
  if (shares.length < MIN_ACTIVITIES) return null;
  return Array.from({ length: zones }, (_, i) => {
    const sorted = shares.map((s) => s[i]).sort((a, b) => a - b);
    return { low: percentile(sorted, 25), high: percentile(sorted, 75) };
  });
}
