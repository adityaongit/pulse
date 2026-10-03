import Link from "next/link"
import { format, parseISO } from "date-fns"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { dayLabel } from "@/lib/format"
import { dayHref } from "@/lib/url"
import { getJournal } from "@/server/queries/journal"
import { DayStrip } from "@/components/metrics/DayStrip"
import { InsightCard } from "@/components/metrics/InsightCard"
import { EmptyState } from "@/components/shells/EmptyState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { CheckIn, TAG_CLASS } from "./CheckIn"
import { pageDay, type SearchParams } from "../_lib/day"

export const metadata = { title: "Journal" }

/** Journal `/journal?d=` (spec §7.11, journey 7). */
export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const { d, today } = await pageDay(searchParams as SearchParams, "/journal")
  const vm = getJournal(d)
  const date = format(parseISO(d), "EEE, MMM d")

  return (
    <PageShell title="Journal" dateSwitcher={{ mode: "day" }}>
      {/* Full-bleed on phone: the strip scrolls edge to edge, its first tile keeps the 16 px gutter inside. From 768 px
          the tiles sit on the column's edges; the 4 px inset only leaves room for the focus ring, which the viewport clips (SYM2). */}
      <div className="-mx-4 md:-mx-1">
        <DayStrip indicator="journal" days={vm.strip.map((s) => ({ date: s.day, done: s.done }))} />
      </div>

      {/* Phone: check-in, insights, history, top to bottom. From 1280 px the day's work (check-in over history) takes the
          wide column and Insights rides beside it, pinned, at its own height: stretching it to the check-in's height left
          an empty bordered box. */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start xl:gap-x-6 xl:gap-y-10">
        <SectionShell variant="section" title="Check-in" className="xl:col-start-1">
          <CheckIn key={d} day={d} dayLabel={date} tags={vm.tags} checkIn={vm.checkIn} />
        </SectionShell>

        <SectionShell
          variant="section"
          title="Insights"
          action={{ label: "See all", href: "/journal/insights" }}
          className="xl:sticky xl:top-24 xl:col-start-2 xl:row-span-2 xl:row-start-1"
        >
          <InsightCard body={vm.teaser.text} action={vm.teaser.ready ? { label: "See all insights", href: "/journal/insights" } : undefined} />
        </SectionShell>

        <SectionShell variant="section" title="History" className="xl:col-start-1">
          {vm.history.length ? (
            <Card className="gap-0 px-4 py-1 xl:px-5">
              {/* One column everywhere: on laptop it sits in the main column (about 620 px), so rows stay short (U18 J-01). */}
              <ul>
                {vm.history.map((h, i) => {
                  const shown = h.yes.slice(0, 3)
                  const more = h.yes.length - shown.length
                  return (
                    <li key={h.day} className={cn(i > 0 && "border-t border-border")}>
                      <Link
                        href={dayHref("/journal", h.day, today)}
                        aria-current={h.day === d ? "date" : undefined}
                        aria-label={`${dayLabel(h.day, today)}: ${h.yes.length ? h.yes.join(", ") : "no behaviours"}`}
                        className="-mx-2 flex min-h-13 items-center gap-3 rounded-lg px-2 py-2 transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent aria-[current=date]:bg-accent/60"
                      >
                        <span className="w-28 shrink-0 text-xs leading-4 font-bold tracking-[0.08em] uppercase tabular-nums">{dayLabel(h.day, today)}</span>
                        <span aria-hidden className="flex min-w-0 flex-1 flex-wrap justify-end gap-1.5">
                          {shown.map((y) => (
                            <Badge key={y} variant="secondary" className={TAG_CLASS}>
                              {y}
                            </Badge>
                          ))}
                          {more > 0 && <span className="self-center font-numeric text-[13px] font-semibold text-muted-foreground tabular-nums">+{more}</span>}
                          {!h.yes.length && <span className="self-center text-xs leading-4 font-medium text-muted-foreground">None</span>}
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Card>
          ) : (
            <EmptyState
              body="No check-ins yet. Your first one takes under a minute."
              action={{
                label: "Check in",
                href: `${dayHref("/journal", d, today)}${d === today ? "?" : "&"}checkin=1`,
              }}
            />
          )}
        </SectionShell>
      </div>
    </PageShell>
  )
}
