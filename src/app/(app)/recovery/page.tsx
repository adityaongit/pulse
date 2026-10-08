import { dayHref, trendHref } from "@/lib/url"
import { BehaviorInsights } from "@/components/metrics/BehaviorInsights"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { WeeklyTrends } from "@/components/metrics/WeeklyTrends"
import { DetailShell } from "@/components/shells/DetailShell"
import { Card } from "@/components/ui/card"
import { getRecovery } from "@/server/queries/recovery"
import { getWeeklyTrends, type TrendViewKey } from "@/server/queries/trendView"
import { pageDay, type SearchParams } from "../_lib/day"
import { RECOVERY_INFO } from "../_lib/info"
import { statProps, TodayVsLegend } from "../_lib/view"

export const metadata = { title: "Recovery", description: "Your Recovery and what shaped it: HRV, resting heart rate, breathing and sleep against the last 30 days." }

/** Weekly Trends: Recovery and HRV as captured (recovery-12..15), then the other contributors in row order. */
const WEEKLY: readonly TrendViewKey[] = ["recovery", "hrv", "rhr", "resp", "sleep"]

/** Recovery `/recovery?d=` (spec §7.2, §11 R34): the ring, today's inputs against the last 30 days, behaviours, trends. */
export default async function RecoveryPage({ searchParams }: PageProps<"/recovery">) {
  const { d, today, ctx } = await pageDay(searchParams as SearchParams, "/recovery")
  const [vm, weekly] = await Promise.all([getRecovery(d, ctx), getWeeklyTrends(WEEKLY, d, ctx)])
  const r = vm.recovery

  return (
    <DetailShell
      title="Recovery"
      info={RECOVERY_INFO}
      dateSwitcher={{ mode: "day", placement: "header", steppers: false }}
      notch
      hero={<ScoreDial variant="recovery" size="lg" value={r.value} reason={r.reason} nightsLeft={r.nightsLeft} provisional={r.provisional} tags={r.tags} />}
      summary={
        <Card className="gap-0 px-4 py-1 ring-0">
          <div className="divide-y divide-border">
            {vm.summary.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, { d, today })} />
            ))}
          </div>
          <TodayVsLegend period="last 30 days" />
        </Card>
      }
      insight={vm.insight && <InsightCard body={vm.insight} action={{ label: "Explore your recovery insights", href: trendHref("recovery", { d, today }) }} />}
      primary={<BehaviorInsights chips={vm.behaviors} href={dayHref("/journal/insights", d, today)} />}
      footer={<WeeklyTrends cards={weekly} d={d} today={today} />}
    />
  )
}
