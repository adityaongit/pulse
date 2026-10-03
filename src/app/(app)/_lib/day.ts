import { redirect } from "next/navigation"
import { parseDay, parseRange, todayIn } from "@/lib/url"
import { getConfig } from "@/server/config"

export type SearchParams = Promise<Record<string, string | string[] | undefined>>

/**
 * The page's day from `?d=` (spec §7): missing → today; future or unparsable → today, with the URL
 * replaced without `d` (other params kept).
 */
export async function pageDay(searchParams: SearchParams, path: string) {
  const sp = await searchParams
  const { timeZone } = getConfig()
  const today = todayIn(timeZone)
  const { d, rejected } = parseDay(sp.d, today)
  if (rejected) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (k !== "d" && typeof v === "string") q.set(k, v)
    redirect(q.size ? `${path}?${q}` : path)
  }
  // The trend card is WHOOP's "Weekly trends" while the range is W [latest-recovery-weekly-1].
  return { d, today, timeZone, weekly: parseRange(sp.r) === "w" }
}
