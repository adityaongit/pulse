import { describe, expect, it } from "vitest";
import { type JournalDay, journalImpact, type OutcomeDay } from "./journalImpact";

const DAY_MS = 86_400_000;
const START = "2026-07-01";
const day = (i: number) => new Date(Date.parse(`${START}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);

/** Deterministic noise in [−1, 1). */
let s = 12345;
const noise = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;

// 91 days: alcohol on ~1 in 4 days (next day −15 recovery, −1 HRV z, −8 sleep), coin_flip on a pattern unrelated to the noise.
const N = 91;
const entries: JournalDay[] = [];
const outcomes: OutcomeDay[] = [];
for (let i = 0; i < N; i++) {
  const alcohol = i % 4 === 1;
  entries.push({ day: day(i), tags: { alcohol, coin_flip: (i * 7) % 3 === 0 ? 1 : 0, rare: i === 10 || i === 20 } });
  const drank = (i - 1) % 4 === 1;
  outcomes.push({
    day: day(i),
    recovery: 65 + 12 * noise() - (drank ? 15 : 0),
    hrvZ: 0.6 * noise() - (drank ? 1 : 0),
    sleepPerf: 85 + 6 * noise() - (drank ? 8 : 0),
  });
}
const asOf = day(N - 1);

describe("journalImpact", () => {
  const result = journalImpact(entries, outcomes, asOf);
  const byTag = Object.fromEntries(result.map((t) => [t.tag, t]));

  it("fewer than 5 yes days gives not enough data", () => {
    expect(byTag.rare.status).toBe("not_enough_data");
    expect(byTag.rare.nYes).toBe(2);
    expect(byTag.rare.effects.recovery).toMatchObject({ label: "not_enough_data", delta: null, nYes: 2 });
  });

  it("alcohol-style data gives a negative effect whose CI excludes 0", () => {
    const a = byTag.alcohol;
    expect(a.status).toBe("ok");
    expect(a.nYes + a.nNo).toBe(90);
    for (const m of ["recovery", "hrvZ", "sleepPerf"] as const) {
      expect(a.effects[m].label).toBe("negative");
      expect(a.effects[m].ciHigh!).toBeLessThan(0);
      expect(a.effects[m].ciLow!).toBeLessThan(a.effects[m].delta!);
    }
    expect(a.effects.recovery.delta!).toBeCloseTo(-15, -1);
  });

  it("an unrelated tag gives no clear effect", () => {
    expect(byTag.coin_flip.status).toBe("ok");
    expect(byTag.coin_flip.effects.recovery.label).toBe("no_clear_effect");
  });

  it("ranks by |Δ recovery|, not-enough-data last", () => {
    expect(result.map((t) => t.tag)).toEqual(["alcohol", "coin_flip", "rare"]);
  });

  it("is deterministic and independent of input order", () => {
    expect(journalImpact([...entries].reverse(), [...outcomes].reverse(), asOf)).toEqual(result);
  });

  it("only looks at the 90 days before asOf", () => {
    const later = journalImpact(entries, outcomes, day(N + 200));
    expect(later).toEqual([]);
  });

  it("a missing next-day outcome drops the day from that metric only", () => {
    const sparse = outcomes.map((o, i) => (i % 2 ? { ...o, hrvZ: null } : o));
    const a = journalImpact(entries, sparse, asOf).find((t) => t.tag === "alcohol")!;
    expect(a.effects.recovery.nYes + a.effects.recovery.nNo).toBe(90);
    expect(a.effects.hrvZ.nYes + a.effects.hrvZ.nNo).toBe(45);
  });
});
