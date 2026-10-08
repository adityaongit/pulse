import type { ImpactMetric, TagImpact } from "@/core/algorithms/journalImpact";
import type { JournalImpactRow } from "../pipeline";
import { addDays } from "../time";
import { and, count, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { behavior, questionOf } from "@/lib/behaviors";
import { dailyScores, journalEntries, journalNotes, journalTags } from "../db/schema";
import { finite, loadDays, meanSd, type QueryCtx, todayOf } from "./common";
import type { BehavioursVM, ImpactMetricKey, JournalInsightsVM, JournalTag, JournalVM } from "./types";


/** Every tag, hidden ones included, in check-in order (position inside a group, then insertion order). */
async function tagsOf(ctx: QueryCtx): Promise<JournalTag[]> {
  const t = journalTags;
  const rows = await ctx.db
    .select({ tag: t.tag, label: t.label, isDefault: t.isDefault, hidden: t.hidden })
    .from(t)
    .where(eq(t.userId, ctx.userId))
    .orderBy(t.position, t.seq);
  return rows.map((r) => ({ tag: r.tag, label: r.label, question: questionOf(r.tag, r.label), section: behavior(r.tag)?.section ?? "custom", isDefault: r.isDefault, hidden: r.hidden }));
}

/** More › Behaviours: every tag, hidden ones included, with how many days answered it. */
export async function getBehaviours(ctx: QueryCtx): Promise<BehavioursVM> {
  const j = journalEntries;
  const [tags, n] = await Promise.all([
    tagsOf(ctx),
    ctx.db.select({ tag: j.tag, n: count() }).from(j).where(eq(j.userId, ctx.userId)).groupBy(j.tag),
  ]);
  const counts = new Map(n.map((r) => [r.tag, r.n]));
  return { tags: tags.map((t) => ({ ...t, answers: counts.get(t.tag) ?? 0 })) };
}

function entriesBetween(ctx: QueryCtx, from: string, to: string) {
  const j = journalEntries;
  return ctx.db
    .select({ day: j.day, tag: j.tag, value: j.value, detail: j.detail })
    .from(j)
    .where(and(eq(j.userId, ctx.userId), gte(j.day, from), lte(j.day, to)))
    .orderBy(j.day, j.tag);
}

/** The newest stored journal impact on or before today. */
async function latestImpact(ctx: QueryCtx): Promise<{ asOf: string; impacts: TagImpact[] } | null> {
  const s = dailyScores;
  const [r] = await ctx.db
    .select({ day: s.day, impact: s.journalImpact })
    .from(s)
    .where(and(eq(s.userId, ctx.userId), lte(s.day, todayOf(ctx)), isNotNull(s.journalImpact)))
    .orderBy(desc(s.day))
    .limit(1);
  return r ? { asOf: r.day, impacts: (r.impact as JournalImpactRow).impacts } : null;
}

/** Journal `/journal` for `day` (spec §7.11). */
export async function getJournal(day: string, ctx: QueryCtx): Promise<JournalVM> {
  const today = todayOf(ctx);
  const stripStart = day < addDays(today, -29) ? day : addDays(today, -29);
  const n = journalNotes;
  const [tags, entries, impact, [note]] = await Promise.all([
    tagsOf(ctx),
    entriesBetween(ctx, stripStart, today),
    latestImpact(ctx),
    ctx.db.select({ text: n.text }).from(n).where(and(eq(n.userId, ctx.userId), eq(n.day, day))),
  ]);
  const label = new Map(tags.map((t) => [t.tag, t.label]));
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);

  const strip: JournalVM["strip"] = [];
  for (let d = stripStart; d <= today; d = addDays(d, 1)) strip.push({ day: d, done: byDay.has(d) });
  const mine = byDay.get(day) ?? [];
  const yesOf = (es: typeof entries) => es.filter((e) => e.value > 0).map((e) => ({ tag: e.tag, label: label.get(e.tag) ?? e.tag }));

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
    checkIn: {
      done: mine.length > 0,
      entries: Object.fromEntries(mine.map((e) => [e.tag, e.value])),
      details: Object.fromEntries(mine.flatMap((e) => (e.detail === null ? [] : [[e.tag, e.detail]]))),
      note: note?.text ?? "",
      yes: yesOf(mine),
    },
    teaser,
    history,
  };
}

const METRIC: Record<ImpactMetricKey, ImpactMetric> = { recovery: "recovery", hrv: "hrvZ", sleep: "sleepPerf" };

/** Journal Insights `/journal/insights?m=` (spec §7.12): effects on next-day Recovery, HRV (SD) or sleep. */
export async function getJournalInsights(metric: ImpactMetricKey = "recovery", ctx: QueryCtx): Promise<JournalInsightsVM> {
  const key = METRIC[metric];
  const unit = metric === "hrv" ? "SD" : "%";
  const impact = await latestImpact(ctx);
  if (!impact) return { metric, unit, items: [], needsMore: [] };
  const from = addDays(impact.asOf, -90);
  const [tags, entries, rows] = await Promise.all([tagsOf(ctx), entriesBetween(ctx, from, addDays(impact.asOf, -1)), loadDays(ctx, addDays(from, 1), impact.asOf)]);
  const label = new Map(tags.map((t) => [t.tag, t.label]));
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
