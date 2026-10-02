// Own algorithm (docs/algorithms/healthspan.md): WHOOP Age and Pace of Aging. Each input maps to a log
// hazard ratio through a piecewise-linear dose-response curve pinned from a cited paper. The terms are
// taken against a reference profile, summed and shrunk for overlap, then turned into years with the
// Gompertz doubling time. The method follows noop's VitalityEngine.kt; the curves and the gates are ours.
import { isoEpochDay } from "../scoring/baselines";
import { piecewiseLinear, referenceVo2max, type Knots, type Sex } from "./fitnessLevel";

/** One day's inputs. A null or absent field means no data that day. */
export interface HealthspanDay {
  /** yyyy-MM-dd */
  day: string;
  /** Main-sleep asleep hours. */
  sleepHours?: number | null;
  /** Trailing 7-day SRI on [−100, 100], from sleepRegularityIndex. */
  sri?: number | null;
  /** Minutes in %HRmax zones 1–3 that day. */
  zone13Min?: number | null;
  /** Minutes in %HRmax zones 4–5 that day. */
  zone45Min?: number | null;
  /** Strength-workout minutes; 0 on a worn day without one. */
  strengthMin?: number | null;
  steps?: number | null;
  /** `run-vo2-max`, mL/kg/min. */
  vo2maxRun?: number | null;
  /** `daily-vo2-max`, mL/kg/min. */
  vo2maxDaily?: number | null;
  /** Google's daily resting HR, bpm. */
  restingHr?: number | null;
  weightKg?: number | null;
  /** Body fat, 0–100 %. */
  bodyFatPct?: number | null;
}

export interface HealthspanProfile {
  /** Chronological age in years on the evaluation day (fractional is fine). */
  age: number;
  sex: Sex;
  /** Needed for the lean-mass term (fat-free mass index); the term drops without it. */
  heightCm?: number | null;
}

/** [x, HR] rows → [x, ln HR] knots. */
const lnHr = (rows: [number, number][]): Knots => rows.map(([x, hr]) => [x, Math.log(hr)] as const);

/**
 * Dose-response curves in each input's units, flat beyond the end knots. Only differences from the
 * reference matter, so a curve's own reference point is arbitrary. Sources and approximations are in
 * docs/algorithms/healthspan.md.
 */
export const curves = {
  // mL/kg/min. Kodama 2009 JAMA: RR 0.87 per 1 MET (3.5 mL/kg/min) higher, linear.
  vo2max: lnHr([[10, 1], [80, 0.87 ** (70 / 3.5)]]),
  // bpm. Zhang 2016 CMAJ: RR 1.09 per 10 bpm, linear from 45 bpm.
  restingHr: lnHr([[45, 1], [105, 1.09 ** 6]]),
  // Steps/day. Paluch 2022 Lancet Public Health: quartile medians, HR vs Q1.
  steps: lnHr([[3553, 1], [5801, 0.6], [7842, 0.55], [10901, 0.47]]),
  // Hours. Cappuccio 2010 Sleep: short RR 1.12, long RR 1.30 vs 7–8 h, placed at 5 h and 9 h (approximation).
  sleepHours: lnHr([[5, 1.12], [7, 1], [8, 1], [9, 1.3]]),
  // SRI. Windred 2024 Sleep, Tables 1–2 (full model): quintile medians, HR vs Q1.
  sri: lnHr([[65.1, 1], [75.62, 0.8], [80.99, 0.75], [85.22, 0.72], [89.8, 0.7]]),
  // Min/week. Ekelund 2019 BMJ, Suppl. Table 5: MVPA spline in min/day (× 7 here), HR vs ~0 min/day.
  zone13: lnHr(
    [[0, 1], [2, 0.89], [4, 0.79], [6, 0.7], [8, 0.62], [10, 0.56], [12, 0.5], [14, 0.46], [16, 0.43], [18, 0.41], [20, 0.4], [22, 0.4], [24, 0.39]]
      .map(([perDay, hr]): [number, number] => [perDay * 7, hr]),
  ),
  // Min/week. Lee 2022 Circulation, vigorous adjusted for moderate: 75–149 → 0.81, 150–299 → 2–4 % lower,
  // ≥ 300 no further benefit; at category midpoints (approximation).
  zone45: lnHr([[0, 1], [112, 0.81], [225, 0.81 * 0.97]]),
  // Min/week. Momma 2022 BJSM: J-shape, nadir RR 0.83 at 40 min/week, RR < 1 up to ~140 min/week.
  strength: lnHr([[0, 1], [40, 0.83], [140, 1]]),
  // Fat-free mass index, kg/m². Sedlmeier 2021 AJCN: FFMI 21.9 vs 16.1 → HR 0.70.
  leanMass: lnHr([[16.1, 1], [21.9, 0.7]]),
} satisfies Record<string, Knots>;

export type HealthspanInput = keyof typeof curves;

export const healthspanConfig = {
  /** Shrink on Σ ln HR for correlated inputs (*tunable*; noop VitalityEngine.kt uses 0.75). */
  overlapShrink: 0.75,
  /** Gompertz mortality-rate doubling time, years (Finch et al. 1990: about 8). */
  doublingYears: 8,
  /** WHOOP Age = age ± at most this (*tunable*). */
  clampYears: 15,
  /** S in Pace = 1 + (Δ30d − Δ6mo) / S (*tunable*). */
  paceScaleYears: 5,
  paceMin: -1,
  paceMax: 3,
  /** `daily-vo2-max` weight when no `run-vo2-max` is recent (*tunable*): it leans on resting HR, already a term. */
  dailyVo2maxWeight: 0.5,
  runVo2maxLookbackDays: 90,
  ageWindowDays: 180,
  paceWindowDays: 30,
  /** Fewer days with any input → provisional. */
  minDays: 20,
  /** Fewer terms → no result, since renormalizing would multiply a few terms too far (*tunable*). */
  minTerms: 5,
  /** Paluch 2022: the step count where benefit plateaus, used as cap and reference (< 60: 8–10k; ≥ 60: 6–8k). */
  stepsPlateau: { under60: 10_000, from60: 8_000 },
  /** The reference profile besides VO2max and steps (*tunable* targets; see the doc for each). */
  reference: {
    restingHr: 60,
    sleepHours: 7.5,
    sri: 86.3,
    zone13: 150,
    zone45: 75,
    strength: 40,
    leanMass: { male: 18.9, female: 15.4 },
  },
};

/** The profile that scores WHOOP Age = chronological age. */
export function referenceProfile(age: number, sex: Sex): Record<HealthspanInput, number> {
  const r = healthspanConfig.reference;
  const p = healthspanConfig.stepsPlateau;
  return {
    vo2max: referenceVo2max(age, sex),
    restingHr: r.restingHr,
    steps: age < 60 ? p.under60 : p.from60,
    sleepHours: r.sleepHours,
    sri: r.sri,
    zone13: r.zone13,
    zone45: r.zone45,
    strength: r.strength,
    leanMass: r.leanMass[sex],
  };
}

export interface HealthspanContribution {
  key: HealthspanInput;
  /** The window's value, in the curve's units (weekly minutes for zones and strength, FFMI for lean mass). */
  value: number;
  reference: number;
  /** Signed years added to WHOOP Age (renormalized and shrunk; they sum to the unclamped Δage). */
  years: number;
}

export interface HealthspanResult {
  whoopAge: number;
  /** WHOOP Age − age, clamped to ±clampYears. */
  deltaYears: number;
  paceOfAging: number;
  /** For the 6-month window. */
  contributions: HealthspanContribution[];
  vo2maxSource: "run" | "daily" | null;
  /** Days in the 6-month window with any input. */
  dataDays: number;
  provisional: boolean;
  /** True until the data spans the full 6-month window. */
  paceProvisional: boolean;
}

type Summary = Partial<Record<HealthspanInput, number>>;

const mean = (xs: (number | null | undefined)[]): number | undefined => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
};

/** Window means; minutes become weekly (mean daily × 7). Inputs without data are absent. */
function summarize(days: HealthspanDay[], heightCm: number | null | undefined, run: boolean): Summary {
  const week = (xs: (number | null | undefined)[]) => {
    const m = mean(xs);
    return m == null ? undefined : m * 7;
  };
  const h2 = heightCm ? (heightCm / 100) ** 2 : null;
  const s: Record<HealthspanInput, number | undefined> = {
    vo2max: mean(days.map((d) => (run ? d.vo2maxRun : d.vo2maxDaily))),
    restingHr: mean(days.map((d) => d.restingHr)),
    steps: mean(days.map((d) => d.steps)),
    sleepHours: mean(days.map((d) => d.sleepHours)),
    sri: mean(days.map((d) => d.sri)),
    zone13: week(days.map((d) => d.zone13Min)),
    zone45: week(days.map((d) => d.zone45Min)),
    strength: week(days.map((d) => d.strengthMin)),
    leanMass:
      h2 == null
        ? undefined
        : mean(days.map((d) => (d.weightKg != null && d.bodyFatPct != null ? (d.weightKg * (1 - d.bodyFatPct / 100)) / h2 : null))),
  };
  return Object.fromEntries(Object.entries(s).filter(([, v]) => v != null));
}

/** Unclamped Δage and its per-input years, or null below minTerms. Missing terms renormalize the rest. */
function deltaAge(s: Summary, ref: Record<HealthspanInput, number>, vo2Weight: number) {
  const cfg = healthspanConfig;
  const all = Object.keys(curves) as HealthspanInput[];
  const present = all.filter((k) => s[k] != null);
  if (present.length < cfg.minTerms) return null;
  const toYears = (cfg.overlapShrink * (all.length / present.length)) / (Math.LN2 / cfg.doublingYears);
  const contributions = present.map((key): HealthspanContribution => {
    const value = s[key]!;
    // Steps beyond the age plateau earn nothing more (Paluch 2022).
    const x = key === "steps" ? Math.min(value, ref.steps) : value;
    const lnHazard = piecewiseLinear(curves[key], x) - piecewiseLinear(curves[key], ref[key]);
    return { key, value, reference: ref[key], years: lnHazard * (key === "vo2max" ? vo2Weight : 1) * toYears };
  });
  return { years: contributions.reduce((a, c) => a + c.years, 0), contributions };
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

const hasInput = (d: HealthspanDay) =>
  Object.entries(d).some(([k, v]) => k !== "day" && v != null);

/**
 * WHOOP Age over the 6 months to `asOf`, and Pace of Aging from the last 30 days against those 6 months,
 * both at today's age. Null when the 6-month window has fewer than minTerms inputs.
 */
export function healthspan(days: HealthspanDay[], profile: HealthspanProfile, asOf: string): HealthspanResult | null {
  const cfg = healthspanConfig;
  const today = isoEpochDay(asOf);
  if (today == null) return null;
  const within = (n: number) =>
    days.filter((d) => {
      const e = isoEpochDay(d.day);
      return e != null && e <= today && today - e < n;
    });
  const sixMonths = within(cfg.ageWindowDays);
  const run = within(cfg.runVo2maxLookbackDays).some((d) => d.vo2maxRun != null);
  const ref = referenceProfile(profile.age, profile.sex);
  const long = summarize(sixMonths, profile.heightCm, run);
  // A term with no data lately keeps its 6-month value, so both windows renormalize alike.
  const short = { ...long, ...summarize(within(cfg.paceWindowDays), profile.heightCm, run) };
  const vo2Weight = run ? 1 : cfg.dailyVo2maxWeight;
  const a = deltaAge(long, ref, vo2Weight);
  const b = deltaAge(short, ref, vo2Weight);
  if (!a || !b) return null;

  const deltaYears = clamp(a.years, -cfg.clampYears, cfg.clampYears);
  const withData = sixMonths.filter(hasInput);
  const first = Math.min(...within(Infinity).filter(hasInput).map((d) => isoEpochDay(d.day)!));
  return {
    whoopAge: profile.age + deltaYears,
    deltaYears,
    // Unclamped deltas, so a change still shows while WHOOP Age sits at the clamp.
    paceOfAging: clamp(1 + (b.years - a.years) / cfg.paceScaleYears, cfg.paceMin, cfg.paceMax),
    contributions: a.contributions,
    vo2maxSource: long.vo2max == null ? null : run ? "run" : "daily",
    dataDays: withData.length,
    provisional: withData.length < cfg.minDays,
    paceProvisional: today - first + 1 < cfg.ageWindowDays,
  };
}
