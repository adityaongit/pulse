import { describe, expect, it } from "vitest";
import { isoEpochDay } from "../scoring/baselines";
import { piecewiseLinear } from "./fitnessLevel";
import {
  curves,
  healthspan,
  healthspanConfig,
  referenceProfile,
  type HealthspanDay,
  type HealthspanInput,
  type HealthspanProfile,
} from "./healthspan";

const asOf = "2026-10-02";
const today = isoEpochDay(asOf)!;
const iso = (epochDay: number) => new Date(epochDay * 86_400_000).toISOString().slice(0, 10);
const profile: HealthspanProfile = { age: 35, sex: "male", heightCm: 180 };
const ref = referenceProfile(35, "male");
/** ln HR → years: shrink × renormalization ÷ (ln 2 / 8). All nine terms present unless stated. */
const years = (lnHr: number, present = 9) => (lnHr * 0.75 * (9 / present)) / (Math.LN2 / 8);

/** A day exactly at the reference profile: FFMI 18.9 at 1.80 m and 20 % body fat. */
const refDay = (): Omit<HealthspanDay, "day"> => ({
  sleepHours: ref.sleepHours,
  sri: ref.sri,
  zone13Min: ref.zone13 / 7,
  zone45Min: ref.zone45 / 7,
  strengthMin: ref.strength / 7,
  steps: ref.steps,
  vo2maxRun: ref.vo2max,
  restingHr: ref.restingHr,
  weightKg: (ref.leanMass * 1.8 ** 2) / 0.8,
  bodyFatPct: 20,
});
/** `n` days ending today; `f(age)` overrides fields, where `age` is days before today. */
const series = (n: number, f: (daysAgo: number) => Partial<HealthspanDay> = () => ({})): HealthspanDay[] =>
  Array.from({ length: n }, (_, i) => ({ day: iso(today - (n - 1 - i)), ...refDay(), ...f(n - 1 - i) }));
const run = (days: HealthspanDay[], p: HealthspanProfile = profile) => healthspan(days, p, asOf)!;

describe("Pulse Age", () => {
  it("the reference profile scores Pulse Age = chronological age", () => {
    const r = run(series(180));
    expect(r.pulseAge).toBeCloseTo(35, 10);
    expect(r.contributions).toHaveLength(9);
    for (const c of r.contributions) expect(c.years).toBeCloseTo(0, 10);
    expect(r.paceOfAging).toBeCloseTo(1, 10);
  });

  it("higher VO2max lowers it: +2 METs is 2 · ln 0.87 of hazard", () => {
    const r = run(series(180, () => ({ vo2maxRun: ref.vo2max + 7 })));
    expect(r.deltaYears).toBeCloseTo(years(2 * Math.log(0.87)), 10);
    expect(r.deltaYears).toBeCloseTo(-2.41, 2);
  });

  it("higher resting HR raises it: +10 bpm is ln 1.09", () => {
    const r = run(series(180, () => ({ restingHr: 70 })));
    expect(r.deltaYears).toBeCloseTo(years(Math.log(1.09)), 10);
    expect(r.deltaYears).toBeCloseTo(0.75, 2);
  });

  it("missing lean mass drops the term and renormalizes the other eight", () => {
    const r = run(series(180, () => ({ restingHr: 70 })), { ...profile, heightCm: null });
    expect(r.contributions.map((c) => c.key)).not.toContain("leanMass");
    expect(r.contributions).toHaveLength(8);
    expect(r.deltaYears).toBeCloseTo(years(Math.log(1.09), 8), 10);
    // Body fat without weight on any day drops it too.
    const r2 = run(series(180, () => ({ restingHr: 70, weightKg: null })));
    expect(r2.deltaYears).toBeCloseTo(r.deltaYears, 10);
  });

  it("contributions sum to the unclamped Δage", () => {
    const r = run(series(180, () => ({ restingHr: 66, steps: 6000, sleepHours: 6, sri: 70 })));
    expect(r.contributions.reduce((a, c) => a + c.years, 0)).toBeCloseTo(r.deltaYears, 10);
    expect(r.contributions.find((c) => c.key === "steps")!.years).toBeGreaterThan(0);
  });

  it("clamps to ±15 years", () => {
    const bad = run(
      series(180, () => ({ vo2maxRun: 15, restingHr: 100, steps: 2000, sleepHours: 4, sri: 40, zone13Min: 0, zone45Min: 0, strengthMin: 0 })),
    );
    expect(bad.pulseAge).toBe(50);
    expect(bad.deltaYears).toBe(15);
    const old: HealthspanProfile = { age: 75, sex: "male", heightCm: 180 };
    const good = run(series(180, () => ({ vo2maxRun: 80, restingHr: 45, zone13Min: 60, zone45Min: 60, sri: 95, weightKg: 90 })), old);
    expect(good.pulseAge).toBe(60);
  });

  it("is provisional below 20 days of data", () => {
    expect(run(series(19)).provisional).toBe(true);
    const r = run(series(20));
    expect(r.provisional).toBe(false);
    expect(r.dataDays).toBe(20);
    // Empty rows are not data.
    const padded = [...series(19), ...Array.from({ length: 5 }, (_, i) => ({ day: iso(today - 30 - i) }))];
    expect(run(padded).provisional).toBe(true);
  });

  it("is null below minTerms inputs or for a bad date", () => {
    expect(healthspan([{ day: asOf, restingHr: 60, steps: 9000 }], profile, asOf)).toBeNull();
    expect(healthspan(series(30), profile, "not-a-day")).toBeNull();
  });

  it("ignores days after asOf and before the 6-month window", () => {
    const later = { day: iso(today + 1), ...refDay(), restingHr: 120 };
    const older = { day: iso(today - 200), ...refDay(), restingHr: 120 };
    expect(run([older, ...series(180), later]).deltaYears).toBeCloseTo(0, 10);
  });
});

describe("VO2max source rule", () => {
  const plus7 = ref.vo2max + 7;
  const full = years(2 * Math.log(0.87));

  it("a run-vo2-max value in the last 90 days is used at full weight", () => {
    const r = run(series(180, (ago) => ({ vo2maxRun: ago === 80 ? plus7 : null, vo2maxDaily: ref.vo2max })));
    expect(r.vo2maxSource).toBe("run");
    expect(r.contributions.find((c) => c.key === "vo2max")!.years).toBeCloseTo(full, 10);
  });

  it("with only daily-vo2-max, the same value moves Pulse Age half as much", () => {
    const r = run(series(180, () => ({ vo2maxRun: null, vo2maxDaily: plus7 })));
    expect(r.vo2maxSource).toBe("daily");
    expect(r.deltaYears).toBeCloseTo(full / 2, 10);
  });

  it("a run value older than 90 days falls back to daily", () => {
    const r = run(series(180, (ago) => ({ vo2maxRun: ago === 100 ? plus7 : null, vo2maxDaily: ref.vo2max })));
    expect(r.vo2maxSource).toBe("daily");
    expect(r.deltaYears).toBeCloseTo(0, 10);
  });

  it("no VO2max at all drops the term", () => {
    const r = run(series(180, () => ({ vo2maxRun: null })));
    expect(r.vo2maxSource).toBeNull();
    expect(r.contributions).toHaveLength(8);
  });
});

describe("Pace of Aging", () => {
  it("flat inputs give 1.0", () => {
    expect(run(series(180, () => ({ restingHr: 68, steps: 7000 }))).paceOfAging).toBeCloseTo(1, 10);
  });

  it("an input missing in the last 30 days keeps its 6-month value, so flat stays 1.0", () => {
    const r = run(series(180, (ago) => (ago < 30 ? { weightKg: null, bodyFatPct: null } : {})));
    expect(r.contributions).toHaveLength(9);
    expect(r.paceOfAging).toBeCloseTo(1, 10);
  });

  it("improving the last 30 days gives < 1, worsening gives > 1", () => {
    const better = run(series(180, (ago) => ({ restingHr: ago < 30 ? 50 : 60 })));
    // 6-month mean 58.33 bpm vs 30-day 50 bpm.
    expect(better.paceOfAging).toBeCloseTo(1 + (years(-Math.log(1.09)) - years((-10 / 60) * Math.log(1.09))) / 5, 10);
    expect(better.paceOfAging).toBeLessThan(1);
    // Each factor carries its 30-day value beside the 6-month one.
    expect(better.contributions.find((c) => c.key === "restingHr")).toMatchObject({ value: expect.closeTo(58.33, 2), recent: 50 });
    expect(run(series(180, (ago) => ({ restingHr: ago < 30 ? 75 : 60 }))).paceOfAging).toBeGreaterThan(1);
  });

  it("stays within [−1, 3]", () => {
    const awful = { vo2maxRun: 15, restingHr: 100, steps: 2000, sleepHours: 4, sri: 40, zone13Min: 0, zone45Min: 0, strengthMin: 0 };
    const great = { vo2maxRun: 70, restingHr: 45, zone13Min: 60, zone45Min: 60, sri: 95 };
    expect(run(series(180, (ago) => (ago < 30 ? great : awful))).paceOfAging).toBe(-1);
    expect(run(series(180, (ago) => (ago < 30 ? awful : great))).paceOfAging).toBe(3);
    for (let rhr = 40; rhr <= 110; rhr += 5) {
      const p = run(series(180, (ago) => ({ restingHr: ago < 30 ? rhr : 110 - rhr + 40 }))).paceOfAging;
      expect(p).toBeGreaterThanOrEqual(-1);
      expect(p).toBeLessThanOrEqual(3);
    }
  });

  it("is provisional until the data spans 6 months", () => {
    expect(run(series(179)).paceProvisional).toBe(true);
    expect(run(series(180)).paceProvisional).toBe(false);
  });
});

describe("dose-response curves", () => {
  /** Sign of each successive step over a sweep wider than the knots. */
  const steps = (key: HealthspanInput, from: number, to: number) => {
    const xs = Array.from({ length: 401 }, (_, i) => from + ((to - from) * i) / 400);
    return xs.slice(1).map((x, i) => ({ x, d: piecewiseLinear(curves[key], x) - piecewiseLinear(curves[key], xs[i]) }));
  };
  const span = (key: HealthspanInput) => {
    const k = curves[key];
    const lo = k[0][0];
    const hi = k[k.length - 1][0];
    return [lo - (hi - lo) * 0.2, hi + (hi - lo) * 0.2] as const;
  };

  it.each(["vo2max", "steps", "sri", "zone13", "zone45", "leanMass"] as const)("%s never raises hazard as it rises", (key) => {
    const s = steps(key, ...span(key));
    for (const { d } of s) expect(d).toBeLessThanOrEqual(1e-12);
    expect(s.some(({ d }) => d < 0)).toBe(true);
  });

  it("restingHr never lowers hazard as it rises", () => {
    const s = steps("restingHr", ...span("restingHr"));
    for (const { d } of s) expect(d).toBeGreaterThanOrEqual(-1e-12);
  });

  it("sleepHours is U-shaped: falls to 7 h, flat to 8 h, rises after", () => {
    for (const { x, d } of steps("sleepHours", 3, 11)) {
      if (x <= 7) expect(d).toBeLessThanOrEqual(1e-12);
      else if (x <= 8) expect(d).toBeCloseTo(0, 12);
      else expect(d).toBeGreaterThanOrEqual(-1e-12);
    }
  });

  it("strength is J-shaped: falls to the 40 min/week nadir, rises back to RR 1 at 140", () => {
    for (const { x, d } of steps("strength", 0, 200)) {
      if (x <= 40) expect(d).toBeLessThanOrEqual(1e-12);
      else expect(d).toBeGreaterThanOrEqual(-1e-12);
    }
    expect(piecewiseLinear(curves.strength, 140)).toBeCloseTo(0, 12);
  });

  it("is flat beyond the end knots", () => {
    for (const key of Object.keys(curves) as HealthspanInput[]) {
      const k = curves[key];
      expect(piecewiseLinear(k, k[0][0] - 100)).toBe(k[0][1]);
      expect(piecewiseLinear(k, k[k.length - 1][0] + 1e6)).toBe(k[k.length - 1][1]);
    }
  });

  it("steps beyond the age plateau earn nothing", () => {
    expect(run(series(180, () => ({ steps: 15_000 }))).deltaYears).toBeCloseTo(0, 10);
    expect(referenceProfile(65, "female").steps).toBe(healthspanConfig.stepsPlateau.from60);
  });
});
