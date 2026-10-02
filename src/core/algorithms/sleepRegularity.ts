// Own algorithm (docs/algorithms/sleep-regularity.md): the Sleep Regularity Index (Phillips et al. 2017,
// Sci Rep 7:3216). Each minute of the window is asleep or awake, and
// SRI = −100 + 200 · P(same state at t and t + 24 h), over minute pairs whose two days both have data.

export const sleepRegularityConfig = {
  /** Days in the window (*tunable*; the plan's "last 7 days", as in UK Biobank's 7-day SRI). */
  windowDays: 7,
};

const MIN_PER_DAY = 1440;

/**
 * SRI on [−100, 100], or null when no pair of consecutive covered days exists.
 * @param sessions every sleep session (main sleep and naps), unix seconds; naps count as sleep.
 * @param windowStart unix seconds of the first day's local midnight.
 * @param covered one flag per day: false when the day has no data (band not worn), so its pairs are skipped.
 */
export function sleepRegularityIndex(
  sessions: { start: number; end: number }[],
  windowStart: number,
  covered: boolean[] = Array(sleepRegularityConfig.windowDays).fill(true),
): number | null {
  const n = covered.length * MIN_PER_DAY;
  const asleep = new Uint8Array(n);
  // Minute m (starting at windowStart + 60m) is asleep when a session covers its start.
  const minute = (ts: number) => Math.min(n, Math.max(0, Math.ceil((ts - windowStart) / 60)));
  for (const s of sessions) asleep.fill(1, minute(s.start), minute(s.end));
  // ponytail: t + 24 h is absolute time, so a DST night compares clock times 1 h apart; fine for a 7-day score.
  let same = 0;
  let pairs = 0;
  for (let d = 0; d + 1 < covered.length; d++) {
    if (!covered[d] || !covered[d + 1]) continue;
    for (let m = d * MIN_PER_DAY; m < (d + 1) * MIN_PER_DAY; m++) {
      pairs++;
      if (asleep[m] === asleep[m + MIN_PER_DAY]) same++;
    }
  }
  return pairs === 0 ? null : -100 + (200 * same) / pairs;
}

/** The 0–100 display value: max(0, SRI). */
export const sriDisplay = (sri: number): number => Math.max(0, sri);

/** The display value on [0, 1], for sleep.rest()'s `consistency` parameter. */
export const sriConsistency = (sri: number | null): number | null => (sri == null ? null : sriDisplay(sri) / 100);
