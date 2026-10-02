import { notFound } from "next/navigation"
import { clock, formatValue } from "@/lib/format"
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
import { CAPTION, hrSeries, LABEL, statProps } from "../../_lib/view"

export const metadata = { title: "Activity", description: "Activity strain, heart rate, zones and recovery after the workout." }

/** Activity `/activity/[id]` (spec §7.4). No date switcher; back falls back to that day's Strain. */
export default async function ActivityPage({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params
  const vm = getActivity(decodeURIComponent(id))
  if (!vm) notFound()
  const { timeZone } = getConfig()
  const today = todayIn(timeZone)

  return (
    <DetailShell
      title={vm.name}
      subtitle={`${clock(vm.start, timeZone)} to ${clock(vm.end, timeZone)}`}
      backHref={dayHref("/strain", vm.day, today)}
      hero={<Hero vm={vm} />}
      summary={
        <SectionShell variant="section" title="Key statistics" aside="vs. 30-day average" level={2}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:gap-4">
            {vm.stats.map((k) => (
              <KeyStatRow key={k.key} variant="tile" {...statProps(k, undefined, false)} />
            ))}
          </div>
        </SectionShell>
      }
      insight={vm.insight && <InsightCard body={vm.insight} />}
      primary={
        <SectionShell variant="card" title="Heart rate" level={2}>
          <IntradayHrChart variant="activity" data={hrSeries(vm.hr, vm.maxHr)} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="zones" variant="card" title="Time in zones" level={2}>
          <ZoneBars variant="rows" data={vm.zones} maxHr={vm.maxHr} emptyCopy="No heart-rate zones for this activity." />
        </SectionShell>,
        <SectionShell key="hrr" variant="card" title="Heart rate recovery" level={2} className="lg:self-start">
          <HeartRateRecovery hrr={vm.hrr} />
        </SectionShell>,
      ]}
    />
  )
}

/** WHOOP's activity hero: a strain number, not a dial. */
function Hero({ vm }: { vm: ActivityVM }) {
  const Icon = ACTIVITY_ICON[vm.kind]
  const s = vm.strain.value
  return (
    <div className="flex flex-col items-center gap-2 py-2 text-center">
      <span className="mb-1 grid size-12 place-items-center rounded-full bg-strain-deep">
        <Icon aria-hidden className="size-6" strokeWidth={1.75} />
      </span>
      <p className="font-numeric text-[56px] leading-none font-bold tabular-nums">
        <span className={s === null ? "text-muted-foreground" : "text-strain-text"}>{formatValue("decimal1", s)}</span>
        <span className="sr-only"> activity strain</span>
      </p>
      <p aria-hidden className={LABEL}>
        Activity strain
      </p>
      {s === null ? (
        <ReasonPlaceholder reason={vm.strain.reason} size="sm" />
      ) : (
        vm.dayStrain !== null && (
          <p className={CAPTION}>
            of <span className="font-numeric tabular-nums">{formatValue("decimal1", vm.dayStrain)}</span> day strain
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
