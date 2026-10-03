import { ChevronRight } from "lucide-react"
import { DayStripSkeleton } from "@/components/metrics/DayStrip"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

/**
 * Journal (spec §7.11, §5.19): strip, then Check-in, Insights, History on phone; from 1280 px Check-in over History in
 * the 7fr column and Insights beside them in the 5fr column, as the page lays them out. History shows a screenful of rows.
 */
export default function Loading() {
  return (
    <PageShell title="Journal" dateSwitcher={{ mode: "day" }}>
      <div aria-busy className="-mx-4 md:-mx-1">
        <DayStripSkeleton indicator="journal" />
      </div>
      <div aria-hidden className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-start xl:gap-x-6 xl:gap-y-10">
        <SectionShell variant="section" title="Check-in" className="xl:col-start-1">
          <SectionShell variant="card" title="Check-in">
            <div className="flex flex-col gap-4">
              <span className="block text-[15px] leading-[22px]">
                <SkeletonText className="w-full" />
                <SkeletonText className="w-2/3 xl:hidden" />
              </span>
              <Skeleton className="h-11 rounded-xl" />
            </div>
          </SectionShell>
        </SectionShell>
        <SectionShell variant="section" title="Insights"
          action={<span className="text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase">See all</span>}
          className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <InsightCardSkeleton action />
        </SectionShell>
        <SectionShell variant="section" title="History" className="xl:col-start-1">
          <Card className="gap-0 px-4 py-1 xl:px-5">
            <ul className="divide-y divide-border">
              {Array.from({ length: 12 }, (_, i) => (
                <li key={i} className="flex min-h-13 items-center gap-3 py-2">
                  <SkeletonText className="w-24 text-xs leading-4" />
                  <Skeleton className="ml-auto h-6 w-20 rounded-full" />
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                </li>
              ))}
            </ul>
          </Card>
        </SectionShell>
      </div>
    </PageShell>
  )
}
