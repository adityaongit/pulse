// Route loading states (spec §5.19): the real shells and each section's own box with its static
// titles and labels; only values are bars, so nothing moves when data arrives. Headers never skeleton.
import { Fragment } from "react"
import { IntradayHrChartSkeleton } from "@/components/charts/IntradayHrChart"
import { StrainRecoveryChartSkeleton } from "@/components/charts/StrainRecoveryChart"
import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { ZoneBarsSkeleton } from "@/components/charts/ZoneBars"
import { TimelineSkeleton } from "@/components/metrics/ActivityCard"
import { ContributorRowSkeleton } from "@/components/metrics/ContributorRow"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { ScoreDialSkeleton } from "@/components/metrics/ScoreDial"
import { SleepStagesSkeleton } from "@/components/metrics/SleepStages"
import { DetailShell } from "@/components/shells/DetailShell"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { CAPTION, LABEL, LEGEND, STAT_ICON } from "./view"

const rows = (n: number, Row: (i: number) => React.ReactNode) => Array.from({ length: n }, (_, i) => <Fragment key={i}>{Row(i)}</Fragment>)

/** Home's My Dashboard rows, in the order getHome returns them (server/queries/home.ts keyStats). */
const HOME_STATS: [string, string][] = [
  ["hrv", "Heart rate variability"],
  ["rhr", "Resting heart rate"],
  ["resp", "Respiratory rate"],
  ["sleep", "Sleep performance"],
  ["calories", "Calories"],
  ["steps", "Steps"],
  ["spo2", "Blood oxygen"],
  ["skin", "Skin temperature"],
]
const SUMMARY: Record<string, string[]> = {
  Strain: ["Strain Target", "Heart rate zones 1‑3", "Heart rate zones 4‑5", "Strength activity time", "Steps"],
  Sleep: ["Hours vs. needed", "Sleep consistency", "Sleep efficiency", "Restorative sleep"],
}
const SECONDARY: Record<string, string[]> = {
  Recovery: ["What shaped it", "Tomorrow's forecast"],
  Strain: ["Time in zones", "Activities", "Strain trend"],
  Sleep: ["Hours vs. need", "Details", "Sleep debt", "Tonight's sleep"],
}

function CardSkeleton({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <SectionShell variant="card" title={title} level={2} className={className}>
      <div aria-hidden>{children}</div>
    </SectionShell>
  )
}

/** A monitor card body: the chip box and two lines. */
function MonitorLineSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-7 rounded-md" />
      <span className="min-w-0 flex-1">
        <SkeletonText className={`${LABEL} w-24`} />
        <SkeletonText className={`${CAPTION} w-16`} />
      </span>
    </div>
  )
}

export function HomeSkeleton() {
  return (
    <PageShell
      title="Home"
      layout="home"
      slots={{
        top: (
          <div aria-busy className="pt-4 xl:pt-2">
            <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:items-center xl:gap-x-6">
              <div className="space-y-4">
                <p aria-hidden className="text-center text-[13px] leading-4 font-semibold tracking-[0.35em] text-foreground-secondary uppercase">
                  Pulse
                </p>
                <div className="grid grid-cols-3 items-start justify-items-center">
                  <ScoreDialSkeleton size="md" variant="sleep" />
                  <ScoreDialSkeleton size="md" variant="recovery" />
                  <ScoreDialSkeleton size="md" variant="strain" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-1 xl:gap-4">
                <CardSkeleton title="Health Monitor">
                  <MonitorLineSkeleton />
                </CardSkeleton>
                <CardSkeleton title="Stress Monitor">
                  <MonitorLineSkeleton />
                </CardSkeleton>
              </div>
            </div>
          </div>
        ),
        main: (
          <SectionShell variant="section" title="My Day" action={<span aria-hidden className="block size-[34px] rounded-[10px] bg-foreground/90" />}>
            <div className="space-y-3 xl:space-y-4">
              <CardSkeleton title="Today's activities">
                <TimelineSkeleton />
              </CardSkeleton>
              <CardSkeleton title="My journal">
                <div className="grid grid-cols-7 pt-1">
                  {rows(7, () => (
                    <div className="flex min-h-16 flex-col items-center justify-center gap-2">
                      <SkeletonText className={`${LABEL} w-[3ch]`} />
                      <span className="size-7 rounded-full ring-1 ring-white/25 ring-inset" />
                    </div>
                  ))}
                </div>
                <Skeleton className="mt-3 h-12 rounded-xl" />
              </CardSkeleton>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
                <CardSkeleton title="Energy Bank">
                  <Skeleton className="h-[300px] rounded-lg bg-muted/60" />
                </CardSkeleton>
                <CardSkeleton title="Tonight's sleep">
                  <Skeleton className="h-[124px] rounded-lg bg-muted/60" />
                </CardSkeleton>
              </div>
            </div>
          </SectionShell>
        ),
        aside: (
          <SectionShell variant="section" title="My Dashboard" aside="vs. 30-day average">
            <ul aria-hidden className="space-y-2">
              {HOME_STATS.map(([key, label]) => (
                <li key={key}>
                  <KeyStatRowSkeleton variant="card" label={label} icon={STAT_ICON[key]} />
                </li>
              ))}
            </ul>
            <CardSkeleton title="Strain & recovery" className="mt-3 xl:mt-4">
              <StrainRecoveryChartSkeleton />
            </CardSkeleton>
          </SectionShell>
        ),
      }}
    />
  )
}

const PRIMARY: Record<string, string> = { hr: "Heart rate", stages: "Sleep stages" }
const DIAL: Record<string, "recovery" | "strain" | "sleep"> = { Recovery: "recovery", Strain: "strain", Sleep: "sleep" }

export function DetailSkeleton({
  title,
  chart = "trend",
  dateSwitcher = true,
  ground,
}: {
  title: string
  chart?: "trend" | "hr" | "stages"
  dateSwitcher?: boolean
  ground?: "default" | "healthspan"
}) {
  const labels = SUMMARY[title] ?? ["", "", "", ""]
  return (
    <DetailShell
      title={title}
      ground={ground}
      dateSwitcher={dateSwitcher ? { mode: "day", placement: DIAL[title] ? "header" : "body" } : undefined}
      notch={!!DIAL[title]}
      hero={<ScoreDialSkeleton size="lg" variant={DIAL[title] ?? "stat"} />}
      summary={
        <Card aria-hidden className="gap-0 px-4 py-1">
          <div className="divide-y divide-border">
            {title === "Recovery" ? rows(5, () => <ContributorRowSkeleton />) : labels.map((l, i) => <KeyStatRowSkeleton key={i} variant="row" label={l} />)}
          </div>
          <p className={LEGEND}>
            <SkeletonText className="w-40" />
          </p>
        </Card>
      }
      insight={<InsightCardSkeleton />}
      primary={
        <CardSkeleton title={PRIMARY[chart] ?? `${title} trend`}>
          {chart === "hr" ? <IntradayHrChartSkeleton /> : chart === "stages" ? <SleepStagesSkeleton /> : <TrendChartSkeleton />}
        </CardSkeleton>
      }
      secondary={(SECONDARY[title] ?? ["", ""]).map((t, i) => (
        <CardSkeleton key={`${i}-${t}`} title={t} className={t === "Time in zones" ? "xl:row-span-2" : undefined}>
          {t === "Time in zones" ? (
            <ZoneBarsSkeleton variant="rows" />
          ) : t === "Activities" ? (
            <TimelineSkeleton />
          ) : t.endsWith("trend") || t === "Sleep debt" ? (
            <TrendChartSkeleton />
          ) : (
            <Skeleton className="h-40 rounded-lg bg-muted/60" />
          )}
        </CardSkeleton>
      ))}
    />
  )
}

export function ActivitySkeleton() {
  return (
    <DetailShell
      title="Activity"
      align="start"
      hero={
        <div aria-hidden className="flex w-full flex-wrap items-end gap-x-10 gap-y-3">
          {["Activity strain", "Duration"].map((l) => (
            <div key={l}>
              <SkeletonText className="w-[3ch] font-numeric text-[44px] leading-none font-bold" />
              <p className={`${LABEL} mt-2 text-foreground-secondary`}>{l}</p>
            </div>
          ))}
        </div>
      }
      primary={
        <div aria-hidden className="space-y-6">
          <IntradayHrChartSkeleton variant="activity" />
          <ZoneBarsSkeleton variant="rows" />
        </div>
      }
      secondary={[
        <SectionShell key="stats" variant="section" title="Key statistics" aside="vs. 30-day average" level={2}>
          <div aria-hidden className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:gap-4">
            {[
              ["avgHr", "Average heart rate"],
              ["maxHr", "Max heart rate"],
              ["calories", "Calories"],
            ].map(([k, l]) => (
              <KeyStatRowSkeleton key={k} variant="tile" label={l} icon={STAT_ICON[k]} />
            ))}
          </div>
        </SectionShell>,
        <CardSkeleton key="hrr" title="Heart rate recovery">
          <Skeleton className="h-24 rounded-lg bg-muted/60" />
        </CardSkeleton>,
      ]}
    />
  )
}
