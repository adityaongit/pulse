import Link from "next/link"
import { redirect } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ChevronRight, Sparkles } from "lucide-react"
import { dayLabel } from "@/lib/format"
import { dayHref, parseDay, todayIn } from "@/lib/url"
import { getConfig } from "@/server/config"
import { getJournal } from "@/server/queries/journal"
import { DayStrip } from "@/components/metrics/DayStrip"
import { InsightCard } from "@/components/metrics/InsightCard"
import { EmptyState } from "@/components/shells/EmptyState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { CheckIn, TAG_CLASS } from "./CheckIn"

export const metadata = { title: "Journal" }

/** Journal `/journal?d=` (spec §7.11, journey 7). */
export default async function JournalPage({ searchParams }: PageProps<"/journal">) {
  const today = todayIn(getConfig().timeZone)
  const { d, rejected } = parseDay((await searchParams).d, today)
  if (rejected) redirect("/journal")
  const vm = getJournal(d)
  const date = format(parseISO(d), "EEE, MMM d")

  return (
    <PageShell
      title="Journal"
      dateSwitcher={{ mode: "day" }}
      actions={
        <Button asChild variant="secondary" size="touch">
          <Link href="/journal/insights">
            <Sparkles aria-hidden strokeWidth={1.75} />
            Insights
          </Link>
        </Button>
      }
    >
      {/* Full-bleed on phone: the strip scrolls edge to edge, its first item keeps the 16 px gutter inside. */}
      <div className="-mx-4 md:mx-0">
        <DayStrip indicator="journal" days={vm.strip.map((s) => ({ date: s.day, done: s.done }))} />
      </div>

      {/* Laptop: the day's check-in and the teaser in a sticky left column, History beside it (U18 J-01). The left
          column starts level with History's first row (its 34 px header + 16 px gap). Phone and tablet stay one stack. */}
      <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start xl:gap-x-6">
        <div className="grid gap-8 xl:sticky xl:top-24 xl:gap-4 xl:pt-[50px]">
          <CheckIn key={d} day={d} dayLabel={date} tags={vm.tags} checkIn={vm.checkIn} />
          <InsightCard body={vm.teaser.text} action={vm.teaser.ready ? { label: "See all insights", href: "/journal/insights" } : undefined} />
        </div>

        <SectionShell variant="section" title="History">
          {vm.history.length ? (
            <Card className="gap-0 px-4 py-1 xl:px-5">
              <ul className="divide-y divide-border">
                {vm.history.map((h) => {
                  const shown = h.yes.slice(0, 3)
                  const more = h.yes.length - shown.length
                  return (
                    <li key={h.day}>
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
