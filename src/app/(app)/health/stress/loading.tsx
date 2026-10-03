import { StressChartSkeleton } from "@/components/charts/StressChart"
import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { ScoreDialSkeleton } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase"

/**
 * Stress Monitor loading (spec §7.9, §5.19): the date row, the gauge with the insight beside it on laptop, the day's
 * chart, then Total day and the 30-day trend side by side on laptop.
 */
export default function Loading() {
  return (
    <DetailShell
      title="Stress Monitor"
      dateSwitcher={{ mode: "day" }}
      hero={<ScoreDialSkeleton variant="gauge" size="lg" />}
      insight={<InsightCardSkeleton />}
      primary={
        <SectionShell variant="card" title="Today">
          <StressChartSkeleton variant="full" />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="levels" variant="card" title="Total day">
          <div aria-hidden className="space-y-4">
            <SkeletonText className={`${LABEL} w-48`} />
            <div className="space-y-1.5">
              <Skeleton className="h-3 rounded-sm" />
              <Skeleton className="h-2 rounded-sm" />
            </div>
            <ul className="grid grid-cols-3 gap-3">
              {["Low", "Medium", "High"].map((w) => (
                <li key={w}>
                  <SkeletonText className="w-[4ch] font-numeric text-xl leading-6 font-bold" />
                  <p className={`${LABEL} mt-1`}>{w}</p>
                  <SkeletonText className="mt-0.5 w-20 text-xs leading-4" />
                </li>
              ))}
            </ul>
            <SkeletonText className="w-56 text-xs leading-4" />
          </div>
        </SectionShell>,
        <SectionShell key="trend" variant="card" title="30-day trend">
          <TrendChartSkeleton />
        </SectionShell>,
      ]}
    />
  )
}
