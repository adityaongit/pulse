import type { NextRequest } from "next/server";
import { requestSession } from "@/server/auth";
import { dailyTable, download, formatOf, refuse, toCsv, toObjects } from "@/server/export";
import { defaultCtx } from "@/server/queries/common";

/**
 * Daily scores as CSV or JSON (`?format=`). Extension-less, so the sign-in proxy gates it; the handler checks the
 * session again itself.
 */
export async function GET(req: NextRequest) {
  if (!(await requestSession(req))) return refuse(401, "Signed out. Sign in again.");
  const format = formatOf(req);
  if (!format) return refuse(400, "format must be csv or json");
  const ctx = defaultCtx();
  const table = dailyTable(ctx);
  return format === "csv"
    ? download(ctx, "daily", "csv", "text/csv; charset=utf-8", toCsv(table))
    : download(ctx, "daily", "json", "application/json", JSON.stringify({ timeZone: ctx.timeZone, days: toObjects(table) }, null, 2));
}
