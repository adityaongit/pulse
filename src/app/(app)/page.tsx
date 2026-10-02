import Link from "next/link"
import { CalendarRange, Check, ChevronRight, CircleAlert, Maximize2, Plus, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { clock, formatValue, MISSING, rangeLabel } from "@/lib/format"
import { reasonCopy } from "@/lib/reasons"
import { dayHref } from "@/lib/url"
import { EnergyBankChart } from "@/components/charts/EnergyBankChart"
import { ActivityCard } from "@/components/metrics/ActivityCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { SleepCard } from "@/components/metrics/SleepCard"
import { TickScale } from "@/components/metrics/TickScale"
import { MetricTags } from "@/components/metrics/primitives"
import { EmptyState } from "@/components/shells/EmptyState"
import { HEADER_SENTINEL } from "@/lib/header-state"
import { MetricState } from "@/components/shells/MetricState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CARD_MATERIAL } from "@/components/ui/card"
import { getHome } from "@/server/queries/home"
import type { HomeVM, StressLevel } from "@/server/queries/types"
import { pageDay, type SearchParams } from "./_lib/day"
import { ENERGY_INFO, TONIGHT_INFO } from "./_lib/info"
import { TonightPlan } from "./_lib/TonightPlan"
import { CAPTION, energySeries, LABEL, statProps } from "./_lib/view"

export const metadata = { title: "Today", description: "Today's Sleep, Recovery and Strain at a glance." }

const STRESS_TONE: Record<StressLevel, { chip: string; text: string; word: string }> = {
  low: { chip: "bg-stress-low/15 text-stress-low", text: "text-stress-low", word: "Low" },
  medium: { chip: "bg-stress-medium/15 text-stress-medium", text: "text-stress-medium", word: "Medium" },
  high: { chip: "bg-stress-high/15 text-stress-high", text: "text-stress-high", word: "High" },
}
const CHIP_BOX = "grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1"
const ICON_LINK =
  "relative grid size-8 place-items-center rounded-md text-foreground-secondary transition-[color] duration-150 ease-standard outline-none after:absolute after:-inset-1.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

/** Home `/` (spec §7.1). */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { d, today, timeZone } = await pageDay(searchParams as SearchParams, "/")
  const vm = getHome(d)
  const at = (href: string) => dayHref(href, d, today)
  const { dials } = vm
  const checkIn = `${at("/journal")}${vm.isToday ? "?" : "&"}checkin=1`

  return (
    <PageShell
      title="Home"
      layout="home"
      rings={{
        sleep: { value: dials.sleep.value, href: at("/sleep") },
        recovery: { value: dials.recovery.value, href: at("/recovery") },
        strain: { value: dials.strain.value, href: at("/strain") },
      }}
      slots={{
        top: (
          <div className="pt-4 xl:pt-2">
            <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-center xl:gap-x-6">
              <div className="space-y-4">
                <p aria-hidden className="text-center text-[13px] leading-4 font-semibold tracking-[0.35em] text-foreground-secondary uppercase">
                  Pulse
                </p>
                <div className="grid grid-cols-3 items-start justify-items-center">
                  <ScoreDial variant="sleep" size="md" value={dials.sleep.value} reason={dials.sleep.reason} provisional={dials.sleep.provisional} tags={dials.sleep.tags} href={at("/sleep")} />
                  <ScoreDial
                    variant="recovery"
                    size="md"
                    value={dials.recovery.value}
                    reason={dials.recovery.reason}
                    nightsLeft={dials.recovery.nightsLeft}
                    provisional={dials.recovery.provisional}
                    tags={dials.recovery.tags}
                    href={at("/recovery")}
                  />
                  <ScoreDial
                    variant="strain"
                    size="md"
                    value={dials.strain.value}
                    reason={dials.strain.reason}
                    target={dials.strainTarget}
                    extraTags={dials.soFar && dials.strain.value !== null ? ["so_far"] : undefined}
                    href={at("/strain")}
                  />
                </div>
                {/* The header's ring row appears once this passes under it (spec §4.3). */}
                <div aria-hidden {...{ [HEADER_SENTINEL]: "" }} />
                {dials.reason && (
                  <p className="text-center">
                    <ReasonPlaceholder reason={dials.reason.reason} nightsLeft={dials.reason.nightsLeft} size="sm" />
                  </p>
                )}
              </div>
              {vm.monitorAlert && (
                <div className="xl:order-last xl:col-span-2">
                  <MonitorAlert alert={vm.monitorAlert} href={at("/health/monitor")} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 xl:gap-4">
                <MonitorCard vm={vm} href={at("/health/monitor")} />
                <StressCard vm={vm} href={at("/health/stress")} timeZone={timeZone} />
              </div>
            </div>
          </div>
        ),
        right: (
          <SectionShell
            variant="section"
            title="My Day"
            action={
              <Link
                href={checkIn}
                aria-label="Add to today"
                className="-my-2 grid size-12 place-items-center rounded-[14px] bg-foreground text-primary-foreground transition-[scale,background-color] duration-150 ease-standard outline-none hover:bg-foreground/90 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
              >
                <Plus aria-hidden className="size-[26px]" strokeWidth={2} />
              </Link>
            }
          >
            <div className="space-y-3 xl:space-y-4">
              <SectionShell
                variant="card"
                title={vm.activities.title}
                action={
                  <Link href={at("/strain")} aria-label="Open Strain" className={ICON_LINK}>
                    <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
                  </Link>
                }
              >
                {vm.activities.items.length ? (
                  <div className="space-y-1.5">
                    {vm.activities.items.map((it) =>
                      it.kind === "activity" ? (
                        <ActivityCard key={it.id} name={it.name} kind={it.activityKind} strain={it.strain} start={it.start} end={it.end} href={`/activity/${it.id}`} timeZone={timeZone} />
                      ) : (
                        <SleepCard key={it.id} kind={it.kind} minutes={it.minutes} start={it.start} end={it.end} href={at("/sleep")} timeZone={timeZone} />
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState body={vm.isToday ? "No activities yet today. Workouts appear after Fitbit syncs them." : "No activities on this day."} />
                )}
              </SectionShell>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
                <EnergyCard vm={vm} timeZone={timeZone} />
                <SectionShell
                  variant="card"
                  title="Tonight's sleep"
                  info={TONIGHT_INFO}
                  action={
                    <Link href={at("/sleep#planner")} aria-label="Open Sleep Planner" className={ICON_LINK}>
                      <ChevronRight aria-hidden className="size-[18px]" strokeWidth={1.75} />
                    </Link>
                  }
                >
                  <MetricState
                    metric={vm.tonight}
                    skeleton={null}
                    renderReason={(r, meta) => (
                      <ReasonPlaceholder
                        reason={r}
                        nightsLeft={meta.nightsLeft}
                        size="md"
                        copy={r === "calibrating" ? "Sleep Planner needs 7 nights to learn your wake time." : undefined}
                      />
                    )}
                  >
                    {(plan) => <TonightPlan plan={plan} timeZone={timeZone} />}
                  </MetricState>
                </SectionShell>
              </div>
            </div>
          </SectionShell>
        ),
        left: (
          <SectionShell variant="section" title="My Dashboard" aside="vs. 30-day average">
            {/* One card per metric (V9, [latest-home-dashboard-1]). */}
            <ul className="space-y-2">
              {vm.keyStats.map((s) => (
                <li key={s.key}>
                  <KeyStatRow variant="card" {...statProps(s, { d, today })} />
                </li>
              ))}
            </ul>
          </SectionShell>
        ),
        bottom: vm.weeklyTeaser && (
          <Link
            href={`/reports/${vm.weeklyTeaser.period}`}
            className="flex h-14 items-center gap-3 rounded-2xl bg-linear-to-r from-banner-from to-banner-to px-4 shadow-card transition-[filter,scale] duration-150 ease-standard outline-none hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
          >
            <CalendarRange aria-hidden className="size-[22px] shrink-0" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 truncate text-base leading-[22px] font-semibold">Your week in review</span>
            <span className="shrink-0 font-numeric text-xs leading-4 font-medium text-foreground-secondary tabular-nums">
              {rangeLabel(vm.weeklyTeaser.start, vm.weeklyTeaser.end)}
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 text-foreground-secondary" strokeWidth={1.75} />
          </Link>
        ),
      }}
    />
  )
}

function MonitorAlert({ alert, href }: { alert: NonNullable<HomeVM["monitorAlert"]>; href: string }) {
  const illness = alert.kind === "illness"
  const names = alert.names.length > 1 ? `${alert.names.slice(0, -1).join(", ")} and ${alert.names.at(-1)}` : (alert.names[0] ?? "Some vitals")
  return (
    <Alert
      className={cn(
        CARD_MATERIAL,
        "grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-0 px-4 py-3 *:[svg]:size-5 *:[svg]:translate-y-px",
        illness ? "ring-1 ring-recovery-red/60" : "ring-1 ring-warning/50",
      )}
    >
      {illness ? <CircleAlert className="text-recovery-red-text" strokeWidth={1.75} /> : <TriangleAlert className="text-warning" strokeWidth={1.75} />}
      <AlertTitle className="text-base leading-[22px] font-semibold text-balance">
        {illness ? "Your body may be fighting something" : `${alert.count} vitals outside your normal range`}
      </AlertTitle>
      <AlertDescription className="col-start-2 space-y-2 text-[15px] leading-[22px] text-pretty text-foreground-secondary md:text-pretty">
        <p>
          {illness
            ? "Several vitals moved away from your normal range together, a pattern that often comes before feeling unwell. Consider an easier day."
            : `${names} are outside your usual range. This can be an early sign of illness or heavy strain.`}
        </p>
        <Link
          href={href}
          className="relative inline-flex items-center gap-0.5 rounded-md text-xs leading-4 font-bold tracking-[0.08em] text-foreground uppercase no-underline! outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          View Health Monitor
          <ChevronRight aria-hidden className="size-3.5" strokeWidth={2} />
        </Link>
      </AlertDescription>
    </Alert>
  )
}

/** Chip + two lines, the body of both monitor cards. */
function MonitorLine({ chip, chipClass, top, topClass, bottom }: { chip: React.ReactNode; chipClass: string; top: string; topClass?: string; bottom: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn(CHIP_BOX, chipClass)}>{chip}</span>
      <span className="min-w-0">
        <span className={cn(LABEL, "block tracking-[0.06em] text-balance", topClass)}>{top}</span>
        <span className={cn(CAPTION, "block truncate text-foreground-secondary tabular-nums")}>{bottom}</span>
      </span>
    </div>
  )
}

function MonitorCard({ vm, href }: { vm: HomeVM; href: string }) {
  const m = vm.monitor
  return (
    <SectionShell variant="card" title="Health Monitor" href={href}>
      {m.value === null || m.value.inRange + m.value.flagged === 0 ? (
        // No vital judged yet (no readings, or every baseline still calibrating): never "Within range".
        <MonitorLine
          chip={MISSING}
          chipClass="bg-secondary font-numeric text-base font-bold text-muted-foreground"
          top="No readings"
          topClass="text-foreground-secondary"
          bottom={reasonCopy(m.value === null ? m.reason : "calibrating").short}
        />
      ) : m.value.flagged === 0 ? (
        <MonitorLine
          chip={<Check aria-hidden className="size-4" strokeWidth={2.5} />}
          chipClass="bg-optimal/15 text-optimal"
          top="Within range"
          topClass="text-optimal"
          bottom={`${m.value.inRange}/${m.value.total} metrics`}
        />
      ) : (
        <MonitorLine
          chip={<TriangleAlert aria-hidden className="size-4" strokeWidth={2} />}
          chipClass="bg-warning/15 text-warning"
          top="Out of range"
          topClass="text-warning"
          bottom={`${m.value.inRange}/${m.value.total} metrics`}
        />
      )}
    </SectionShell>
  )
}

function StressCard({ vm, href, timeZone }: { vm: HomeVM; href: string; timeZone: string }) {
  const s = vm.stress
  if (s.value === null)
    return (
      <SectionShell variant="card" title="Stress Monitor" href={href}>
        <MonitorLine
          chip={MISSING}
          chipClass="bg-secondary font-numeric text-base font-bold text-muted-foreground"
          top={s.reason === "band_not_worn" ? "Not worn" : "No still minutes yet"}
          topClass="text-foreground-secondary"
          bottom={vm.isToday ? "Today" : "This day"}
        />
      </SectionShell>
    )
  const tone = STRESS_TONE[s.value.level]
  return (
    <SectionShell variant="card" title="Stress Monitor" href={href}>
      <MonitorLine
        chip={formatValue("decimal1", s.value.value)}
        chipClass={cn("font-numeric text-lg font-bold tabular-nums", tone.chip)}
        top={tone.word}
        topClass={tone.text}
        bottom={s.value.at !== null ? clock(s.value.at, timeZone) : "Day average"}
      />
    </SectionShell>
  )
}

function EnergyCard({ vm, timeZone }: { vm: HomeVM; timeZone: string }) {
  const e = vm.energyBank
  return (
    <SectionShell variant="card" title="Energy Bank" info={ENERGY_INFO} aside={e.value && e.provisional ? <MetricTags provisional /> : undefined}>
      <MetricState metric={e} skeleton={null} renderReason={(r, meta) => <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />}>
        {(eb) => (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <TickScale variant="meter" label="Energy" metric={{ value: eb.current, reason: null, provisional: false }} min={0} max={100} format="int" unit="%" />
              <p className={CAPTION}>
                Started at <span className="font-numeric tabular-nums">{formatValue("int", eb.startLevel)}%</span> at{" "}
                <span className="font-numeric tabular-nums">{clock(eb.startAt, timeZone)}</span>
              </p>
            </div>
            <EnergyBankChart data={{ value: energySeries(eb), reason: null, provisional: false }} />
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Charged" value={formatValue("signedInt", eb.charged)} className="text-optimal" />
              <MiniStat label="Drained" value={formatValue("signedInt", eb.drained)} className="text-warning" />
            </div>
            {eb.drains.length > 0 && (
              <ul className="space-y-1">
                {eb.drains.slice(0, 3).map((dr) => (
                  <li key={`${dr.label}-${dr.start}`} className={cn(CAPTION, "text-foreground-secondary")}>
                    {dr.label} at <span className="font-numeric tabular-nums">{clock(dr.start, timeZone)}</span> ·{" "}
                    <span className="font-numeric tabular-nums">{formatValue("signedInt", -Math.abs(dr.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </MetricState>
    </SectionShell>
  )
}

function MiniStat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-lg bg-secondary p-3">
      <p className={cn(LABEL, "text-muted-foreground")}>{label}</p>
      <p className={cn("mt-1 font-numeric text-xl leading-6 font-bold tabular-nums", className)}>{value}</p>
    </div>
  )
}
