import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { CAPTION, LABEL } from "@/components/metrics/primitives"
import { TickScaleSkeleton } from "@/components/metrics/TickScale"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

/**
 * Fitness loading (spec §7.10, §5.19): no date row; the VO2 max hero with Percentile beside it on laptop, the VO2 max
 * trend, then Training load beside Fitness, fatigue and form.
 */
export default function Loading() {
  return (
    <DetailShell
      title="Fitness"
      hero={
        <div aria-hidden className="flex flex-col items-center gap-2 py-4 text-center">
          <SkeletonText className="w-[4ch] font-numeric text-[64px] leading-none font-bold md:text-[72px]" />
          <p className="flex items-center gap-3">
            <span className={LABEL}>VO2 max</span>
            <SkeletonText className={`${LABEL} w-16`} />
          </p>
          <SkeletonText className={`${CAPTION} w-32`} />
        </div>
      }
      summary={
        <SectionShell variant="card" title="Percentile">
          <div aria-hidden>
            <TickScaleSkeleton variant="marker" />
            <div className={`${CAPTION} mt-2 grid grid-cols-5 text-center`}>
              {["Poor", "Fair", "Good", "Excellent", "Superior"].map((c) => (
                <span key={c} className="truncate">
                  {c}
                </span>
              ))}
            </div>
            <SkeletonText className={`${CAPTION} mt-3 w-64`} />
          </div>
        </SectionShell>
      }
      primary={
        <SectionShell variant="card" title="VO2 max trend">
          <TrendChartSkeleton />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="load" variant="card" title="Training load">
          <div aria-hidden className="space-y-4">
            <p className="flex items-center gap-3">
              <SkeletonText className="w-[4ch] font-numeric text-4xl leading-10 font-bold" />
              <Skeleton className="h-6 w-20 rounded-md" />
            </p>
            <TickScaleSkeleton variant="marker" />
            <div className="text-[15px] leading-[22px]">
              <SkeletonText className="w-full" />
              <SkeletonText className="w-1/2" />
            </div>
          </div>
        </SectionShell>,
        <SectionShell key="ffs" variant="card" title="Fitness, fatigue and form">
          <div aria-hidden>
            <Skeleton className="h-[220px] rounded-lg bg-muted/60" />
            <p className={`${CAPTION} mt-2`}>Fitness is your 42-day load, fatigue your 7-day load, form the difference.</p>
          </div>
        </SectionShell>,
      ]}
    />
  )
}
