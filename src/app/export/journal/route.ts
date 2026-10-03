import type { NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { download, formatOf, journalBehaviours, journalTable, refuse, toCsv, toObjects } from "@/server/export";
import { defaultCtx } from "@/server/queries/common";

/** Journal answers as CSV or JSON (`?format=`); the JSON also lists the behaviours. Session checked here too. */
export async function GET(req: NextRequest) {
  if (!(await requestSession(req))) return refuse(401, "Signed out. Sign in again.");
  const format = formatOf(req);
  if (!format) return refuse(400, "format must be csv or json");
  const ctx = defaultCtx();
  const table = journalTable(ctx);
  return format === "csv"
    ? download(ctx, "journal", "csv", "text/csv; charset=utf-8", toCsv(table))
    : download(ctx, "journal", "json", "application/json", JSON.stringify({ behaviours: journalBehaviours(ctx), entries: toObjects(table) }, null, 2));
}
