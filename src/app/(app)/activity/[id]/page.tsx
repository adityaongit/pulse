import { notFound } from "next/navigation"
import { cn } from "@/lib/utils"
import { deltaTone } from "@/lib/bands"
import { FEATURES } from "@/lib/features"
import { clock, dayLabel, formatValue } from "@/lib/format"
import { dayHref } from "@/lib/url"
import { IntradayHrChart } from "@/components/charts/IntradayHrChart"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { ACTIVITY_ICON } from "@/components/metrics/ActivityCard"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { coachReady } from "@/server/coach/store"
import { getActivity } from "@/server/queries/activity"
import { todayOf, userCtx } from "@/server/queries/common"
import type { ActivityVM } from "@/server/queries/types"
import { CAPTION, hrSeries, statProps } from "../../_lib/view"
import { ActivityMenu } from "./ActivityMenu"
import { CoachGlance } from "./CoachGlance"
import { WorkoutBanner } from "./WorkoutBanner"

export const metadata = { title: "Activity", description: "Activity strain, heart rate, zones and recovery after the workout." }

/** Activity `/activity/[id]` (spec §7.4). No date switcher; back falls back to that day's Strain. */
export default async function ActivityPage({ params }: PageProps<"/activity/[id]">) {
  const { id } = await params
  const ctx = await userCtx()
  const [vm, coach] = await Promise.all([getActivity(decodeURIComponent(id), ctx), coachReady(ctx.db, ctx.userId)])
  if (!vm) notFound()
  const { timeZone } = ctx
  const today = todayOf(ctx)

  const Icon = ACTIVITY_ICON[vm.kind]
  // No heart rate at all (band off): one notice replaces the empty chart, the empty zones and the dashed heart-rate
  // tiles, instead of the same "band not worn" line three times over an empty page.
  const noHr = vm.hr.value === null && vm.zones.value === null
  const tiles = vm.stats.filter((k) => !(noHr && k.metric.value === null))
  const strainHref = dayHref("/strain", vm.day, today)

  return (
    <DetailShell
      title={vm.name}
      subtitle={`${dayLabel(vm.day, today)} ${clock(vm.start, timeZone)} to ${clock(vm.end, timeZone)}`}
      align="start"
      titleIcon={<Icon />}
      backHref={strainHref}
      action={<ActivityMenu strainHref={strainHref} settingsHref={HR_SETTINGS} />}
      hero={
        <div className="w-full space-y-6">
          {FEATURES.strengthTrainer && vm.kind === "strength" && <WorkoutBanner />}
          <Hero vm={vm} />
        </div>
      }
      // the reference app draws the heart rate and the zone rows on the ground, not in cards [latest-activity-1].
      primary={
        noHr ? (
          <Card className="items-center gap-0 px-4 py-2">
            <ReasonPlaceholder reason={vm.hr.reason} size="md" copy={noHrCopy(vm.hr.reason)} />
          </Card>
        ) : (
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
              <ZoneBars variant="rows" data={vm.zones} note={vm.zoneNote} noteLink={{ label: "View heart-rate settings", href: HR_SETTINGS }} emptyCopy="No heart-rate zones for this activity." />
            </section>
          </div>
        )
      }
      secondary={[
        tiles.length > 0 && (
          <SectionShell key="stats" variant="section" title="Key statistics" aside="vs. 30-day average" level={2} className={cn("flex flex-col", noHr && "xl:col-span-2")}>
            {/* One scrolling row, the next tile peeking at the edge (activity-03); bleeds to the phone's edges. */}
            <ul className="-mx-4 flex flex-1 snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0">
              {tiles.map((k) => (
                <li key={k.key} className="relative flex w-[calc((100%-12px)/2.15)] shrink-0 snap-start md:w-44">
                  <KeyStatRow variant="tile" {...statProps(k)} className="w-full" />
                </li>
              ))}
            </ul>
          </SectionShell>
        ),
        // A titled section like Key statistics beside it, so both columns carry a heading and their cards start and end
        // on one line on laptop (SYM8). Without heart rate there is nothing to recover from, and the notice says why.
        !noHr && (
          <SectionShell key="hrr" variant="section" title="Heart rate recovery" level={2} className="flex flex-col">
            <Card className="flex-1 justify-center gap-0 p-4 xl:p-5">
              <HeartRateRecovery hrr={vm.hrr} />
            </Card>
          </SectionShell>
        ),
      ].filter(Boolean)}
      // With the coach set up, its pill takes the insight's place (activity-01, spec §11 R44); without it, the templated insight.
      footer={coach ? <CoachGlance id={vm.id} question={`Tell me about my ${vm.name.toLowerCase()} on ${dayLabel(vm.day, today).toLowerCase()}.`} /> : vm.insight && <InsightCard body={vm.insight} />}
    />
  )
}

const STAT_LABEL = "text-xs leading-4 font-bold tracking-[0.1em] text-foreground-secondary uppercase"
/** The profile, where max heart rate (and so the zones) is set. */
const HR_SETTINGS = "/settings?s=account"

/**
 * The activity hero (activity-01, activity-05): strain in blue with a chip of this kind's 30-day average, then the steps
 * in the workout for runs and walks, or the cardio / muscular split once a source estimates it (FEATURES.muscularLoad).
 */
function Hero({ vm }: { vm: ActivityVM }) {
  const s = vm.strain.value
  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <HeroStat label="Activity strain" value={formatValue("decimal1", s)} average={vm.strainAverage} format="decimal1" valueClass={s === null ? "text-muted-foreground" : "text-strain-text"} raw={s} />
        {vm.steps ? (
          <HeroStat label="Activity steps" value={formatValue("grouped", vm.steps.value)} average={vm.steps.average} format="grouped" raw={vm.steps.value} />
        ) : (
          FEATURES.muscularLoad && vm.split && <CardioMuscular split={vm.split} />
        )}
      </div>
      {/* The band-off notice under the hero already says why; repeating it here was the first of three copies. */}
      {s === null && vm.hr.value !== null && <ReasonPlaceholder reason={vm.strain.reason} size="sm" />}
    </div>
  )
}

function HeroStat({ label, value, raw, average, format, valueClass }: { label: string; value: string; raw: number | null; average: number | null; format: "decimal1" | "grouped"; valueClass?: string }) {
  const dir = raw !== null && average !== null ? deltaTone("neutral", raw, average).dir : null
  return (
    <div>
      <p className="flex items-center gap-2">
        <span className={cn("font-numeric text-[34px] leading-none font-bold tabular-nums", valueClass)}>{value}</span>
        {dir && average !== null && (
          <StatusChip tone="neutral" delta={dir}>
            <span className="sr-only">30-day average for this kind of activity </span>
            {formatValue(format, average)}
          </StatusChip>
        )}
      </p>
      <p className={cn(STAT_LABEL, "mt-2")}>{label}</p>
    </div>
  )
}

/** activity-01's split: Cardio and Muscular over one bar with a white divider at the split, the shares under it. */
function CardioMuscular({ split }: { split: NonNullable<ActivityVM["split"]> }) {
  const cardio = Math.round(split.cardio * 100)
  return (
    <div className="min-w-48 flex-1" role="img" aria-label={`Cardio ${cardio} percent, muscular ${100 - cardio} percent`}>
      <p aria-hidden className={cn(STAT_LABEL, "flex justify-between")}>
        <span>Cardio</span>
        <span>Muscular</span>
      </p>
      <div aria-hidden className="relative mt-1.5 h-4 overflow-hidden rounded-[3px] bg-strain">
        <div className="absolute inset-y-0 left-0 bg-strain-deep" style={{ width: `${cardio}%` }} />
        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${cardio}%` }} />
      </div>
      <p aria-hidden className="mt-1.5 flex justify-between font-numeric text-[15px] leading-5 font-bold tabular-nums">
        <span>{cardio}%</span>
        <span>{100 - cardio}%</span>
      </p>
    </div>
  )
}

/** The one band-off notice: what is missing and why. */
function noHrCopy(reason: string | null | undefined) {
  const what = "heart rate, zones or strain for this activity"
  return reason === "band_not_worn" ? `Band not worn, so there's no ${what}.` : `Too little heart-rate data to show ${what}.`
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
