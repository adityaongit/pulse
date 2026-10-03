import { RANGES } from "@/lib/url"
import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { SkeletonText } from "@/components/ui/skeleton"
import { MetricPicker, PERIOD, TRENDS_GRID } from "./parts"

/** Trends: the real picker, the chart card with its plot and toggle, the Averages rows with their labels (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      title="Trends"
      primary={
        <div aria-hidden className="flex flex-col gap-4 xl:gap-6">
          <MetricPicker />
          <div className={TRENDS_GRID}>
            <SectionShell variant="card" level={2} title={"\u00a0"} aside={<SkeletonText className="w-20 text-xs leading-4" />}>
              <TrendChartSkeleton ranges={RANGES} />
            </SectionShell>
            <SectionShell variant="card" level={2} title="Averages">
              <div className="divide-y divide-border">
                {RANGES.map((r) => (
                  <KeyStatRowSkeleton key={r} variant="row" label={PERIOD[r].label} />
                ))}
              </div>
            </SectionShell>
          </div>
        </div>
      }
    />
  )
}
