import type { ImpactMetric, TagImpact } from "@/core/algorithms/journalImpact";
import type { JournalImpactRow } from "../pipeline";
import { addDays } from "../time";
import { defaultCtx, finite, loadDays, meanSd, type QueryCtx, todayOf } from "./common";
import type { BehavioursVM, ImpactMetricKey, JournalInsightsVM, JournalTag, JournalVM } from "./types";

const GROUP: Record<string, JournalTag["group"]> = {
  alcohol: "evening",
  late_caffeine: "evening",
  late_meal: "evening",
  screen_in_bed: "evening",
  meditation: "recovery",
  stretching: "recovery",
  sauna: "recovery",
  travel: "context",
  illness: "context",
};

/** Every tag, hidden ones included, in check-in order (position inside a group, then insertion order). */
function tagsOf(ctx: QueryCtx): JournalTag[] {
  const rows = ctx.db.$client.prepare("select tag, label, is_default isDefault, hidden from journal_tags order by position, rowid").all() as {
    tag: string;
    label: string;
    isDefault: number;
    hidden: number;
  }[];
  return rows.map((r) => ({ tag: r.tag, label: r.label, isDefault: !!r.isDefault, hidden: !!r.hidden, group: GROUP[r.tag] ?? "custom" }));
}

/** More › Behaviours: every tag, hidden ones included, with how many days answered it. */
export function getBehaviours(ctx: QueryCtx = defaultCtx()): BehavioursVM {
  const counts = new Map(
    (ctx.db.$client.prepare("select tag, count(*) n from journal_entries group by tag").all() as { tag: string; n: number }[]).map((r) => [r.tag, r.n]),
  );
  return { tags: tagsOf(ctx).map((t) => ({ ...t, answers: counts.get(t.tag) ?? 0 })) };
}

function entriesBetween(ctx: QueryCtx, from: string, to: string) {
  return ctx.db.$client.prepare("select day, tag, value from journal_entries where day >= ? and day <= ? order by day, tag").all(from, to) as {
    day: string;
    tag: string;
    value: number;
  }[];
}

/** The newest stored journal impact on or before today. */
function latestImpact(ctx: QueryCtx): { asOf: string; impacts: TagImpact[] } | null {
  const r = ctx.db.$client
    .prepare("select day, journal_impact from daily_scores where day <= ? and journal_impact is not null order by day desc limit 1")
    .get(todayOf(ctx)) as { day: string; journal_impact: string } | undefined;
  return r ? { asOf: r.day, impacts: (JSON.parse(r.journal_impact) as JournalImpactRow).impacts } : null;
}

/** Journal `/journal` for `day` (spec §7.11). */
export function getJournal(day: string, ctx: QueryCtx = defaultCtx()): JournalVM {
  const today = todayOf(ctx);
  const stripStart = day < addDays(today, -29) ? day : addDays(today, -29);
  const tags = tagsOf(ctx);
  const label = new Map(tags.map((t) => [t.tag, t.label]));
  const entries = entriesBetween(ctx, stripStart, today);
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  const strip: JournalVM["strip"] = [];
  for (let d = stripStart; d <= today; d = addDays(d, 1)) strip.push({ day: d, done: byDay.has(d) });
  const mine = byDay.get(day) ?? [];
  const yesOf = (es: typeof entries) => es.filter((e) => e.value > 0).map((e) => ({ tag: e.tag, label: label.get(e.tag) ?? e.tag }));

  const impact = latestImpact(ctx);
  const strongest = impact?.impacts.find((t) => t.effects.recovery.label === "positive" || t.effects.recovery.label === "negative");
  const teaser = strongest
    ? {
        ready: true,
        text: `Your strongest effect so far: ${(label.get(strongest.tag) ?? strongest.tag).toLowerCase()} ${strongest.effects.recovery.delta! < 0 ? "lowers" : "raises"} next-day Recovery by ${Math.abs(Math.round(strongest.effects.recovery.delta!))}%.`,
      }
    : { ready: false, text: "Insights appear after 5 days with and 5 without a behaviour." };

  const history: JournalVM["history"] = [];
  for (let d = today; d >= addDays(today, -29); d = addDays(d, -1)) {
    const es = byDay.get(d);
    if (es) history.push({ day: d, yes: yesOf(es).map((y) => y.label) });
  }

  return {
    day,
    today,
    strip,
    // Hidden behaviours leave the check-in sheet; their answers stay, still label History and still count in insights.
    tags: tags.filter((t) => !t.hidden),
    checkIn: { done: mine.length > 0, entries: Object.fromEntries(mine.map((e) => [e.tag, e.value])), yes: yesOf(mine) },
    teaser,
    history,
  };
}

const METRIC: Record<ImpactMetricKey, ImpactMetric> = { recovery: "recovery", hrv: "hrvZ", sleep: "sleepPerf" };

/** Journal Insights `/journal/insights?m=` (spec §7.12): effects on next-day Recovery, HRV (SD) or sleep. */
export function getJournalInsights(metric: ImpactMetricKey = "recovery", ctx: QueryCtx = defaultCtx()): JournalInsightsVM {
  const key = METRIC[metric];
  const unit = metric === "hrv" ? "SD" : "%";
  const impact = latestImpact(ctx);
  if (!impact) return { metric, unit, items: [], needsMore: [] };
  const label = new Map(tagsOf(ctx).map((t) => [t.tag, t.label]));
  const from = addDays(impact.asOf, -90);
  const entries = entriesBetween(ctx, from, addDays(impact.asOf, -1));
  const rows = loadDays(ctx, addDays(from, 1), impact.asOf);
  const outcome = (day: string) => {
    const r = rows.get(day);
    return key === "recovery" ? r?.recovery?.value : key === "hrvZ" ? r?.recovery?.hrvZ : r?.sleep?.performance;
  };
  const arms = (tag: string) => {
    const yes: (number | null | undefined)[] = [];
    const no: (number | null | undefined)[] = [];
    for (const e of entries) if (e.tag === tag) (e.value > 0 ? yes : no).push(outcome(addDays(e.day, 1)));
    return { avgWith: meanSd(yes.filter(finite)).mean, avgWithout: meanSd(no.filter(finite)).mean };
  };

  const items: JournalInsightsVM["items"] = [];
  const needsMore: JournalInsightsVM["needsMore"] = [];
  for (const t of impact.impacts) {
    const e = t.effects[key];
    const name = label.get(t.tag) ?? t.tag;
    if (e.label === "not_enough_data" || e.delta == null) {
      needsMore.push({ key: t.tag, label: name, yes: e.nYes, no: e.nNo });
      continue;
    }
    items.push({
      key: t.tag,
      label: name,
      delta: e.delta,
      effect: e.label === "positive" ? "positive" : e.label === "negative" ? "negative" : "none",
      yes: e.nYes,
      no: e.nNo,
      ci: [e.ciLow!, e.ciHigh!],
      ...arms(t.tag),
    });
  }
  items.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
  return { metric, unit, items, needsMore };
}
