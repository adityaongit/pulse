import Link from "next/link"
import { CalendarRange, Check, ChevronRight, CircleAlert, Info, Lightbulb, Maximize2, Moon, Plus, Sun, Timer, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { isDashboardKey } from "@/lib/dashboard"
import { FEATURES } from "@/lib/features"
import { clock, DAY, formatDay, formatValue, MISSING, rangeLabel } from "@/lib/format"
import { reasonCopy } from "@/lib/reasons"
import { dayHref, activityHref } from "@/lib/url"
import { Wordmark } from "@/components/brand/Wordmark"
import { EnergyBankChart } from "@/components/charts/EnergyBankChart"
import { StrainRecoveryChart } from "@/components/charts/StrainRecoveryChart"
import { StressChart } from "@/components/charts/StressChart"
import { ActivityCard } from "@/components/metrics/ActivityCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { SleepCard } from "@/components/metrics/SleepCard"
import { TickScale } from "@/components/metrics/TickScale"
import { CARD_BUTTON, MetricTags } from "@/components/metrics/primitives"
import { EmptyState } from "@/components/shells/EmptyState"
import { InfoCardTrigger } from "@/components/shells/InfoButton"
import { HEADER_SENTINEL, HOME_DIALS, HOME_DIALS_CLASS } from "@/lib/header-state"
import { MetricState } from "@/components/shells/MetricState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { SheetTrigger } from "@/components/shells/SheetTrigger"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CARD_MATERIAL } from "@/components/ui/card"
import { getHome } from "@/server/queries/home"
import type { HomeVM, KeyStat, StressLevel } from "@/server/queries/types"
import { pageDay, type SearchParams } from "../_lib/day"
import { EditDashboard } from "../_lib/EditDashboard"
import { MyPlan } from "../_lib/MyPlan"
import { PlusMenu } from "../_lib/PlusMenu"
import { HomeInsight } from "../_lib/HomeInsight"
import { AddActivityTrigger } from "../_lib/AddActivity"
import { ENERGY_INFO, STRAIN_RECOVERY_INFO, TONIGHT_INFO } from "../_lib/info"
import { TonightPlan } from "../_lib/TonightPlan"
import { CAPTION, energySeries, LABEL, statProps, stressSeries } from "../_lib/view"

export const metadata = { title: "Today", description: "Today’s Sleep, Recovery and Strain at a glance." }

const STRESS_TONE: Record<StressLevel, { chip: string; text: string; word: string }> = {
  low: { chip: "bg-stress-low/15 text-stress-low", text: "text-stress-low", word: "Low" },
  medium: { chip: "bg-stress-medium/15 text-stress-medium", text: "text-stress-medium", word: "Medium" },
  high: { chip: "bg-stress-high/15 text-stress-high", text: "text-stress-high", word: "High" },
}
const CHIP_BOX = "grid h-7 min-w-7 shrink-0 place-items-center rounded-md px-1"
/** The 56 px gradient banner rows: day outlook / review and week in review (spec §7.1 7a, 10). */
const BANNER =
  "flex h-14 w-full items-center gap-3 rounded-2xl px-4 text-left shadow-card transition-[filter,scale] duration-150 ease-standard outline-none hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
const NO_BAND_INFO = {
  title: "No band data yet",
  body: (
    <>
      <p>Sleep, Recovery and Strain are scored from your Fitbit’s heart rate, which your phone can’t measure.</p>
      <p>Until your Fitbit syncs, Home shows what your phone counts: steps, distance, calories and active minutes.</p>
    </>
  ),
}
const ICON_LINK =
  "relative grid size-8 place-items-center rounded-md text-foreground-secondary transition-[color] duration-150 ease-standard outline-none after:absolute after:-inset-1.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

/** Home `/` (spec §7.1). */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { d, today, timeZone, ctx } = await pageDay(searchParams as SearchParams, "/")
  const vm = await getHome(d, ctx)
  const at = (href: string) => dayHref(href, d, today)
  const { dials } = vm
  const startActivity = FEATURES.startActivity && vm.isToday

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
          // Phone: the wordmark sits right under the header's fade, 52 px below the date pill as in the reference app
          // [latest-home-top-2], [latest-home-top-3] (spec §11 F1); -mt-2 cancels the column's own 8 px.
          <div className="max-md:-mt-2 md:pt-4 xl:pt-2">
            <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-center xl:gap-x-6">
              <div className="space-y-3 md:space-y-4 xl:col-start-1 xl:row-start-1">
                <span aria-hidden className="flex justify-center text-foreground-secondary">
                  <Wordmark className="h-[17px]" />
                </span>
                {/* The dials shrink into the header's ring row as this row scrolls under it (spec §4.3, HomeHeader). */}
                <div {...{ [HOME_DIALS]: "" }} className={cn("grid grid-cols-3 items-start justify-items-center", HOME_DIALS_CLASS)}>
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
                    href={at("/strain")}
                  />
                </div>
                {/* The end of the collapse distance: the dial labels' bottom (spec §4.3). */}
                {/* -mt-4 cancels the stack's gap, so the card below sits 24 px under the labels as in the reference app (spec §11 F1). */}
                <div aria-hidden className="-mt-3 md:-mt-4" {...{ [HEADER_SENTINEL]: "" }} />
                {/* The sentinel above pulls the stack up to the labels; give the note its own 12 px back. */}
                {dials.reason && (
                  <p className="pt-3 text-center md:pt-4">
                    {vm.phone ? (
                      // Phone data but no band: one short line, the reason in its info card (§11 CD2, MD2).
                      <InfoCardTrigger
                        info={NO_BAND_INFO}
                        className="relative inline-flex items-center gap-1.5 rounded-md whitespace-nowrap outline-none after:absolute after:-inset-x-2 after:-inset-y-3 hover:[&>*]:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <ReasonPlaceholder reason={dials.reason.reason} size="sm" copy="No band data yet" className="transition-[color] duration-150 ease-standard" />
                        <Info aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-[color] duration-150 ease-standard" strokeWidth={1.75} />
                      </InfoCardTrigger>
                    ) : (
                      <ReasonPlaceholder reason={dials.reason.reason} nightsLeft={dials.reason.nightsLeft} size="sm" />
                    )}
                  </p>
                )}
              </div>
              {vm.phone && (
                // Leads where the monitor cards sit: with no band they would only say "No readings" (§11 CD2).
                <div className="xl:col-start-2 xl:row-start-1">
                  <PhoneActivity stats={vm.phone} link={{ d, today }} />
                </div>
              )}
              {/* Dials, then the monitor cards, as in the reference app (home-01); the coach card and an alert follow them. */}
              {!vm.phone && (
                <div className="grid grid-cols-2 gap-3 xl:col-start-2 xl:row-start-1 xl:grid-cols-1 xl:gap-4">
                  <MonitorCard vm={vm} href={at("/health/monitor")} />
                  <StressCard vm={vm} href={at("/health/stress")} timeZone={timeZone} />
                </div>
              )}
              {vm.insights.length > 0 && (
                <div className="xl:col-span-2 xl:row-start-2">
                  <HomeInsight items={vm.insights} />
                </div>
              )}
              {vm.monitorAlert && (
                <div className="xl:col-span-2 xl:row-start-3">
                  <MonitorAlert alert={vm.monitorAlert} href={at("/health/monitor")} />
                </div>
              )}
            </div>
          </div>
        ),
        main: (
          // Laptop: My Day and My Dashboard end on one line. Both columns fill the row; whichever is shorter grows its
          // last card (the Energy Bank / Tonight's sleep pair, or the Strain & recovery chart), never a blank (SYM4).
          <SectionShell
            variant="section"
            title="My Day"
            className="xl:flex xl:h-full xl:flex-col"
            // The action menu for the day on screen: add an activity, complete the journal (the reference app, home-08).
            action={<PlusMenu label={vm.isToday ? "Add to today" : `Add to ${formatDay(d, DAY.short)}`} />}
          >
            <div className="flex flex-col gap-3 xl:flex-1 xl:gap-4">
              {vm.outlook && <DayBanner outlook={vm.outlook} />}
              <SectionShell
                variant="card"
                title={vm.activities.title}
                action={
                  <Link href="/activities" aria-label="All activities" className={ICON_LINK}>
                    <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
                  </Link>
                }
              >
                {vm.activities.items.length ? (
                  <div className="space-y-1.5">
                    {vm.activities.items.map((it) =>
                      it.kind === "activity" ? (
                        <ActivityCard key={it.id} name={it.name} kind={it.activityKind} strain={it.strain} start={it.start} end={it.end} distanceKm={it.distanceKm} paceS={it.paceS} href={activityHref(it.id)} timeZone={timeZone} />
                      ) : (
                        <SleepCard key={it.id} kind={it.kind} minutes={it.minutes} start={it.start} end={it.end} href={at("/sleep")} timeZone={timeZone} />
                      ),
                    )}
                  </div>
                ) : (
                  <EmptyState body={vm.isToday ? "No activities yet today. Workouts appear after Fitbit syncs them." : "No activities on this day."} />
                )}
                {/* the reference app's "+ Add activity", on past days too, beside "Start activity" today (home-01, home-03).
                    Pulse imports workouts, so Add explains where they come from (§11 R2); Start needs live recording. */}
                <div className={cn("mt-3 grid gap-3", startActivity && "grid-cols-2")}>
                  <AddActivityTrigger className={CARD_BUTTON}>
                    <Plus aria-hidden className="size-5" strokeWidth={2} />
                    Add activity
                  </AddActivityTrigger>
                  {startActivity && (
                    <SheetTrigger sheet="start-activity" className={CARD_BUTTON}>
                      <Timer aria-hidden className="size-5" strokeWidth={2} />
                      Start activity
                    </SheetTrigger>
                  )}
                </div>
              </SectionShell>
              {/* Phone: Tonight's sleep (today only), then My journal, as in the reference app (home-09, home-03); Energy Bank
                  is Pulse's own and follows. Laptop: the journal spans the column and the Energy Bank / Tonight's sleep pair
                  shares the row below with equal heights, each footer on the row's bottom line. */}
              <div className="grid grid-cols-1 gap-3 xl:flex-1 xl:grid-cols-2 xl:grid-rows-[auto_1fr] xl:gap-4">
                {vm.isToday && (
                <SectionShell
                  variant="card"
                  title="Tonight’s sleep"
                  info={TONIGHT_INFO}
                  fill
                  className="xl:order-last"
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
                      <div className="my-auto">
                        <ReasonPlaceholder
                          reason={r}
                          nightsLeft={meta.nightsLeft}
                          size="md"
                          copy={r === "calibrating" ? "Sleep Planner needs 7 nights to learn your wake time." : undefined}
                        />
                      </div>
                    )}
                  >
                    {(plan) => <TonightPlan plan={plan} timeZone={timeZone} />}
                  </MetricState>
                </SectionShell>
                )}
                <JournalWeek vm={vm} at={at} className="xl:order-first xl:col-span-2" />
                <EnergyCard vm={vm} timeZone={timeZone} className={cn(!vm.isToday && "xl:col-span-2")} />
              </div>
            </div>
          </SectionShell>
        ),
        aside: (
          <div className="space-y-8 xl:flex xl:h-full xl:flex-col xl:space-y-0 xl:gap-8">
          {FEATURES.myPlan && vm.plan && <MyPlan plan={vm.plan} />}
          <SectionShell
            variant="section"
            title="My Dashboard"
            // the reference app's pencil on the right of the section header opens the metric picker (spec §11 CD1).
            action={<EditDashboard keys={vm.keyStats.map((s) => s.key).filter(isDashboardKey)} defaults={vm.dashboard.defaults} empty={vm.dashboard.empty} />}
            className="xl:flex xl:h-full xl:flex-col"
          >
            {/* One card per metric (V9, [latest-home-dashboard-1]). */}
            <ul className="space-y-2">
              {vm.keyStats.map((s) => (
                <li key={s.key}>
                  {s.key === "stress" ? (
                    <StressTile vm={vm} href={at("/health/stress")} timeZone={timeZone} />
                  ) : (
                    <KeyStatRow variant="card" {...statProps(s, { d, today })} />
                  )}
                </li>
              ))}
            </ul>
            {/* Hidden with fewer than two scored days: one point is not a trend (spec §7.1 row 9). */}
            {vm.strainRecovery.filter((p) => p.strain !== null || p.recovery !== null).length >= 2 && (
              <SectionShell variant="card" title="Strain & recovery" info={STRAIN_RECOVERY_INFO} fill className="mt-3 xl:mt-4 xl:flex-1">
                <StrainRecoveryChart points={vm.strainRecovery} today={d} grow />
              </SectionShell>
            )}
          </SectionShell>
          </div>
        ),
        bottom: vm.weeklyTeaser && (
          <Link href={`/reports/${vm.weeklyTeaser.period}`} className={cn(BANNER, "bg-linear-to-r from-banner-from to-banner-to")}>
            <CalendarRange aria-hidden className="size-[22px] shrink-0" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 text-base leading-[22px] font-semibold text-balance">Your week in review</span>
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

/** "Your daily outlook" before 17:00, "Your day in review" after it and on past days; opens the day's summary (spec §7.1 7a). */
function DayBanner({ outlook }: { outlook: NonNullable<HomeVM["outlook"]> }) {
  const review = outlook.kind === "review"
  const Icon = review ? Moon : Sun
  return (
    <InfoCardTrigger
      info={{ title: outlook.title, icon: <Icon />, body: <p>{outlook.body}</p> }}
      className={cn(BANNER, review ? "bg-linear-to-r from-banner-from to-banner-to" : "bg-linear-to-r from-outlook-from to-outlook-to")}
    >
      <Icon aria-hidden className="size-[22px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate text-base leading-[22px] font-semibold">{outlook.title}</span>
      <ChevronRight aria-hidden className={cn("size-5 shrink-0", review ? "text-coach" : "text-outlook-accent")} strokeWidth={1.75} />
    </InfoCardTrigger>
  )
}

/** "My journal": the week's check-ins as circles, then Behaviour insights [latest-home-collapsed-1]. */
function JournalWeek({ vm, at, className }: { vm: HomeVM; at: (href: string) => string; className?: string }) {
  return (
    <SectionShell
      variant="card"
      title="My journal"
      className={className}
      action={
        <Link href={at("/journal")} aria-label="Open Journal" className={ICON_LINK}>
          <ChevronRight aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </Link>
      }
    >
      <ol className="grid grid-cols-7 pt-1">
        {vm.journalWeek.map((w) => {
                    const current = w.day === vm.day
          return (
            <li key={w.day}>
              <Link
                href={dayHref("/journal", w.day, vm.today)}
                aria-label={`${formatDay(w.day, DAY.long)}: ${w.done ? "checked in" : "no check-in"}`}
                aria-current={current ? "date" : undefined}
                className="flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg transition-[background-color] duration-150 ease-standard outline-none hover:bg-foreground/5 focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
              >
                <span aria-hidden className={cn("text-xs leading-4 font-bold tracking-[0.1em] uppercase", current ? "text-foreground" : "text-muted-foreground")}>
                  {formatDay(w.day, { weekday: "short" })}
                </span>
                <span
                  aria-hidden
                  className={cn("grid size-7 place-items-center rounded-full", w.done ? "bg-optimal text-background" : "ring-1 ring-foreground/25 ring-inset")}
                >
                  {w.done && <Check className="size-4" strokeWidth={3} />}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
      <Link href="/journal/insights" className={cn(CARD_BUTTON, "mt-3")}>
        <Lightbulb aria-hidden className="size-5" strokeWidth={2} />
        Behaviour insights
      </Link>
    </SectionShell>
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
        {illness ? "Your body may be fighting something" : `${alert.count} ${alert.count === 1 ? "vital" : "vitals"} outside your normal range`}
      </AlertTitle>
      <AlertDescription className="col-start-2 space-y-2 text-[15px] leading-[22px] text-pretty text-foreground-secondary md:text-pretty">
        <p>
          {illness
            ? "Several vitals moved away from your normal range together, a pattern that often comes before feeling unwell. Consider an easier day."
            : `${names} ${alert.names.length === 1 ? "is" : "are"} outside your usual range. This can be an early sign of illness or heavy strain.`}
        </p>
        <Link
          href={href}
          className="relative inline-flex items-center gap-0.5 rounded-md text-xs leading-4 font-bold tracking-[0.1em] text-foreground uppercase no-underline! outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          View Health Monitor
          <ChevronRight aria-hidden className="size-3.5" strokeWidth={2} />
        </Link>
      </AlertDescription>
    </Alert>
  )
}

/**
 * A day with no band but phone data (spec §11 CD2): the phone's own numbers as Health Monitor tiles, against their
 * 30-day averages, so Home opens on what was recorded instead of three empty dials and "No readings" cards.
 */
function PhoneActivity({ stats, link }: { stats: KeyStat[]; link: { d: string; today: string } }) {
  return (
    <SectionShell variant="section" title="From your phone" aside={<span className="whitespace-nowrap">vs. 30-day avg</span>}>
      <ul className="grid grid-cols-2 gap-3 xl:gap-4">
        {stats.map((s, i) => (
          // An odd count lets the first tile (steps) span the row as a wide strip that spells out its comparison.
          <li key={s.key} className={cn("grid", stats.length % 2 === 1 && i === 0 && "col-span-2")}>
            <KeyStatRow variant="tile" {...statProps(s, link)} wide={stats.length % 2 === 1 && i === 0} />
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

/** Chip + two lines, the body of both monitor cards. */
function MonitorLine({ chip, chipClass, top, topClass, bottom }: { chip: React.ReactNode; chipClass: string; top: string; topClass?: string; bottom: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className={cn(CHIP_BOX, chipClass)}>{chip}</span>
      <span className="min-w-0">
        <span className={cn(LABEL, "block tracking-[0.06em] text-balance", topClass)}>{top}</span>
        {/* Wraps rather than truncates: "Day average" lost a pixel at 320 px. */}
        <span className={cn(CAPTION, "block text-pretty text-foreground-secondary tabular-nums")}>{bottom}</span>
      </span>
    </div>
  )
}

function MonitorCard({ vm, href }: { vm: HomeVM; href: string }) {
  const m = vm.monitor
  return (
    <SectionShell variant="card" title="Health Monitor" info={false} href={href} level={2}>
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
          bottom={`${m.value.inRange}/${m.value.total} Metrics`}
        />
      ) : (
        <MonitorLine
          chip={<TriangleAlert aria-hidden className="size-4" strokeWidth={2} />}
          chipClass="bg-warning/15 text-warning"
          top="Out of range"
          topClass="text-warning"
          bottom={`${m.value.inRange}/${m.value.total} Metrics`}
        />
      )}
    </SectionShell>
  )
}

function StressCard({ vm, href, timeZone }: { vm: HomeVM; href: string; timeZone: string }) {
  const s = vm.stress
  if (s.value === null)
    return (
      <SectionShell variant="card" title="Stress Monitor" info={false} href={href} level={2}>
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
    <SectionShell variant="card" title="Stress Monitor" info={false} href={href} level={2}>
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

/** My Dashboard's Stress Monitor tile: the latest level and the day's line (the reference app, dashboard-02). */
function StressTile({ vm, href, timeZone }: { vm: HomeVM; href: string; timeZone: string }) {
  const s = vm.stress.value
  const tone = s && STRESS_TONE[s.level]
  return (
    <SectionShell variant="card" title="Stress Monitor" info={false} href={href}>
      {s && tone && (
        <div className="-mt-1 mb-3 flex items-baseline justify-between gap-3">
          <p className={cn(CAPTION, "text-foreground-secondary")}>
            {s.at !== null ? (
              <>
                Last updated <span className="font-numeric tabular-nums">{clock(s.at, timeZone)}</span>
              </>
            ) : (
              "Day average"
            )}
          </p>
          <p className={cn(LABEL, "flex items-baseline gap-1.5", tone.text)}>
            {tone.word}
            <span className="font-numeric text-base leading-5 text-foreground tabular-nums">{formatValue("decimal1", s.value)}</span>
          </p>
        </div>
      )}
      <StressChart variant="full" data={vm.stressChart && stressSeries(vm.stressChart)} />
    </SectionShell>
  )
}

function EnergyCard({ vm, timeZone, className }: { vm: HomeVM; timeZone: string; className?: string }) {
  const e = vm.energyBank
  return (
    <SectionShell variant="card" title="Energy Bank" info={ENERGY_INFO} aside={e.value && e.provisional ? <MetricTags provisional /> : undefined} fill className={className}>
      <MetricState
        metric={e}
        skeleton={null}
        renderReason={(r, meta) => (
          // Centred when the card is stretched beside Tonight's sleep, never pinned to the top of an empty card (SYM4).
          <div className="my-auto">
            <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />
          </div>
        )}
      >
        {(eb) => (
          <div className="flex flex-1 flex-col gap-4">
            <div className="space-y-1.5">
              <TickScale variant="meter" label="Energy" metric={{ value: eb.current, reason: null, provisional: false }} min={0} max={100} format="int" unit="%" />
              <p className={CAPTION}>
                Started at <span className="font-numeric tabular-nums">{formatValue("int", eb.startLevel)}%</span> at{" "}
                <span className="font-numeric tabular-nums">{clock(eb.startAt, timeZone)}</span>
              </p>
            </div>
            <EnergyBankChart data={{ value: energySeries(eb), reason: null, provisional: false }} />
            <div className="mt-auto grid grid-cols-2 gap-3">
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
