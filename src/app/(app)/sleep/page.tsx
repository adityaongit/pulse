import { cn } from "@/lib/utils"
import { clock, hmm } from "@/lib/format"
import { FEATURES } from "@/lib/features"
import { trendHref } from "@/lib/url"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { SleepStages } from "@/components/metrics/SleepStages"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { getSleep } from "@/server/queries/sleep"
import { getWeeklyTrends, type TrendViewKey } from "@/server/queries/trendView"
import { WeeklyTrends } from "@/components/metrics/WeeklyTrends"
import type { SleepVM } from "@/server/queries/types"
import { pageDay, type SearchParams } from "../_lib/day"
import { HashScroll } from "../_lib/HashScroll"
import { SLEEP_INFO, TONIGHT_INFO } from "../_lib/info"
import { CAPTION, LABEL, LEGEND, statProps } from "../_lib/view"
import { HoursVsNeed, SleepConsistency, SleepEfficiency, SleepStress } from "./SleepCards"

export const metadata = { title: "Sleep", description: "Sleep performance, stages, need and debt, plus tonight’s bedtime plan." }

const STATUS_LEGEND = [
  ["bg-warning", "Poor"],
  ["bg-foreground-secondary", "Sufficient"],
  ["bg-optimal", "Optimal"],
] as const

/** Weekly Trends, in the reference app's order (sleep-28..34). */
const WEEKLY: readonly TrendViewKey[] = ["sleep", "hours", "hours_need", "restorative", "consistency", "time_in_bed", "efficiency"]

export default async function SleepPage({ searchParams }: PageProps<"/sleep">) {
  const { d, today, timeZone, ctx } = await pageDay(searchParams as SearchParams, "/sleep")
  const [vm, weekly] = await Promise.all([getSleep(d, ctx), getWeeklyTrends(WEEKLY, d, ctx)])
  const p = vm.performance

  return (
    <DetailShell
      title="Sleep"
      info={SLEEP_INFO}
      dateSwitcher={{ mode: "day", placement: "header", steppers: false }}
      notch
      hero={
        <ScoreDial
          variant="sleep"
          size="lg"
          value={p.value}
          reason={p.reason}
          nightsLeft={p.nightsLeft}
          provisional={p.provisional}
          tags={p.tags}
          status={p.value === null ? undefined : p.value >= 85 ? "optimal" : p.value >= 70 ? "sufficient" : "poor"}
        />
      }
      summary={
        <Card className="gap-0 px-4 py-1 ring-0">
          <div className="divide-y divide-border">
            {vm.summary.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, { d, today })} average={null} direction="none" />
            ))}
          </div>
          <p className={cn(LEGEND, "flex flex-wrap items-center gap-x-4 gap-y-1")}>
            {STATUS_LEGEND.map(([swatch, word]) => (
              <span key={word} className="inline-flex items-center gap-1.5">
                <span aria-hidden className={cn("h-1 w-4 rounded-sm", swatch)} />
                {word}
              </span>
            ))}
          </p>
        </Card>
      }
      insight={vm.insight && <InsightCard body={vm.insight} action={{ label: "Explore your sleep insights", href: trendHref("sleep", { d, today }) }} />}
      primary={
        <SectionShell variant="card" title="Last night’s sleep" aside="vs. prior 30 days" level={2}>
          <SleepStages hours={vm.hours} hr={vm.nightHr} data={vm.stages} restorative={vm.restorative} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="need" variant="card" title="Hours vs. needed" level={2}>
          <HoursVsNeed vm={vm} />
        </SectionShell>,
        <SectionShell key="consistency" variant="card" title="Sleep consistency" level={2}>
          <SleepConsistency vm={vm} />
        </SectionShell>,
        <SectionShell key="efficiency" variant="card" title="Sleep efficiency" level={2}>
          <SleepEfficiency vm={vm} />
        </SectionShell>,
        FEATURES.sleepStress && (
          <SectionShell key="stress" variant="card" title="Sleep stress" level={2}>
            <SleepStress vm={vm} />
          </SectionShell>
        ),
        <SectionShell key="planner" variant="card" title="Tonight’s sleep" id="planner" info={TONIGHT_INFO} level={2}>
          <Planner vm={vm} timeZone={timeZone} />
          <HashScroll />
        </SectionShell>,
      ].filter(Boolean)}
      footer={<WeeklyTrends cards={weekly} d={d} today={today} />}
    />
  )
}

function Planner({ vm, timeZone }: { vm: SleepVM; timeZone: string }) {
  const m = vm.planner
  if (m.value === null)
    return (
      <ReasonPlaceholder
        reason={m.reason}
        nightsLeft={m.nightsLeft}
        size="md"
        copy={m.reason === "calibrating" ? "Sleep Planner needs 7 nights to learn your wake time." : undefined}
      />
    )
  const plan = m.value
  const row = (label: string, caption: string, time: string) => (
    <div key={label} className="flex min-h-13 items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className={cn(LABEL, "block truncate")}>{label}</span>
        <span className={cn(CAPTION, "mt-0.5 block truncate")}>{caption}</span>
      </span>
      <span className="font-numeric text-xl leading-6 font-bold tabular-nums">{time}</span>
    </div>
  )
  return (
    <div className="space-y-2">
      <div className="divide-y divide-border">
        {plan.plans.map((p) => row(p.label, `${Math.round(p.share * 100)}% of need`, clock(p.bedtimeAt, timeZone)))}
        {row("Typical wake", plan.weekdayWake ? "Weekday wake time" : "Weekend wake time", clock(plan.wakeAt, timeZone))}
      </div>
      <p className={CAPTION}>
        Need tonight: <span className="font-numeric tabular-nums">{hmm(plan.needMin)}</span>
      </p>
    </div>
  )
}
