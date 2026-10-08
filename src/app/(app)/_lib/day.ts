import { redirect } from "next/navigation"
import { parseDay } from "@/lib/url"
import { todayOf, userCtx } from "@/server/queries/common"

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * The page's day from `?d=` (spec §7) in the signed-in user's time zone, with their query context: missing → today;
 * future or unparsable → today, with the URL replaced without `d` (other params kept).
 */
export async function pageDay(searchParams: SearchParams, path: string) {
  const [sp, ctx] = await Promise.all([searchParams, userCtx()])
  const today = todayOf(ctx)
  const { d, rejected } = parseDay(sp.d, today)
  if (rejected) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (k !== "d" && typeof v === "string") q.set(k, v)
    redirect(q.size ? `${path}?${q}` : path)
  }
  return { d, today, timeZone: ctx.timeZone, ctx }
}
