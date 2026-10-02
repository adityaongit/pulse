import { DayStripSkeleton } from "@/components/metrics/DayStrip"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

/** Journal: strip, check-in card and teaser, history rows, in the page's own boxes (spec §7.11, §5.19). */
export default function Loading() {
  return (
    <PageShell title="Journal" dateSwitcher={{ mode: "day" }}>
      <div aria-busy className="-mx-4 md:mx-0">
        <DayStripSkeleton />
      </div>
      <div className="grid gap-8 xl:grid-cols-2 xl:items-start xl:gap-4">
        <SectionShell variant="card" title="Check-in">
          <div aria-hidden className="flex flex-col gap-4">
            <span className="block text-[15px] leading-[22px]">
              <SkeletonText className="w-full" />
              <SkeletonText className="w-2/3" />
            </span>
            <Skeleton className="h-11 rounded-xl" />
          </div>
        </SectionShell>
        <InsightCardSkeleton />
      </div>
      <SectionShell variant="section" title="History">
        <Card aria-hidden className="gap-0 px-4 py-1 xl:px-5">
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex min-h-13 items-center gap-3 py-2">
                <SkeletonText className="w-24 text-xs leading-4" />
                <Skeleton className="ml-auto h-7 w-24 rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      </SectionShell>
    </PageShell>
  )
}
