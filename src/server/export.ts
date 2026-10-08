// Your data (More): the signed-in user's daily-scores and journal exports behind /export/*. No export ever carries
// oauth_tokens or anything account-level: the files only read the user's own rows of the tables below.
import { asc, eq } from "drizzle-orm";
import { rows as query, sql } from "./db";
import { journalNotes, journalTags } from "./db/schema";
import { firstDay, loadDays, type QueryCtx, todayOf } from "./queries/common";
import { TREND_METRICS } from "./queries/trends";

type Cell = string | number | null;
export type Table = { columns: string[]; rows: Cell[][] };

/** Every day from the first stored day to today: one column per daily metric, rounded as the app shows it. */
export async function dailyTable(ctx: QueryCtx): Promise<Table> {
  const columns = ["day", ...TREND_METRICS.map((m) => m.column)];
  const first = await firstDay(ctx);
  if (!first) return { columns, rows: [] };
  const today = todayOf(ctx);
  const rows: Cell[][] = [];
  for (const [day, r] of await loadDays(ctx, first, today)) {
    const values = TREND_METRICS.map((m) => {
      const v = m.partialToday && day === today ? null : m.pick(r);
      const k = m.format === "decimal2" ? 100 : 10; // distance keeps its 10 m
      return typeof v === "number" && Number.isFinite(v) ? Math.round(v * k) / k : null;
    });
    rows.push([day, ...values]);
  }
  return { columns, rows };
}

/**
 * Journal answers, one row per (day, behaviour): answer 1 for yes (or a count), 0 for no, and the follow-up answer
 * (minutes after midnight or a count) when there is one. Hidden behaviours included.
 */
export async function journalTable(ctx: QueryCtx): Promise<Table> {
  const rows = await query<{ day: string; tag: string; label: string; value: number; detail: number | null }>(
    ctx.db,
    sql`select e.day, e.tag, coalesce(t.label, e.tag) label, e.value, e.detail from journal_entries e
      left join journal_tags t on t.user_id = e.user_id and t.tag = e.tag
      where e.user_id = ${ctx.userId} order by e.day, e.tag`,
  );
  return { columns: ["day", "behaviour", "label", "answer", "follow_up"], rows: rows.map((r) => [r.day, r.tag, r.label, r.value, r.detail]) };
}

/** The journal's notes, one per day, for the journal JSON. */
export async function journalNoteList(ctx: QueryCtx) {
  return ctx.db.select({ day: journalNotes.day, text: journalNotes.text }).from(journalNotes).where(eq(journalNotes.userId, ctx.userId)).orderBy(asc(journalNotes.day));
}

/** The behaviour list itself, for the journal JSON. */
export async function journalBehaviours(ctx: QueryCtx) {
  const tags = await ctx.db
    .select()
    .from(journalTags)
    .where(eq(journalTags.userId, ctx.userId))
    .orderBy(asc(journalTags.position), asc(journalTags.seq));
  return tags.map((t) => ({ tag: t.tag, label: t.label, custom: !t.isDefault, hidden: t.hidden }));
}

/**
 * RFC 4180 CSV. A text cell that starts with = + - @ (a custom behaviour's label is user input) gets a leading
 * apostrophe, so a spreadsheet shows it as text instead of running it as a formula.
 */
export function toCsv({ columns, rows }: Table): string {
  const cell = (v: Cell) => {
    if (v === null) return "";
    if (typeof v === "number") return String(v);
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export const toObjects = ({ columns, rows }: Table) => rows.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i]])));

/** An attachment named "pulse-<what>-<today>.<ext>", never cached. */
export function download(ctx: QueryCtx, what: string, ext: string, type: string, body: BodyInit) {
  return new Response(body, {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="pulse-${what}-${todayOf(ctx)}.${ext}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** `?format=csv|json`; anything else is null (a 400). */
export const formatOf = (req: Request) => {
  const f = new URL(req.url).searchParams.get("format") ?? "csv";
  return f === "csv" || f === "json" ? f : null;
};

export const refuse = (status: 400 | 401 | 403, text: string) => new Response(text, { status, headers: { "cache-control": "no-store" } });

