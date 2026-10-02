import { DayStripSkeleton } from "@/components/metrics/DayStrip"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { PageShell } from "@/components/shells/PageShell"
import { Skeleton } from "@/components/ui/skeleton"

/** Journal: strip, check-in card and teaser, history rows (spec §7.11). */
export default function Loading() {
  return (
    <PageShell title="Journal" dateSwitcher={{ mode: "day" }}>
      <div aria-busy className="-mx-4 md:mx-0">
        <DayStripSkeleton />
      </div>
      <div className="grid gap-8 xl:grid-cols-2 xl:gap-4">
        <Skeleton className="h-40 rounded-xl" />
        <InsightCardSkeleton />
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </PageShell>
  )
}
