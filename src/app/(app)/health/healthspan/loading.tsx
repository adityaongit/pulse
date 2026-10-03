import { AGE_LABEL } from "@/lib/format"
import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { ContributorRowSkeleton } from "@/components/metrics/ContributorRow"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { CAPTION } from "@/components/metrics/primitives"
import { TickScaleSkeleton } from "@/components/metrics/TickScale"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { SkeletonText } from "@/components/ui/skeleton"

/** A contributor card: `n` healthspan rows sharing the card's height, as ContributorCard spreads them. */
function Contributors({ title, n, className }: { title: string; n: number; className?: string }) {
  return (
    <SectionShell variant="card" title={title} className={className} fill>
      <div className="flex flex-1 flex-col divide-y divide-border">
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="flex flex-1 flex-col justify-center">
            <ContributorRowSkeleton variant="healthspan" />
          </div>
        ))}
      </div>
    </SectionShell>
  )
}

/**
 * Healthspan loading (spec §7.7, §5.19): the week row, the 300 px orb as its rim with Pace of Aging beside it on laptop,
 * the insight, Pulse Age history, then the Sleep (2), Strain (4, two rows tall on laptop) and Fitness (3) contributors.
 */
export default function Loading() {
  return (
    <DetailShell
      title="Healthspan"
      dateSwitcher={{ mode: "week" }}
      ground="healthspan"
      hero={
        <div aria-hidden className="flex flex-col items-center gap-3">
          <div className="grid size-[300px] place-items-center rounded-full ring-2 ring-dial-track">
            <SkeletonText className="w-[4ch] font-numeric text-[56px] leading-none font-bold" />
          </div>
          <SkeletonText className={`${CAPTION} w-24`} />
        </div>
      }
      summary={
        <SectionShell variant="card" title="Pace of Aging">
          <div aria-hidden>
            <TickScaleSkeleton variant="marker" />
            <SkeletonText className={`${CAPTION} mt-3 w-64`} />
            <SkeletonText className={`${CAPTION} w-24 md:hidden`} />
          </div>
        </SectionShell>
      }
      insight={<InsightCardSkeleton title />}
      primary={
        <SectionShell variant="card" title={`${AGE_LABEL} history`}>
          <TrendChartSkeleton />
        </SectionShell>
      }
      secondary={[
        <Contributors key="sleep" title="Sleep" n={2} />,
        <Contributors key="strain" title="Strain" n={4} className="xl:row-span-2" />,
        <Contributors key="fitness" title="Fitness" n={3} />,
      ]}
    />
  )
}
