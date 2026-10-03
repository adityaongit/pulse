import { notFound } from "next/navigation"
import { cn } from "@/lib/utils"
import { clock, dayLabel, formatValue, hmm } from "@/lib/format"
import { dayHref, todayIn } from "@/lib/url"
import { IntradayHrChart } from "@/components/charts/IntradayHrChart"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { ACTIVITY_ICON } from "@/components/metrics/ActivityCard"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { getConfig } from "@/server/config"
import { getActivity } from "@/server/queries/activity"
import type { ActivityVM } from "@/server/queries/types"
import { CAPTION, hrSeries, statProps } from "../../_lib/view"

export const metadata = { title: "Activity", description: "Activity strain, heart rate, zones and recovery after the workout." }

/** Activity `/activity/[id]` (spec §7.4). No date switcher; back falls back to that day's Strain. */
export default async function ActivityPage({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params
  const vm = getActivity(decodeURIComponent(id))
  if (!vm) notFound()
  const { timeZone } = getConfig()
  const today = todayIn(timeZone)

  const Icon = ACTIVITY_ICON[vm.kind]
  const tiles = vm.stats.filter((k) => k.key !== "duration")

  return (
    <DetailShell
      title={vm.name}
      subtitle={`${dayLabel(vm.day, today)} ${clock(vm.start, timeZone)} to ${clock(vm.end, timeZone)}`}
      align="start"
      titleIcon={<Icon />}
      backHref={dayHref("/strain", vm.day, today)}
      hero={<Hero vm={vm} />}
      // WHOOP draws the heart rate and the zone rows on the ground, not in cards [latest-activity-1].
      primary={
        <div className="space-y-6">
          <section aria-labelledby="hr-title">
            <h2 id="hr-title" className="sr-only">
              Heart rate
            </h2>
            <IntradayHrChart variant="activity" data={hrSeries(vm.hr, vm.maxHr)} />
          </section>
          <section aria-labelledby="zones-title">
            <h2 id="zones-title" className="sr-only">
              Time in zones
            </h2>
            <ZoneBars variant="rows" data={vm.zones} maxHr={vm.maxHr} emptyCopy="No heart-rate zones for this activity." />
          </section>
        </div>
      }
      secondary={[
        <SectionShell key="stats" variant="section" title="Key statistics" aside="vs. 30-day average" level={2}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:gap-4">
            {tiles.map((k) => (
              <KeyStatRow key={k.key} variant="tile" {...statProps(k)} />
            ))}
          </div>
        </SectionShell>,
        <SectionShell key="hrr" variant="card" title="Heart rate recovery" level={2} className="xl:self-end">
          <HeartRateRecovery hrr={vm.hrr} />
        </SectionShell>,
      ]}
      footer={vm.insight && <InsightCard body={vm.insight} />}
    />
  )
}

const STAT_LABEL = "text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase"

/** WHOOP's activity hero [latest-activity-1]: a left-aligned stat pair, activity strain in blue and the duration. */
function Hero({ vm }: { vm: ActivityVM }) {
  const s = vm.strain.value
  const duration = vm.stats.find((k) => k.key === "duration")?.metric.value ?? (vm.end - vm.start) / 60_000
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <div>
          <p className="font-numeric text-[44px] leading-none font-bold tabular-nums">
            <span className={s === null ? "text-muted-foreground" : "text-strain-text"}>{formatValue("decimal1", s)}</span>
          </p>
          <p className={cn(STAT_LABEL, "mt-2")}>Activity strain</p>
        </div>
        <div>
          <p className="font-numeric text-[44px] leading-none font-bold tabular-nums">{hmm(duration)}</p>
          <p className={cn(STAT_LABEL, "mt-2")}>Duration</p>
        </div>
      </div>
      {s === null ? (
        <ReasonPlaceholder reason={vm.strain.reason} size="sm" />
      ) : (
        vm.dayStrain !== null && (
          <p className={CAPTION}>
            Day strain <span className="font-numeric tabular-nums">{formatValue("decimal1", vm.dayStrain)}</span>
          </p>
        )
      )}
    </div>
  )
}

function HeartRateRecovery({ hrr }: { hrr: ActivityVM["hrr"] }) {
  if (hrr.value === null) return <ReasonPlaceholder reason="insufficient_hr_data" size="md" copy="Not enough heart-rate data after the workout." />
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <ValueUnit value={formatValue("int", hrr.value.value)} unit="bpm" className="font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]" />
        <StatusChip tone={hrr.value.tone}>{hrr.value.label}</StatusChip>
      </div>
      <p className={`${CAPTION} max-w-[65ch] text-pretty`}>Drop in the first 60 seconds after you stopped. Above 20 is typical for fit adults.</p>
    </div>
  )
}
