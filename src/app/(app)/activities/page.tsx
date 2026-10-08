import Link from "next/link"
import { activityHref } from "@/lib/url"
import { cn } from "@/lib/utils"
import { dayLabel, formatValue, hmm } from "@/lib/format"
import { ActivityCard, type ActivityKind } from "@/components/metrics/ActivityCard"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { GROUP_LABEL, MORE_COLUMN } from "@/components/shells/LinkList"
import { CARD_MATERIAL } from "@/components/ui/card"
import { ACTIVITY_PAGE_DAYS, getActivities } from "@/server/queries/activities"
import { userCtx } from "@/server/queries/common"
import type { ActivitiesVM } from "@/server/queries/types"
import { CAPTION } from "../_lib/view"

export const metadata = { title: "Activities", description: "Every workout, newest first, grouped by day with its Strain." }

const KIND_LABEL: Record<ActivityKind, string> = { run: "Runs", ride: "Rides", walk: "Walks", strength: "Strength", workout: "Workouts" }
const STAT_LABEL = "text-xs leading-4 font-bold tracking-[0.1em] text-foreground-secondary uppercase"
const PILL =
  "relative grid h-9 shrink-0 place-items-center rounded-full px-4 after:absolute after:-inset-y-1 text-xs font-bold tracking-[0.1em] uppercase outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50"

type Query = { days: number; kind: ActivityKind | null }
const href = ({ days, kind }: Query) => {
  const q = new URLSearchParams()
  if (days > ACTIVITY_PAGE_DAYS) q.set("days", String(days))
  if (kind) q.set("kind", kind)
  return q.size ? `/activities?${q}` : "/activities"
}

/**
 * Activities `/activities`: the workout journal behind Home's "Today's activities". Day groups newest first, each row
 * the same timeline row as Home, a sport filter, and "Show older" a month at a time.
 */
export default async function ActivitiesPage({ searchParams }: PageProps<"/activities">) {
  const sp = await searchParams
  const pages = Math.min(120, Math.max(1, Math.round(Number(sp.days) / ACTIVITY_PAGE_DAYS) || 1))
  const days = pages * ACTIVITY_PAGE_DAYS
  const ctx = await userCtx()
  const vm = await getActivities(days, ctx)
  const { timeZone } = ctx
  const kinds = [...new Set(vm.groups.flatMap((g) => g.items.map((a) => a.activityKind)))]
  const kind = kinds.find((k) => k === sp.kind) ?? null
  const groups = vm.groups
    .map((g) => (kind ? { ...g, items: g.items.filter((a) => a.activityKind === kind) } : g))
    .filter((g) => g.items.length || (!kind && g.day === vm.today))
  const items = groups.flatMap((g) => g.items)

  return (
    <DetailShell
      title="Activities"
      backHref="/"
      primary={
        <div className={MORE_COLUMN}>
          {items.length > 0 && <Summary items={items} days={days} />}
          {kinds.length > 1 && (
            <nav aria-label="Sport" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
              {[null, ...kinds].map((k) => (
                <Link
                  key={k ?? "all"}
                  href={href({ days, kind: k })}
                  replace
                  scroll={false}
                  aria-current={kind === k ? "page" : undefined}
                  className={cn(PILL, kind === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground")}
                >
                  {k ? KIND_LABEL[k] : "All"}
                </Link>
              ))}
            </nav>
          )}
          {groups.map((g) => (
            <Day key={g.day} g={g} today={vm.today} timeZone={timeZone} />
          ))}
          {!items.length && groups.length <= 1 && !vm.older && (
            <EmptyState body="No workouts in the last month. Workouts you record on your Fitbit or phone appear here after they sync." />
          )}
          {vm.older ? (
            <Link
              href={href({ days: days + ACTIVITY_PAGE_DAYS, kind })}
              replace
              scroll={false}
              className="mx-auto grid h-11 place-items-center rounded-full px-5 text-xs font-bold tracking-[0.1em] text-foreground/85 uppercase outline-none transition-[background-color,color] duration-150 ease-standard hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Show older
            </Link>
          ) : (
            items.length > 0 && <p className={cn(CAPTION, "text-center")}>No older activities</p>
          )}
        </div>
      }
    />
  )
}

/** Count, total time and average activity Strain over what the list shows. */
function Summary({ items, days }: { items: ActivitiesVM["groups"][number]["items"]; days: number }) {
  const minutes = items.reduce((m, a) => m + (a.end - a.start) / 60_000, 0)
  const strains = items.flatMap((a) => (a.strain.value === null ? [] : [a.strain.value]))
  const avg = strains.length ? strains.reduce((a, b) => a + b, 0) / strains.length : null
  const stat = (value: React.ReactNode, label: string) => (
    // Label first in the DOM for the dl, value drawn on top.
    <div className="flex min-w-0 flex-col-reverse gap-1">
      <dt className={STAT_LABEL}>{label}</dt>
      <dd className="font-numeric text-2xl leading-7 font-bold tabular-nums">{value}</dd>
    </div>
  )
  return (
    <section aria-labelledby="summary-title" className="space-y-2">
      <h2 id="summary-title" className={GROUP_LABEL}>
        Last {days} days
      </h2>
      <dl className={cn(CARD_MATERIAL, "grid grid-cols-3 gap-3 p-4")}>
        {stat(items.length, items.length === 1 ? "Activity" : "Activities")}
        {stat(hmm(minutes), "Time")}
        {stat(<span className={avg === null ? "text-muted-foreground" : "text-strain-text"}>{formatValue("decimal1", avg)}</span>, "Avg strain")}
      </dl>
    </section>
  )
}

function Day({ g, today, timeZone }: { g: ActivitiesVM["groups"][number]; today: string; timeZone: string }) {
  const id = `day-${g.day}`
  return (
    <section aria-labelledby={id} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id={id} className={GROUP_LABEL.replace("px-1 ", "")}>
          {dayLabel(g.day, today)}
        </h2>
        <p className="truncate font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">
          {g.steps !== null && <>{formatValue("grouped", g.steps)} steps</>}
          {g.steps !== null && g.dayStrain !== null && " · "}
          {g.dayStrain !== null && (
            <>
              Day strain <span className="font-bold text-strain-text">{formatValue("decimal1", g.dayStrain)}</span>
            </>
          )}
        </p>
      </div>
      {g.items.length ? (
        // 6 px inset in a 16 px card around the rows' 10 px radius, as on Home (spec §2.4).
        <div className={cn(CARD_MATERIAL, "space-y-1.5 p-1.5")}>
          {g.items.map((a) => (
            <ActivityCard key={a.id} name={a.name} kind={a.activityKind} strain={a.strain} start={a.start} end={a.end} distanceKm={a.distanceKm} paceS={a.paceS} href={activityHref(a.id)} timeZone={timeZone} />
          ))}
        </div>
      ) : (
        <p className={cn(CARD_MATERIAL, CAPTION, "px-4 py-4")}>No activities yet today. Workouts appear after Fitbit syncs them.</p>
      )}
    </section>
  )
}
