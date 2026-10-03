import { cn } from "@/lib/utils"
import { clock, hmm } from "@/lib/format"
import { TrendChart } from "@/components/charts/TrendChart"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { SleepStages } from "@/components/metrics/SleepStages"
import { ValueUnit } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { getSleep } from "@/server/queries/sleep"
import type { SleepVM } from "@/server/queries/types"
import { pageDay, type SearchParams } from "../_lib/day"
import { HashScroll } from "../_lib/HashScroll"
import { SLEEP_INFO, TONIGHT_INFO } from "../_lib/info"
import { CAPTION, LABEL, LEGEND, statProps, trendProps } from "../_lib/view"

export const metadata = { title: "Sleep", description: "Sleep performance, stages, need and debt, plus tonight's bedtime plan." }

const STATUS_LEGEND = [
  ["bg-warning", "Poor"],
  ["bg-foreground-secondary", "Sufficient"],
  ["bg-optimal", "Optimal"],
] as const
/** "+0:12", "−0:05". */
const signedHmm = (min: number, sign: "+" | "−") => `${sign}${hmm(Math.abs(min))}`

/** Sleep `/sleep?d=` (spec §7.5). */
export default async function SleepPage({ searchParams }: PageProps<"/sleep">) {
  const { d, timeZone } = await pageDay(searchParams as SearchParams, "/sleep")
  const vm = getSleep(d)
  const p = vm.performance

  return (
    <DetailShell
      title="Sleep"
      info={SLEEP_INFO}
      dateSwitcher={{ mode: "day", placement: "header" }}
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
          // Same cut-offs as the sleep insight: optimal from 85%, sufficient from 70% (server/queries/sleep.ts).
          status={p.value === null ? undefined : p.value >= 85 ? "optimal" : p.value >= 70 ? "sufficient" : "poor"}
        />
      }
      summary={
        <Card className="gap-0 px-4 py-1 ring-0">
          <div className="divide-y divide-border">
            {vm.summary.map((k) => (
              // WHOOP's sleep rows show the status segments instead of a 30-day comparison.
              <KeyStatRow key={k.key} variant="row" {...statProps(k, undefined, false)} average={null} direction="none" />
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
      insight={vm.insight && <InsightCard body={vm.insight} />}
      primary={
        <SectionShell variant="card" title="Sleep stages" level={2}>
          <SleepStages data={vm.stages} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="need" variant="card" title="Hours vs. need" level={2}>
          <HoursVsNeed vm={vm} />
        </SectionShell>,
        <SectionShell key="details" variant="card" title="Details" level={2}>
          <div className="divide-y divide-border">
            {vm.details.map((k) => (
              <KeyStatRow key={k.key} variant="row" {...statProps(k, undefined, false)} />
            ))}
          </div>
        </SectionShell>,
        <SectionShell key="debt" variant="card" title="Sleep debt" level={2}>
          <TrendChart label="Sleep debt" unit="h" format="decimal1" colorBy="sleep" direction="down" {...trendProps(vm.debtTrend)} />
        </SectionShell>,
        <SectionShell key="planner" variant="card" title="Tonight's sleep" id="planner" info={TONIGHT_INFO} level={2}>
          <Planner vm={vm} timeZone={timeZone} />
          <HashScroll />
        </SectionShell>,
      ]}
    />
  )
}

function HoursVsNeed({ vm }: { vm: SleepVM }) {
  const m = vm.hoursVsNeed
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const h = m.value
  const rows: [string, string][] = [
    ["Baseline need", hmm(h.parts.baselineMin)],
    ["Yesterday's strain", signedHmm(h.parts.strainMin, "+")],
    ["Sleep debt", signedHmm(h.parts.debtMin, "+")],
    ["Naps", signedHmm(h.parts.napMin, "−")],
  ]
  return (
    <div className="space-y-3">
      <p>
        <ValueUnit value={hmm(h.asleepMin)} className="font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]" />
        <span className="ml-1.5 text-[13px] leading-4 font-semibold text-foreground-secondary">
          of <span className="font-numeric tabular-nums">{hmm(h.needMin)}</span> needed
        </span>
      </p>
      {h.calibrating ? (
        <p className={CAPTION}>
          Your need settles after 7 nights. Using <span className="font-numeric tabular-nums">{hmm(h.needMin)}</span> until then.
        </p>
      ) : (
        <dl className="space-y-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 text-xs leading-4 font-medium">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-numeric text-foreground-secondary tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
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
