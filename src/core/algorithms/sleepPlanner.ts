// Own algorithm (docs/algorithms/sleep-planner.md): tonight's sleep need (noop's personalised need, plus a
// strain adjustment and part of the debt, minus today's naps) and the bedtimes that reach 100 %, 85 % and
// 70 % of it before the typical wake time.
import { toWhoopStrain } from "../scoring/strain";

export const sleepPlannerConfig = {
  /** Hours of extra need per Day Strain point (0–21) above the 28-day mean (*tunable*). */
  hoursPerStrainPoint: 0.05,
  /** Share of the current debt to repay tonight (*tunable*). */
  debtRepayShare: 0.2,
  /** Nights behind the typical wake time and efficiency (spec). */
  windowNights: 14,
  /** Efficiency when no night has one (*tunable*). */
  defaultEfficiency: 0.9,
  /** Shares of need to plan bedtimes for (spec). */
  shares: [1, 0.85, 0.7],
};

export interface WakeNight {
  /** yyyy-MM-dd of the wake day. */
  day: string;
  /** Local wake time, minutes after midnight. */
  wakeMin: number;
  /** Asleep / in bed, 0–1, or null. */
  efficiency: number | null;
}

export interface SleepPlannerInput {
  /** personalizedNeedHours for tonight. */
  baselineNeedHours: number;
  /** Today's Effort, 0–100. */
  effort: number | null;
  /** Mean daily Effort over the prior 28 days, 0–100, or null. */
  meanEffort28: number | null;
  /** ledger(...).magnitudeMin as of this morning. */
  debtMin: number;
  /** Minutes asleep in today's naps. */
  napMin: number;
  /** Recent main sleeps, oldest first; the last `windowNights` are used. */
  nights: WakeNight[];
  /** yyyy-MM-dd of tomorrow, the wake day being planned for. */
  wakeDay: string;
}

export interface BedtimePlan {
  /** 1, 0.85 or 0.7. */
  share: number;
  /** Minutes asleep the plan delivers. */
  sleepMin: number;
  /** Minutes in bed: sleepMin ÷ efficiency. */
  inBedMin: number;
  /** Minutes from the wake day's local midnight; negative is the evening before (−90 is 22:30). */
  bedtimeMin: number;
}

export interface SleepPlan {
  needMin: number;
  parts: { baselineMin: number; strainMin: number; debtMin: number; napMin: number };
  /** Typical wake time for `wakeDay`, minutes after local midnight; null without nights. */
  wakeMin: number | null;
  weekend: boolean;
  efficiency: number;
  /** 100 % first (earliest bedtime). Empty when wakeMin is null. */
  plans: BedtimePlan[];
}

/** Saturday or Sunday. */
export const isWeekendDay = (day: string): boolean => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function sleepPlan(input: SleepPlannerInput): SleepPlan {
  const c = sleepPlannerConfig;
  const strainAbove =
    input.effort != null && input.meanEffort28 != null ? Math.max(0, toWhoopStrain(input.effort) - toWhoopStrain(input.meanEffort28)) : 0;
  const parts = {
    baselineMin: input.baselineNeedHours * 60,
    strainMin: strainAbove * c.hoursPerStrainPoint * 60,
    debtMin: Math.max(0, input.debtMin) * c.debtRepayShare,
    napMin: Math.max(0, input.napMin),
  };
  const needMin = Math.max(0, parts.baselineMin + parts.strainMin + parts.debtMin - parts.napMin);

  const recent = input.nights.slice(-c.windowNights);
  const weekend = isWeekendDay(input.wakeDay);
  const sameKind = recent.filter((n) => isWeekendDay(n.day) === weekend);
  // No night of tomorrow's kind yet: fall back to every recent night.
  const wakeMin = median((sameKind.length ? sameKind : recent).map((n) => n.wakeMin));
  const efficiency = median(recent.flatMap((n) => (n.efficiency != null && n.efficiency > 0 ? [n.efficiency] : []))) ?? c.defaultEfficiency;

  const plans =
    wakeMin == null
      ? []
      : c.shares.map((share) => {
          const sleepMin = share * needMin;
          const inBedMin = sleepMin / efficiency;
          return { share, sleepMin, inBedMin, bedtimeMin: wakeMin - inBedMin };
        });
  return { needMin, parts, wakeMin, weekend, efficiency, plans };
}
