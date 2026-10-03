import { ChevronRight } from "lucide-react"
import { ZoneBarsSkeleton } from "@/components/charts/ZoneBars"
import { DriverListSkeleton } from "@/components/metrics/DriverList"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { CAPTION, LABEL } from "@/components/metrics/primitives"
import { ScoreDialSkeleton } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

const DIALS = [
  ["sleep", "Avg sleep"],
  ["recovery", "Avg recovery"],
  ["strain", "Avg strain"],
] as const
const AVERAGES = ["Recovery", "Day strain", "Sleep performance", "Hours of sleep", "Sleep consistency", "Heart rate variability", "Resting heart rate"]

/**
 * Report loading (spec §7.13, §5.19): the period switcher, kind toggle and three dials, the insight beside them on
 * laptop, Recovery breakdown, then Averages (two rows tall on laptop) beside Training balance and Best and worst day,
 * and Top journal effects across the row. Loading UI gets no params, so the title cannot say week or month.
 */
export default function Loading() {
  return (
    <DetailShell
      title="Report"
      hero={
        <div aria-hidden className="flex flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-9 w-[168px] rounded-full bg-secondary" />
            <div className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
              {["Week", "Month"].map((l) => (
                <span key={l} className="inline-flex h-10 min-w-11 items-center px-3 text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase">
                  {l}
                </span>
              ))}
            </div>
          </div>
          <div className="flex w-full items-start justify-center gap-5 sm:gap-8">
            {DIALS.map(([k, l]) => (
              <div key={k} className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5">
                <ScoreDialSkeleton variant={k} size="md" label={l} />
                <SkeletonText className={`${CAPTION} w-20`} />
              </div>
            ))}
          </div>
        </div>
      }
      insight={<InsightCardSkeleton />}
      primary={
        <SectionShell variant="card" title="Recovery breakdown" aside={<span className={CAPTION}>Days</span>}>
          <ZoneBarsSkeleton variant="stacked" />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="avg" variant="card" title="Averages" className="xl:row-span-2" aside={<SkeletonText className={`${CAPTION} w-20`} />}>
          <div aria-hidden className="divide-y divide-border">
            {AVERAGES.map((l) => (
              <KeyStatRowSkeleton key={l} variant="row" label={l} />
            ))}
          </div>
        </SectionShell>,
        <SectionShell key="balance" variant="card" title="Training balance">
          <div aria-hidden className="space-y-1">
            <SkeletonText className="w-24 font-numeric text-xl leading-6 font-bold" />
            <SkeletonText className={`${CAPTION} w-36`} />
            <div className="pt-2">
              <SkeletonText className="w-56 text-[15px] leading-[22px]" />
              <SkeletonText className="w-24 text-[15px] leading-[22px] md:hidden" />
            </div>
          </div>
        </SectionShell>,
        <SectionShell key="journal" variant="card" title="Top journal effects" className="xl:col-span-2" action={{ label: "View all", href: "/journal/insights" }}>
          <DriverListSkeleton />
        </SectionShell>,
        <SectionShell key="best" variant="card" title="Best and worst day">
          <ul aria-hidden className="divide-y divide-border">
            {["Best day", "Worst day"].map((l) => (
              <li key={l} className="flex min-h-16 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className={`${LABEL} block`}>{l}</span>
                  <SkeletonText className={`${CAPTION} mt-1 w-20`} />
                </span>
                <ScoreDialSkeleton variant="recovery" size="sm" />
                <span className="w-12">
                  <SkeletonText className="ml-auto w-[3ch] font-numeric text-xl leading-6 font-bold" />
                  <span className={`${CAPTION} block text-right`}>Strain</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              </li>
            ))}
          </ul>
        </SectionShell>,
      ]}
    />
  )
}
