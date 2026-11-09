// Stage 2's per-day scorers, one per daily_scores column. Each reads the day and the fold (state built
// from earlier days only) and returns its row; the few that feed later days push onto the fold.
// stage2.ts calls them in a fixed order, which the pushes depend on.
import type { ReasonCode } from "@/lib/reasons";
import { addDays, fractionalYears, localMidnight, localMinutes, wholeYears } from "../time";
import { deviation, isTrusted, isUsable, sigma } from "@/core/scoring/baselines";
import { chargeDrivers, type ChargeDriver } from "@/core/scoring/drivers";
import { forecast as recoveryForecast } from "@/core/scoring/forecast";
import { evaluateWithTrainingLoad, type ReadinessDay } from "@/core/scoring/readiness";
import { gatedRecovery, minBaselineNights } from "@/core/scoring/recovery";
import { creditedSleepMin, hypnogramMetrics, ledger, minNeedNights, personalizedNeedHours, rest } from "@/core/scoring/sleep";
import { toStrainScale } from "@/core/scoring/strain";
import { foldDaytimeBaseline } from "@/core/scoring/stressBase";
import type { BaselineState } from "@/core/scoring/types";
import { energyBank, energyBankConfig } from "@/core/algorithms/energyBank";
import { fitnessLevel } from "@/core/algorithms/fitnessLevel";
import { healthMonitor, healthMonitorConfig, type HealthMonitorDay, type VitalKey } from "@/core/algorithms/healthMonitor";
import { healthspan, STRENGTH_TYPES, type HealthspanDay } from "@/core/algorithms/healthspan";
import type { OutcomeDay } from "@/core/algorithms/journalImpact";
import type { ReportDay } from "@/core/algorithms/reports";
import { sleepPlan, type SleepPlan } from "@/core/algorithms/sleepPlanner";
import { sleepRegularityIndex, sriConsistency, sriDisplay } from "@/core/algorithms/sleepRegularity";
import { strainTarget } from "@/core/algorithms/strainTarget";
import { stress } from "@/core/algorithms/stress";
import { type Data, r1, round, type Segment, type Session } from "./data";
import type {
  BaselineSummary,
  EnergyBankRow,
  FitnessRow,
  HealthMonitorRow,
  HealthspanRow,
  PipelineOptions,
  RecoveryRow,
  SleepPlannerRow,
  SleepRow,
  Stage1Activity,
  Stage1Day,
  StrainTargetRow,
  StressRow,
  TrainingLoadRow,
} from "./types";

/** A day's stage-1 results as stage 2 reads them back, with the recovery it showed last run. */
export type Cached = { s1: Stage1Day; activities: Stage1Activity[]; sessionRhr: number | null; recovery: RecoveryRow | null };

/** What stage 2 reads once, besides `Data`. */
export type Inputs = {
  cached: Map<string, Cached>;
  /** Per-minute series, loaded a batch of days at a time by stage 2 (only the day being scored is ever asked for). */
  stillHr: Pick<Map<string, (number | null)[]>, "get">;
  loadSeries: Pick<Map<string, (number | null)[]>, "get">;
  segments: Map<string, Segment[]>;
  tagOn: (day: string, tag: string) => boolean;
};

/** State folded over the days before the current one (baselines before today's fold). */
export type Fold = ReturnType<typeof newFold>;
export const newFold = () => ({
  hrvB: null as BaselineState | null,
  rhrB: null as BaselineState | null,
  respB: null as BaselineState | null,
  skinB: null as BaselineState | null,
  nights: [] as { day: string; hours: number }[],
  ledgerSeries: [] as [string, number | null][],
  readinessRows: [] as ReadinessDay[],
  monitorRows: [] as HealthMonitorDay[],
  hsRows: [] as HealthspanDay[],
  outcomes: [] as OutcomeDay[],
  efforts: [] as (number | null)[],
  recoveries: [] as number[],
  aggregates: [] as (number | null)[],
  reportRows: [] as ReportDay[],
  wakeNights: [] as { day: string; wakeMin: number; efficiency: number | null }[],
  prevAcwr: null as number | null,
});

/** One day's inputs. */
export type Day = ReturnType<typeof dayOf>;
export function dayOf(data: Data, inputs: Inputs, day: string, opts: PipelineOptions) {
  const cache = inputs.cached.get(day)!;
  const mainSession = data.mainOf.get(day);
  const main = mainSession ? nightOf(mainSession, inputs.segments.get(mainSession.id)) : null;
  return {
    day,
    start: data.dayStart(day),
    end: data.dayStart(addDays(day, 1)),
    dm: data.metrics.get(day),
    cache,
    s1: cache.s1,
    worn: cache.s1.hrCount > 0,
    mainSession,
    main,
    naps: (data.sessionsByDay.get(day) ?? [])
      .filter((s) => s !== mainSession && !s.isMain)
      .map((s) => ({ id: s.id, start: s.startTs, end: s.endTs, asleepMin: s.asleepMin ?? 0 })),
    // noop truncates to whole years for sleep need; healthspan and fitness take the fraction.
    age: { whole: wholeYears(opts.profile.birthDate, day), years: fractionalYears(opts.profile.birthDate, day) },
  };
}

const summarize = (s: BaselineState | null): BaselineSummary =>
  s && { mean: s.baseline, sd: sigma(s), status: s.status, nValid: s.nValid };

const meanOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function nightOf(main: Session, segments: Segment[] | undefined): NonNullable<SleepRow["main"]> {
  const staged = main.stagesStatus === "SUCCEEDED" && !!segments?.length;
  const inBedS = Math.max(0, main.endTs - main.startTs);
  if (staged) {
    const h = hypnogramMetrics({
      start: main.startTs,
      end: main.endTs,
      stages: segments!.map((g) => ({ start: g.startTs, end: g.endTs, stage: g.stage })),
    });
    return {
      id: main.id,
      start: main.startTs,
      end: main.endTs,
      processed: main.processed,
      staged,
      inBedMin: h.tibS / 60,
      asleepMin: h.tstS / 60,
      awakeMin: (h.tibS - h.tstS) / 60,
      deepMin: h.deepMin,
      remMin: h.remMin,
      lightMin: h.lightMin,
      efficiency: h.efficiency,
      wakeEvents: h.disturbances,
    };
  }
  const asleepMin = main.asleepMin ?? 0;
  return {
    id: main.id,
    start: main.startTs,
    end: main.endTs,
    processed: main.processed,
    staged,
    inBedMin: inBedS / 60,
    asleepMin,
    awakeMin: main.awakeMin ?? Math.max(0, inBedS / 60 - asleepMin),
    deepMin: main.deepMin,
    remMin: main.remMin,
    lightMin: main.lightMin,
    efficiency: inBedS > 0 ? Math.min(1, (asleepMin * 60) / inBedS) : 0,
    wakeEvents: null,
  };
}

// ── Sleep ────────────────────────────────────────────────────────────────────

export function scoreSleep(data: Data, inputs: Inputs, f: Fold, d: Day, tz: string): SleepRow {
  const { day, main, naps, mainSession } = d;
  const recentNights = f.nights.slice(-28).map((n) => n.hours);
  const needHours = personalizedNeedHours(recentNights, d.age.whole);
  const sri = sleepRegularity(data, inputs.cached, day, tz);
  const consistency = sriConsistency(sri);
  const performance =
    main && main.asleepMin > 0
      ? rest(main.asleepMin * 60, main.efficiency, (main.deepMin ?? 0) * 60, (main.remMin ?? 0) * 60, needHours, consistency)
      : null;
  const yesterdayNaps = (data.sessionsByDay.get(addDays(day, -1)) ?? []).filter((s) => !s.isMain);
  const creditedMin = creditedSleepMin(main?.asleepMin ?? null, yesterdayNaps.reduce((a, s) => a + (s.asleepMin ?? 0), 0));
  f.ledgerSeries.push([day, creditedMin]);
  const debtMin = ledger(f.ledgerSeries, needHours).magnitudeMin;
  const reason: ReasonCode | null = !mainSession
    ? "band_not_worn"
    : !mainSession.processed
      ? "awaiting_sleep_sync"
      : performance == null
        ? "no_data"
        : null;
  return {
    reason,
    main,
    naps,
    performance,
    needHours,
    needNights: Math.min(recentNights.length, 28),
    creditedMin,
    debtMin,
    sri,
    consistency: sri == null ? null : sriDisplay(sri),
  };
}

/** SRI over the 7 nights ending on D: noon-to-noon periods, so tonight's sleep never counts toward today. */
function sleepRegularity(data: Data, cached: Map<string, Cached>, day: string, tz: string): number | null {
  const noon = (d: string) => localMidnight(d, tz) + 12 * 3600;
  const windowStart = noon(addDays(day, -7));
  const sessions = [];
  for (let k = -7; k <= 0; k++) {
    for (const s of data.sessionsByDay.get(addDays(day, k)) ?? []) sessions.push({ start: s.startTs, end: s.endTs });
  }
  // A period is covered when the band was worn for at least half of it.
  const covered = Array.from({ length: 7 }, (_, k) => {
    const pm = cached.get(addDays(day, k - 7))?.s1.hrMinutesPm ?? 0;
    const am = cached.get(addDays(day, k - 6))?.s1.hrMinutesAm ?? 0;
    return pm + am >= 720;
  });
  return sleepRegularityIndex(sessions, windowStart, covered);
}

// ── Recovery (forecast filled in by forecastOf, once tonight's plan exists) ──

export function scoreRecovery(f: Fold, d: Day, sleep: SleepRow): RecoveryRow {
  const { dm, mainSession, main } = d;
  const { hrvB, rhrB, respB, skinB } = f;
  const hrv = dm?.hrvMs ?? null;
  // Google's daily resting HR first; Pulse's sleep-session estimate only on days Google has none.
  const rhr = dm?.rhrBpm ?? d.cache.sessionRhr;
  const resp = dm?.respBpm ?? null;
  const skinTempDev = skinDeviation(d, skinB);
  const sleepPerf = sleep.performance != null ? sleep.performance / 100 : main ? main.efficiency : null;
  const stale = (
    [
      ["hrv", hrvB],
      ["rhr", rhrB],
      ["resp", respB],
      ["skinTemp", skinB],
    ] as const
  )
    // Google's skin-temperature baseline never goes stale here: it comes with the night.
    .filter(([k, b]) => b?.status === "stale" && !(k === "skinTemp" && dm?.tempBaselineC != null))
    .map(([k]) => k);
  const rhrUsable = rhrB && isUsable(rhrB) ? rhrB : null;
  const respUsable = respB && isUsable(respB) ? respB : null;
  let reason: ReasonCode | null = null;
  let nightsLeft: number | undefined;
  let value: number | null = null;
  let drivers: ChargeDriver[] = [];
  if (!mainSession) reason = "band_not_worn";
  else if (!mainSession.processed) reason = "awaiting_sleep_sync";
  // A staged hypnogram is not a Recovery input: Google can send a processed night as CLASSIC (no stages) and still
  // send that night's HRV. Only the HRV itself gates the score (spec §7.2: HRV and processed sleep).
  else if (hrv == null) reason = "no_hrv_last_night";
  else {
    const g = hrvB
      ? gatedRecovery({ hrv, rhr, resp, hrvBaseline: hrvB, rhrBaseline: rhrUsable, respBaseline: respUsable, sleepPerf, skinTempDev })
      : { recovery: null };
    if (g.recovery == null) {
      reason = "calibrating";
      nightsLeft = Math.max(1, minBaselineNights - (hrvB?.nValid ?? 0));
    } else {
      value = g.recovery;
      drivers = chargeDrivers({ hrv, rhr, resp, hrvBaseline: hrvB!, rhrBaseline: rhrUsable, respBaseline: respUsable, sleepPerf, skinTempDev });
    }
  }
  const terms =
    value == null
      ? []
      : [
          "hrv",
          ...(rhrUsable && rhr != null ? ["rhr"] : []),
          ...(respUsable && resp != null ? ["resp"] : []),
          ...(sleepPerf != null ? ["sleep"] : []),
          ...(skinTempDev != null ? ["skinTemp"] : []),
        ];
  const prev = d.cache.recovery;
  const updated = value != null && prev?.value != null && (prev.updated || terms.some((t) => !prev.terms.includes(t)));
  const hrvZ = hrv != null && hrvB && isUsable(hrvB) ? deviation(hrv, hrvB).z : null;
  if (value != null) f.recoveries.push(value);
  return {
    value,
    reason,
    ...(nightsLeft !== undefined && { nightsLeft }),
    provisional: value != null && !isTrusted(hrvB!),
    stale,
    terms,
    updated,
    inputs: { hrv, rhr, resp, sleepPerf, skinTempDev },
    baselines: { hrv: summarize(hrvB), rhr: summarize(rhrB), resp: summarize(respB), skinTemp: summarize(skinB) },
    hrvZ,
    drivers,
    forecast: null,
    forecastNightsLeft: Math.max(0, 14 - f.recoveries.length),
  };
}

/** Last night's skin temperature against Google's baseline (its 30-night median), else Pulse's own causal one. */
function skinDeviation(d: Day, skinB: BaselineState | null): number | null {
  const t = d.dm?.nightlyTempC;
  if (t == null) return null;
  if (d.dm?.tempBaselineC != null) return t - d.dm.tempBaselineC;
  return skinB && isUsable(skinB) ? t - skinB.baseline : null;
}

// ── Training load and readiness (today's strain counts toward today's ACWR) ──

export function scoreTrainingLoad(f: Fold, d: Day, rec: RecoveryRow): TrainingLoadRow {
  const { hrv, rhr, resp } = rec.inputs;
  f.readinessRows.push({ day: d.day, hrv, rhr, resp, effort: d.s1.effort ?? (d.worn ? 0 : null) });
  const { readiness, trainingLoad } = evaluateWithTrainingLoad(f.readinessRows, d.day);
  return {
    acwr: readiness.acwr,
    acwrPrior: f.prevAcwr,
    monotony: readiness.monotony,
    level: readiness.level,
    state: trainingLoad.state,
    contiguousDays: trainingLoad.contiguousDays,
    ctl: trainingLoad.ctl,
    atl: trainingLoad.atl,
    tsb: trainingLoad.tsb,
  };
}

// ── Strain Target: prior days' Effort and ACWR ───────────────────────────────

export const scoreStrainTarget = (f: Fold, rec: RecoveryRow): StrainTargetRow =>
  rec.value == null
    ? { reason: rec.reason!, ...(rec.nightsLeft !== undefined && { nightsLeft: rec.nightsLeft }) }
    : { reason: null, ...strainTarget(f.efforts.slice(), rec.value, f.prevAcwr) };

// ── Sleep Planner (tonight) ──────────────────────────────────────────────────

export function scorePlanner(f: Fold, d: Day, sleep: SleepRow, tz: string) {
  const { day, main } = d;
  if (main) {
    f.wakeNights.push({ day, wakeMin: localMinutes(main.end, tz), efficiency: main.efficiency });
    f.nights.push({ day, hours: main.asleepMin / 60 });
  }
  const tonightNeed = personalizedNeedHours(f.nights.slice(-28).map((n) => n.hours), d.age.whole);
  const plan = sleepPlan({
    baselineNeedHours: tonightNeed,
    effort: d.s1.effort,
    meanEffort28: meanOf(f.efforts.slice(-28)),
    debtMin: sleep.debtMin,
    napMin: d.naps.reduce((a, n) => a + n.asleepMin, 0),
    nights: f.wakeNights,
    wakeDay: addDays(day, 1),
  });
  const row: SleepPlannerRow =
    f.wakeNights.length < minNeedNights
      ? { reason: "calibrating", nightsLeft: minNeedNights - f.wakeNights.length, needMin: plan.needMin }
      : { reason: null, wakeDay: addDays(day, 1), nights: Math.min(f.wakeNights.length, 14), ...plan };
  return { row, plan, tonightNeed };
}

/** Tomorrow's Recovery forecast; needs 14 scored days. */
export const forecastOf = (f: Fold, d: Day, rec: RecoveryRow, plan: SleepPlan, tonightNeed: number) =>
  rec.value != null && f.recoveries.length >= 14
    ? recoveryForecast({
        recentCharge: f.recoveries,
        recentEffort: f.efforts.filter((e): e is number => e != null).slice(-14),
        todayEffort: d.s1.effort,
        plannedSleepHours: plan.needMin / 60,
        needHours: tonightNeed,
        needNights: f.nights.length,
      })
    : null;

// ── Stress (baseline from earlier days' aggregates) ──────────────────────────

export function scoreStress(f: Fold, d: Day, inputs: Inputs) {
  const { start, end } = d;
  const baseline = foldDaytimeBaseline(f.aggregates);
  f.aggregates.push(d.s1.dayAggregate);
  const still = inputs.stillHr.get(d.day) ?? [];
  const st = stress({
    start,
    end,
    hr: still.flatMap((bpm, m) => (bpm == null ? [] : [{ ts: start + m * 60, bpm }])),
    steps: [],
    excluded: [],
    baseline,
  });
  const last = st.minutes.findLastIndex((v) => v != null);
  const row: StressRow = {
    provisional: st.provisional,
    average: st.average,
    lowMin: st.lowMin,
    mediumMin: st.mediumMin,
    highMin: st.highMin,
    latest: last < 0 ? null : { ts: start + last * 60, value: st.minutes[last]! },
    longestHigh: longestRun(st.minutes, (v) => v != null && v >= 2, start),
    referenceHr: st.referenceHr,
  };
  return { row, minutes: st.minutes, series: st.minutes.map((v) => (v == null ? null : round(v, 2))) };
}

function longestRun(xs: (number | null)[], hit: (v: number | null) => boolean, start: number) {
  let best: { start: number; minutes: number } | null = null;
  let runStart = -1;
  for (let m = 0; m <= xs.length; m++) {
    if (m < xs.length && hit(xs[m])) {
      if (runStart < 0) runStart = m;
    } else if (runStart >= 0) {
      if (!best || m - runStart > best.minutes) best = { start: start + runStart * 60, minutes: m - runStart };
      runStart = -1;
    }
  }
  return best;
}

// ── Energy Bank ──────────────────────────────────────────────────────────────

export function scoreEnergyBank(
  data: Data,
  inputs: Inputs,
  d: Day,
  rec: RecoveryRow,
  sleep: SleepRow,
  stressMinutes: (number | null)[],
): { row: EnergyBankRow; curve: (number | null)[] | null } {
  const { day, start, end, main, s1 } = d;
  if (rec.value == null || !main) return { row: { value: null, reason: rec.reason ?? "no_data", provisional: false }, curve: null };
  const tonight = data.mainOf.get(addDays(day, 1));
  const until = tonight && tonight.startTs < end ? tonight.startTs : s1.lastHrTs != null ? Math.min(end, s1.lastHrTs + 60) : end;
  const napIntervals = d.naps.filter((n) => n.start >= main.end).map((n) => ({ start: n.start, end: n.end }));
  const eb = energyBank({
    start,
    wake: main.end,
    until,
    recovery: rec.value,
    sleepPerformance: sleep.performance ?? main.efficiency * 100,
    load: inputs.loadSeries.get(day) ?? [],
    stress: stressMinutes,
    naps: napIntervals,
    workouts: (data.exercisesByDay.get(day) ?? []).map((e) => ({ start: e.startTs, end: e.endTs, label: e.name ?? "Workout" })),
  });
  // Recharge earned (calm still minutes at k3, nap minutes at k4); everything else is drain.
  // ponytail: nominal amounts, before the engine's 0–100 clamp; exact unless the bank hits a bound.
  let charged = 0;
  for (let m = 0; m < eb.curve.length; m++) {
    if (eb.curve[m] == null) continue;
    const ts = start + m * 60;
    if (napIntervals.some((n) => ts < n.end && ts + 60 > n.start)) charged += energyBankConfig.k4;
    else if (stressMinutes[m] != null && stressMinutes[m]! < 1) charged += energyBankConfig.k3;
  }
  const drained = eb.current - eb.startLevel - charged;
  return {
    row: {
      value: eb.current,
      reason: null,
      provisional: rec.provisional,
      startLevel: eb.startLevel,
      wake: main.end,
      until,
      charged,
      drained,
      topDrains: eb.topDrains,
      naps: napIntervals,
    },
    curve: eb.curve.map(r1),
  };
}

// ── Health Monitor (nightly rows, oldest first) ──────────────────────────────

export function scoreHealthMonitor(f: Fold, d: Day, inputs: Inputs, rec: RecoveryRow): HealthMonitorRow {
  const { hrv, rhr, resp, skinTempDev } = rec.inputs;
  const spo2 = d.dm?.spo2Pct ?? null;
  f.monitorRows.push({ day: d.day, rhr, hrv, resp, spo2, skinTempDev });
  const hasVitals = rhr != null || hrv != null || resp != null || d.dm?.spo2Pct != null || skinTempDev != null;
  const yesterday = addDays(d.day, -1);
  return !hasVitals
    ? { reason: d.mainSession ? "no_data" : "band_not_worn" }
    : {
        reason: null,
        stale: rec.stale,
        ...healthMonitor(f.monitorRows, {
          alcohol: inputs.tagOn(yesterday, "alcohol"),
          sauna: inputs.tagOn(yesterday, "sauna"),
          travelPhaseJump: inputs.tagOn(yesterday, "travel"),
          alreadyUnwell: inputs.tagOn(yesterday, "illness"),
        }, googleRanges(d)),
      };
}

/**
 * Google's ranges for last night: resting HR and HRV from its personal-range roll-ups, skin temperature as
 * ± 2 of its 30-night SD around the baseline (the deviation's zero). A vital without one keeps Pulse's.
 */
function googleRanges(d: Day): Partial<Record<VitalKey, { low: number; high: number }>> {
  const m = d.dm;
  const out: Partial<Record<VitalKey, { low: number; high: number }>> = {};
  if (m?.rhrRangeLow != null && m.rhrRangeHigh != null) out.restingHr = { low: m.rhrRangeLow, high: m.rhrRangeHigh };
  if (m?.hrvRangeLow != null && m.hrvRangeHigh != null) out.hrv = { low: m.hrvRangeLow, high: m.hrvRangeHigh };
  if (m?.tempBaselineC != null && m.tempSdC != null && m.tempSdC > 0) {
    const half = healthMonitorConfig.rangeSigmas * m.tempSdC;
    out.skinTempDev = { low: -half, high: half };
  }
  return out;
}

// ── Healthspan ───────────────────────────────────────────────────────────────

export function scoreHealthspan(data: Data, f: Fold, d: Day, sleep: SleepRow, opts: PipelineOptions): HealthspanRow {
  const { day, dm, main, worn, s1 } = d;
  const strengthMin = (data.exercisesByDay.get(day) ?? [])
    .filter((e) => STRENGTH_TYPES.test(e.type))
    .reduce((a, e) => a + (e.endTs - e.startTs) / 60, 0);
  f.hsRows.push({
    day,
    sleepHours: main ? main.asleepMin / 60 : null,
    sri: sleep.sri,
    // Time in Pulse's own zones (heart-rate reserve, as Strain and the zone charts count them): zones 1-3, zones 4-5.
    zone13Min: worn ? (s1.zoneSeconds[0] + s1.zoneSeconds[1] + s1.zoneSeconds[2]) / 60 : null,
    zone45Min: worn ? (s1.zoneSeconds[3] + s1.zoneSeconds[4]) / 60 : null,
    strengthMin: worn ? strengthMin : null,
    steps: dm?.steps ?? null,
    vo2maxRun: dm?.vo2maxRun ?? null,
    vo2maxDaily: dm?.vo2maxDaily ?? null,
    restingHr: dm?.rhrBpm ?? null,
    weightKg: dm?.weightKg ?? null,
    bodyFatPct: dm?.bodyFatPct ?? null,
  });
  const hs = healthspan(f.hsRows, { age: d.age.years, sex: opts.profile.sex, heightCm: opts.profile.heightCm ?? null }, day);
  return hs
    ? { reason: null, age: d.age.years, ...hs }
    : { reason: "calibrating", dataDays: f.hsRows.filter((r) => Object.entries(r).some(([k, v]) => k !== "day" && v != null)).length };
}

// ── Fitness level: latest run VO2max in 90 days, else the latest daily value ──

export function scoreFitness(f: Fold, d: Day, opts: PipelineOptions): FitnessRow {
  const age = d.age.years;
  const cutoff = addDays(d.day, -89);
  const run = f.hsRows.findLast((r) => r.vo2maxRun != null && r.day >= cutoff);
  const daily = f.hsRows.findLast((r) => r.vo2maxDaily != null);
  const pick = run
    ? { v: run.vo2maxRun!, source: "run" as const, sourceDay: run.day }
    : daily
      ? { v: daily.vo2maxDaily!, source: "daily" as const, sourceDay: daily.day }
      : null;
  if (!pick) return { reason: "no_data" };
  return { reason: null, vo2max: pick.v, source: pick.source, sourceDay: pick.sourceDay, age, ...fitnessLevel(pick.v, age, opts.profile.sex) };
}

// ── Journal outcomes and the reports' day rows ───────────────────────────────

export function recordOutcomes(f: Fold, d: Day, rec: RecoveryRow, sleep: SleepRow, tl: TrainingLoadRow) {
  const { day, main, s1, dm } = d;
  f.outcomes.push({ day, recovery: rec.value, hrvZ: rec.hrvZ, sleepPerf: sleep.performance });
  f.reportRows.push({
    day,
    recovery: rec.value,
    strain: s1.effort == null ? null : toStrainScale(s1.effort),
    sleepPerf: sleep.performance,
    sleepHours: main ? (main.asleepMin + d.naps.reduce((a, n) => a + n.asleepMin, 0)) / 60 : null,
    hrv: rec.inputs.hrv,
    rhr: rec.inputs.rhr ?? dm?.rhrBpm ?? null,
    acwr: tl.acwr,
    sleepConsistency: sleep.consistency,
  });
}
