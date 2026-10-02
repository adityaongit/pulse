import { Activity, Droplet, Footprints, Heart, Maximize2, Moon, Rabbit, Thermometer, Timer, Turtle, Wind, Zap } from "lucide-react"
import Link from "next/link"
import * as fx from "@/components/__fixtures__/kit"
import { EnergyBankChart } from "@/components/charts/EnergyBankChart"
import { Hypnogram } from "@/components/charts/Hypnogram"
import { IntradayHrChart } from "@/components/charts/IntradayHrChart"
import { StressChart } from "@/components/charts/StressChart"
import { TrendChart } from "@/components/charts/TrendChart"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { ActivityCard } from "@/components/metrics/ActivityCard"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { DayStrip, DayStripSkeleton } from "@/components/metrics/DayStrip"
import { DriverList } from "@/components/metrics/DriverList"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { DeltaMark, MetricTags, StatusChip } from "@/components/metrics/primitives"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { ScoreDial, ScoreDialSkeleton } from "@/components/metrics/ScoreDial"
import { SleepCard } from "@/components/metrics/SleepCard"
import { TickScale } from "@/components/metrics/TickScale"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { ShellStatusProvider } from "@/components/shells/ShellStatus"
import { DemoChip, SyncStatus } from "@/components/shells/TopBar"
import { Card } from "@/components/ui/card"
import { REASON_CODES } from "@/lib/reasons"
import { HealthspanList, SelectableImpact, SelectableTile, SheetDemo } from "./Islands"

const STAT_ICON: Record<string, React.ReactNode> = {
  hrv: <Activity />,
  rhr: <Heart />,
  rr: <Wind />,
  sleep: <Moon />,
  cal: <Zap />,
  steps: <Footprints />,
  spo2: <Droplet />,
  temp: <Thermometer />,
  max: <Heart />,
  dur: <Timer />,
  hours: <Moon />,
  consistency: <Moon />,
  efficiency: <Moon />,
  restorative: <Moon />,
}

function Specimen({ name, children, className }: { name: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 text-xs leading-4 font-medium text-muted-foreground">{name}</p>
      {children}
    </div>
  )
}

const ROWS = "rounded-xl bg-card px-4 py-1 divide-y divide-border"

export default function KitPage() {
  return (
    <PageShell title="Component kit" dateSwitcher={{ mode: "day" }} actions={<SheetDemo />}>
      <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
        Every shell and kit component in every state, from typed fixtures. Also see{" "}
        <Link className="underline underline-offset-4" href="/dev/kit/detail">
          DetailShell
        </Link>{" "}
        and{" "}
        <Link className="underline underline-offset-4" href="/dev/kit/home">
          PageShell home and grid-2
        </Link>
        .
      </p>

      <SectionShell variant="section" title="Shell status" aside="ShellStatus context">
        <div className="grid gap-3">
          {fx.googleStatuses.map(({ name, status }) => (
            <ShellStatusProvider key={name} value={status}>
              <Specimen name={name}>
                <div className="@container mb-2 flex items-center gap-2">
                  <SyncStatus />
                  <DemoChip />
                </div>
                <ConnectionBanner />
              </Specimen>
            </ShellStatusProvider>
          ))}
          <ShellStatusProvider value={{ ...fx.status, sync: { state: "syncing", lastSuccessAt: fx.status.sync.lastSuccessAt } }}>
            <Specimen name="Demo, syncing (the banner never shows in demo mode)">
              <div className="@container flex items-center gap-2">
                <SyncStatus />
                <DemoChip />
              </div>
            </Specimen>
          </ShellStatusProvider>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Day strip">
        <div className="-mx-4 space-y-4 md:mx-0">
          <DayStrip indicator="recovery" days={fx.stripDays} />
          <DayStrip indicator="journal" days={fx.stripDays} />
          <DayStripSkeleton />
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Score dials">
        <div className="space-y-6">
          <Specimen name="Home row: three equal md dials, links, strain target and So far">
            <div className="flex items-start justify-center gap-2">
              <ScoreDial variant="sleep" size="md" value={74} href="/sleep" />
              <ScoreDial variant="recovery" size="md" value={85} href="/recovery" />
              <ScoreDial variant="strain" size="md" value={9.4} target={[12, 15]} extraTags={["so_far"]} href="/strain" />
            </div>
          </Specimen>
          <Specimen name="Reason (Home): track only, one ReasonPlaceholder line">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-start justify-center gap-2">
                <ScoreDial variant="sleep" size="md" value={null} reason="awaiting_sleep_sync" />
                <ScoreDial variant="recovery" size="md" value={null} reason="calibrating" nightsLeft={4} />
                <ScoreDial variant="strain" size="md" value={16.8} target={[12, 15]} />
              </div>
              <ReasonPlaceholder reason="calibrating" nightsLeft={4} size="sm" />
            </div>
          </Specimen>
          <Specimen name="Loading">
            <div className="flex items-start justify-center gap-2">
              <ScoreDialSkeleton size="md" />
              <ScoreDialSkeleton size="md" />
              <ScoreDialSkeleton size="md" />
            </div>
          </Specimen>
          <div className="grid gap-6 md:grid-cols-2">
            <Specimen name="lg recovery, provisional">
              <ScoreDial variant="recovery" size="lg" value={58} provisional />
            </Specimen>
            <Specimen name="lg recovery, red, baseline stale">
              <ScoreDial variant="recovery" size="lg" value={28} tags={["stale_baseline"]} />
            </Specimen>
            <Specimen name="lg recovery, reason">
              <ScoreDial variant="recovery" size="lg" value={null} reason="calibrating" nightsLeft={4} />
            </Specimen>
            <Specimen name="lg strain with target">
              <ScoreDial variant="strain" size="lg" value={13.1} target={[12, 15]} extraTags={["so_far"]} />
            </Specimen>
            <Specimen name="lg sleep, updated">
              <ScoreDial variant="sleep" size="lg" value={84} tags={["updated"]} />
            </Specimen>
            <Specimen name="lg stress gauge">
              <ScoreDial variant="gauge" size="lg" value={1.5} caption="Last updated 15:05" />
            </Specimen>
            <Specimen name="lg gauge, reason">
              <ScoreDial variant="gauge" size="lg" value={null} reason="band_not_worn" />
            </Specimen>
            <Specimen name="lg loading">
              <ScoreDialSkeleton size="lg" />
            </Specimen>
          </div>
          <Specimen name="sm stat dials (forecast, reports)">
            <div className="flex flex-wrap items-start gap-4">
              <ScoreDial variant="stat" size="sm" value={71} max={100} color="recovery-green" unit="%" label="Tomorrow" extraTags={["estimate"]} />
              <ScoreDial variant="stat" size="sm" value={11.2} max={21} color="strain" format="decimal1" label="Avg strain" />
              <ScoreDial variant="stat" size="sm" value={null} reason="calibrating" label="Forecast" />
              <ScoreDialSkeleton size="sm" />
            </div>
          </Specimen>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Key statistics" aside="vs. 30-day average">
        <div className="space-y-4">
          <div className={ROWS}>
            {fx.keyStats.map(({ key, ...s }) => (
              <KeyStatRow key={key} variant="row" icon={STAT_ICON[key]} href="/recovery" {...s} />
            ))}
            <KeyStatRow variant="row" label="Loading" metric={undefined} format="int" direction="up" />
            <KeyStatRow variant="row" label="Strain Target" metric={fx.ok(12)} format="decimal1" direction="none" caption="Estimate" />
          </div>
          <Specimen name="Sleep rows with status segments">
            <div className={ROWS}>
              {fx.sleepRows.map(({ key, ...s }) => (
                <KeyStatRow key={key} variant="row" icon={STAT_ICON[key]} unit="%" format="int" direction="none" {...s} />
              ))}
            </div>
            <div className="mt-2 flex gap-4 rounded-lg bg-inset px-3 py-2 text-xs leading-4 font-medium text-foreground-secondary">
              <span className="inline-flex items-center gap-1.5"><span className="h-1 w-4 rounded-sm bg-warning" />Poor</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1 w-4 rounded-sm bg-foreground-secondary" />Sufficient</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-1 w-4 rounded-sm bg-optimal" />Optimal</span>
            </div>
          </Specimen>
          <Specimen name="Tiles: chips, out of range, reason, provisional, vs. average, loading, selectable">
            <div className="grid grid-cols-2 gap-3">
              {fx.vitals.map(({ key, ...v }) => (
                <KeyStatRow key={key} variant="tile" icon={STAT_ICON[key]} direction="neutral" {...v} />
              ))}
              {fx.activityTiles.map(({ key, ...v }) => (
                <KeyStatRow key={key} variant="tile" icon={STAT_ICON[key]} {...v} />
              ))}
              <KeyStatRow variant="tile" label="Loading" metric={undefined} format="int" direction="up" />
              <SelectableTile />
            </div>
          </Specimen>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Contributors">
        <div className="space-y-4">
          <Card className="gap-0 px-4 py-1 ring-0">
            <div className="divide-y divide-border">
              {fx.contributors.map(({ key, ...c }) => (
                <ContributorRow key={key} variant="recovery" icon={STAT_ICON[key]} {...c} />
              ))}
              <ContributorRow.Skeleton />
            </div>
            <p className="my-3 rounded-lg bg-inset px-3 py-2 text-xs leading-4 font-medium text-foreground-secondary">
              Dot: today. Shaded: your normal range.
            </p>
          </Card>
          <Card className="gap-0 px-4 py-1 ring-0">
            <HealthspanList />
          </Card>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Drivers">
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionShell variant="card" title="What shaped it" id="drivers" info={{ title: "What shaped it", body: <p>Each bar is one input&apos;s effect on today&apos;s Recovery, in points.</p> }}>
            <DriverList variant="recovery" unit="pts" data={fx.recoveryDrivers} />
          </SectionShell>
          <Specimen name="Impact, provisional, selectable (page level, no card)">
            <SelectableImpact />
          </Specimen>
          <SectionShell variant="card" title="Empty (recovery)">
            <DriverList variant="recovery" unit="pts" data={null} />
          </SectionShell>
          <SectionShell variant="card" title="Empty (impact)">
            <DriverList variant="impact" unit="%" data={fx.ok([])} />
          </SectionShell>
          <SectionShell variant="card" title="Loading">
            <DriverList variant="recovery" unit="pts" data={undefined} />
          </SectionShell>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Insight and scales">
        <div className="space-y-6">
          <InsightCard {...fx.insight} />
          <InsightCard body="Early estimate: your Pace of Aging slowed by 0.4x this week, mostly from VO2 max." />
          <InsightCard.Skeleton />
          <Specimen name="TickScale marker (Pace of Aging)">
            <TickScale
              variant="marker"
              label="Pace of Aging"
              metric={fx.ok(0.8)}
              min={-1}
              max={3}
              format="decimal1"
              unit="x"
              describe="aging slower than your 6-month average"
              ends={["−1.0x", "1.0x", "3.0x"]}
              leading={<><Turtle aria-hidden strokeWidth={1.75} />Slow</>}
              trailing={<>Fast<Rabbit aria-hidden strokeWidth={1.75} /></>}
            />
          </Specimen>
          <Specimen name="TickScale marker with bands (ACWR), provisional">
            <TickScale
              variant="marker"
              label="Training load"
              metric={fx.ok(1.12, { provisional: true })}
              min={0}
              max={2}
              format="decimal2"
              bands={[{ from: 0.8, to: 1.3, tone: "optimal" }, { from: 1.5, to: 2, tone: "warning" }]}
              ends={["0.0", "1.0", "2.0"]}
            />
          </Specimen>
          <Specimen name="TickScale meter (Energy), reason, loading">
            <div className="space-y-4">
              <TickScale variant="meter" label="Energy" metric={fx.ok(62)} min={0} max={100} format="int" unit="%" />
              <TickScale variant="meter" label="Energy" metric={fx.ok(24)} min={0} max={100} format="int" unit="%" />
              <TickScale variant="meter" label="Energy" metric={fx.why("awaiting_sleep_sync")} min={0} max={100} format="int" unit="%" />
              <TickScale variant="meter" label="Energy" metric={undefined} min={0} max={100} format="int" unit="%" />
            </div>
          </Specimen>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="My Day">
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionShell
            variant="card"
            title="Today's activities"
            action={
              <Link href="/strain" aria-label="Open Strain" className="relative -my-2 -mr-2 grid size-10 place-items-center rounded-full text-foreground-secondary outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                <Maximize2 aria-hidden className="size-[18px]" strokeWidth={1.75} />
              </Link>
            }
          >
            <div className="space-y-1.5">
              <SleepCard {...fx.timeline.sleep} timeZone={fx.TZ} />
              <ActivityCard {...fx.timeline.run} timeZone={fx.TZ} />
              <SleepCard {...fx.timeline.nap} timeZone={fx.TZ} />
              <ActivityCard {...fx.timeline.strength} timeZone={fx.TZ} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Activities" action={{ label: "View all", href: "/strain" }}>
            <ActivityCard.Skeleton />
            <EmptyState body="No activities yet today. Workouts appear after Fitbit syncs them." />
          </SectionShell>
          <SectionShell variant="card" title="Energy Bank" info={{ title: "Energy Bank", body: <p>Energy Bank estimates how much energy you have left today, from 0 to 100.</p> }} aside={<MetricTags provisional />}>
            <div className="space-y-3">
              <TickScale variant="meter" label="Energy" metric={fx.ok(62)} min={0} max={100} format="int" unit="%" />
              <p className="text-xs leading-4 font-medium text-muted-foreground">Started at 81% at 06:40</p>
              <EnergyBankChart data={fx.ok(fx.energy)} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Health Monitor" href="/health/monitor">
            <div className="flex items-center gap-3">
              <StatusChip tone="optimal">Within range</StatusChip>
              <span className="text-xs leading-4 font-medium text-muted-foreground">5/5 metrics</span>
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Energy Bank states">
            <div className="space-y-2">
              <EnergyBankChart data={fx.why("awaiting_sleep_sync")} />
              <EnergyBankChart data={null} />
              <EnergyBankChart data={undefined} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Stress Monitor" href="/health/stress">
            <StressChart variant="spark" data={fx.ok(fx.stress)} />
            <StressChart variant="spark" data={fx.ok({ points: [] })} />
          </SectionShell>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="Charts">
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionShell variant="card" title="Recovery trend" className="lg:col-span-2">
            <TrendChart label="Recovery" data={fx.ok(fx.recoveryTrend)} unit="%" format="int" colorBy="band" direction="up" deltas={{ w: 4, m: -3, "6m": 2 }} baseline={{ mean: 62, sd: 12 }} />
          </SectionShell>
          <SectionShell variant="card" title="Strain trend">
            <TrendChart label="Strain" data={fx.ok(fx.strainTrend)} format="decimal1" colorBy="strain" target={[12, 15]} deltas={{ m: 0.8 }} />
          </SectionShell>
          <SectionShell variant="card" title="Sleep debt">
            <TrendChart label="Sleep debt" data={fx.ok(fx.sleepDebtTrend)} unit="h" format="decimal1" colorBy="sleep" direction="down" deltas={{ m: -0.4 }} />
          </SectionShell>
          <SectionShell variant="card" title="30-day stress (fixed range)">
            <TrendChart label="Stress" data={fx.ok(fx.stressTrend)} format="decimal1" colorBy="stress" fixedRange="m" />
          </SectionShell>
          <SectionShell variant="card" title="Trend: empty and loading">
            <TrendChart label="Recovery" data={fx.ok(fx.emptyTrend)} unit="%" format="int" colorBy="band" />
            <TrendChart label="Recovery" data={undefined} format="int" colorBy="band" />
          </SectionShell>
          <SectionShell variant="card" title="Sleep stages">
            <Hypnogram data={fx.ok(fx.night)} />
          </SectionShell>
          <SectionShell variant="card" title="Hypnogram states">
            <div className="space-y-2">
              <Hypnogram data={fx.ok({ ...fx.night, segments: [] })} />
              <Hypnogram data={fx.why("awaiting_sleep_sync")} />
              <Hypnogram data={undefined} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Heart rate" className="lg:col-span-2">
            <IntradayHrChart data={fx.ok(fx.hrDay)} />
          </SectionShell>
          <SectionShell variant="card" title="Activity heart rate">
            <IntradayHrChart variant="activity" data={fx.ok(fx.hrActivity)} />
          </SectionShell>
          <SectionShell variant="card" title="Heart rate states">
            <div className="space-y-2">
              <IntradayHrChart data={fx.ok({ points: [] })} />
              <IntradayHrChart data={fx.why("insufficient_hr_data")} />
              <IntradayHrChart data={undefined} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Stress" className="lg:col-span-2">
            <StressChart variant="full" data={fx.ok(fx.stress)} />
          </SectionShell>
          <SectionShell variant="card" title="Stress states">
            <div className="space-y-2">
              <StressChart variant="full" data={fx.ok({ points: [] })} />
              <StressChart variant="full" data={fx.why("band_not_worn")} />
              <StressChart variant="spark" data={fx.why("band_not_worn")} />
              <StressChart variant="spark" data={undefined} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Time in zones">
            <ZoneBars variant="rows" data={fx.ok(fx.zones)} maxHr={186} />
          </SectionShell>
          <SectionShell variant="card" title="Recovery breakdown" aside={<span className="text-xs font-medium text-muted-foreground">Days</span>}>
            <div className="space-y-6">
              <ZoneBars variant="stacked" unit="days" data={fx.ok(fx.recoveryBreakdown)} />
              <ZoneBars variant="stacked" unit="minutes" data={fx.ok(fx.stressMinutes)} />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Zone states">
            <div className="space-y-4">
              <ZoneBars variant="rows" data={null} />
              <ZoneBars variant="stacked" unit="days" data={fx.ok([])} />
              <ZoneBars variant="rows" data={undefined} />
              <ZoneBars variant="stacked" unit="days" data={undefined} />
            </div>
          </SectionShell>
        </div>
      </SectionShell>

      <SectionShell variant="section" title="States and marks">
        <div className="grid gap-3 lg:grid-cols-2">
          <SectionShell variant="card" title="Reason placeholders">
            <div className="space-y-3">
              {REASON_CODES.map((r) => (
                <div key={r} className="flex flex-wrap items-center gap-4">
                  <ReasonPlaceholder reason={r} nightsLeft={4} size="sm" />
                </div>
              ))}
              <ReasonPlaceholder reason="unknown_code" size="md" />
              <ReasonPlaceholder reason="no_hrv_last_night" size="lg" />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="MetricState">
            <div className="space-y-2 text-[15px] leading-[22px]">
              {[
                ["loading", undefined],
                ["empty", null],
                ["reason", fx.why<number>("band_not_worn")],
                ["provisional", fx.ok(58, { provisional: true })],
                ["value", fx.ok(72)],
                ["non-finite", fx.ok(Number.NaN)],
              ].map(([name, metric]) => (
                <div key={String(name)} className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">{String(name)}</span>
                  <MetricState
                    metric={metric as Parameters<typeof MetricState<number>>[0]["metric"]}
                    skeleton={<span className="h-4 w-12 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />}
                    reasonSize="sm"
                    empty={<span className="text-muted-foreground">No history</span>}
                  >
                    {(v, meta) => (
                      <span className="flex items-center gap-2">
                        <span className="font-numeric font-bold tabular-nums">{v}%</span>
                        <MetricTags provisional={meta.provisional} tags={meta.tags} />
                      </span>
                    )}
                  </MetricState>
                </div>
              ))}
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Chips, tags, deltas">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="optimal">within 16.1 - 16.9</StatusChip>
              <StatusChip tone="warning">Out of range</StatusChip>
              <StatusChip tone="alert">Illness signal</StatusChip>
              <StatusChip tone="neutral" delta="up">151 bpm</StatusChip>
              <MetricTags provisional tags={["stale_baseline", "updated"]} extra={["so_far", "partial_week", "partial_month", "estimate"]} />
              <DeltaMark dir="up" tone="good" />
              <DeltaMark dir="down" tone="bad" />
              <DeltaMark dir="up" tone="neutral" />
              <DeltaMark dir="flat" tone="neutral" />
            </div>
          </SectionShell>
          <SectionShell variant="card" title="Empty state">
            <EmptyState icon={Timer} body="Couldn't load this screen." action={{ label: "Try again", href: "/dev/kit" }} />
          </SectionShell>
        </div>
      </SectionShell>
    </PageShell>
  )
}
