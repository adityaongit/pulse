import { trendHref } from "@/lib/url"
import { Skeleton } from "@/components/ui/skeleton"
import { TrendViewChart } from "@/components/charts/TrendViewChart"
import { SectionShell } from "@/components/shells/SectionShell"
import type { TrendViewVM } from "@/server/queries/trendView"
import { TrendLegend } from "./TrendLegend"

/**
 * Weekly Trends (spec §11 R32): the closing stack of a score screen, one card per metric over the 7 days ending on
 * the selected day, that day's column highlighted. Each card is a link with a chevron into its Trend View on W.
 */
export function WeeklyTrends({ cards, d, today }: { cards: TrendViewVM[]; d: string; today: string }) {
  if (!cards.length) return null
  return (
    <SectionShell variant="section" title="Weekly Trends" id="weekly-trends">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
        {cards.map((vm) => (
          <SectionShell key={vm.key} variant="card" level={3} title={vm.card} info={false} href={trendHref(vm.key, { d, today, r: "w" })}>
            {/* Every card keeps the legend's row, so plots line up across the two columns on a laptop. */}
            <div className="mb-1 h-5">
              <TrendLegend chart={vm.chart} series={vm.series} className="mb-0" />
            </div>
            <TrendViewChart
              label={vm.label}
              bars={vm.bars}
              chart={vm.chart}
              range="w"
              colorBy={vm.colorBy}
              format={vm.format}
              unit={vm.unit}
              direction={vm.direction}
              series={vm.series}
              domain={vm.domain}
              selected={d}
              compact
            />
          </SectionShell>
        ))}
      </div>
    </SectionShell>
  )
}

/** The loading shape: the heading and one card per title, each a legend row over the chart's height. */
export function WeeklyTrendsSkeleton({ titles }: { titles: string[] }) {
  return (
    <SectionShell variant="section" title="Weekly Trends">
      <div aria-hidden className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
        {titles.map((t) => (
          <SectionShell key={t} variant="card" level={3} title={t} info={false}>
            <div className="mb-1 h-5" />
            <Skeleton className="h-[150px] rounded-lg bg-muted/60" />
          </SectionShell>
        ))}
      </div>
    </SectionShell>
  )
}
WeeklyTrends.Skeleton = WeeklyTrendsSkeleton
