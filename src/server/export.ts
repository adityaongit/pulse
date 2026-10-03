// Your data (More): the daily-scores and journal exports and the SQLite backup behind /export/*. No export ever
// carries oauth_tokens or the instance row (session secret, owner): the files only read the tables below, and the
// backup deletes both from its copy before it leaves the server.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { Db } from "./db";
import { firstDay, loadDays, type QueryCtx, todayOf } from "./queries/common";
import { TREND_METRICS } from "./queries/trends";

type Cell = string | number | null;
export type Table = { columns: string[]; rows: Cell[][] };

/** Every day from the first stored day to today: one column per daily metric, rounded as the app shows it. */
export function dailyTable(ctx: QueryCtx): Table {
  const columns = ["day", ...TREND_METRICS.map((m) => m.column)];
  const first = firstDay(ctx);
  if (!first) return { columns, rows: [] };
  const today = todayOf(ctx);
  const rows: Cell[][] = [];
  for (const [day, r] of loadDays(ctx, first, today)) {
    const values = TREND_METRICS.map((m) => {
      const v = m.partialToday && day === today ? null : m.pick(r);
      return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
    });
    rows.push([day, ...values]);
  }
  return { columns, rows };
}

/** Journal answers, one row per (day, behaviour): answer 1 for yes (or a count), 0 for no. Hidden behaviours included. */
export function journalTable(ctx: QueryCtx): Table {
  const rows = ctx.db.$client
    .prepare(
      `select e.day, e.tag, coalesce(t.label, e.tag) label, e.value from journal_entries e
       left join journal_tags t on t.tag = e.tag order by e.day, e.tag`,
    )
    .raw()
    .all() as Cell[][];
  return { columns: ["day", "behaviour", "label", "answer"], rows };
}

/** The behaviour list itself, for the journal JSON. */
export function journalBehaviours(ctx: QueryCtx) {
  return (
    ctx.db.$client.prepare("select tag, label, is_default isDefault, hidden from journal_tags order by position, rowid").all() as {
      tag: string;
      label: string;
      isDefault: number;
      hidden: number;
    }[]
  ).map((t) => ({ tag: t.tag, label: t.label, custom: !t.isDefault, hidden: !!t.hidden }));
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

/**
 * A consistent copy of the database in a new temp directory, made with SQLite's online backup API (safe while
 * the worker writes, WAL included), then stripped: the OAuth grant and the instance row (session secret, owner)
 * are deleted with secure_delete on and the file vacuumed, so no page of the copy still holds them. The caller
 * removes the directory.
 */
export async function backupCopy(db: Db): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-backup-"));
  const file = path.join(dir, "pulse.db");
  try {
    await db.$client.backup(file);
    const copy = new Database(file);
    try {
      copy.pragma("journal_mode = DELETE");
      copy.pragma("secure_delete = ON");
      copy.exec("delete from oauth_tokens; delete from instance;");
      copy.exec("vacuum");
    } finally {
      copy.close();
    }
    return file;
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

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

