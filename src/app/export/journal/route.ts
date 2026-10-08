import type { NextRequest } from "next/server";
import { requestUser } from "@/server/auth";
import { getDb } from "@/server/db";
import { download, formatOf, journalBehaviours, journalNoteList, journalTable, refuse, toCsv, toObjects } from "@/server/export";
import { ctxOf } from "@/server/queries/common";

/** The signed-in user's journal answers as CSV or JSON (`?format=`); the JSON also lists the behaviours and the notes. */
export async function GET(req: NextRequest) {
  const user = await requestUser(req);
  if (!user) return refuse(401, "Signed out. Sign in again.");
  const format = formatOf(req);
  if (!format) return refuse(400, "format must be csv or json");
  const ctx = await ctxOf(getDb(), user.userId);
  const [table, behaviours, notes] = await Promise.all([journalTable(ctx), journalBehaviours(ctx), journalNoteList(ctx)]);
  return format === "csv"
    ? download(ctx, "journal", "csv", "text/csv; charset=utf-8", toCsv(table))
    : download(ctx, "journal", "json", "application/json", JSON.stringify({ behaviours, entries: toObjects(table), notes }, null, 2));
}
