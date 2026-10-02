// Route loading states: the real shells with each section's `.Skeleton` in its final shape (spec §7).
import { HypnogramSkeleton } from "@/components/charts/Hypnogram"
import { IntradayHrChartSkeleton } from "@/components/charts/IntradayHrChart"
import { TrendChartSkeleton } from "@/components/charts/TrendChart"
import { TimelineSkeleton } from "@/components/metrics/ActivityCard"
import { ContributorRowSkeleton } from "@/components/metrics/ContributorRow"
import { DayStripSkeleton } from "@/components/metrics/DayStrip"
import { InsightCardSkeleton } from "@/components/metrics/InsightCard"
import { KeyStatRowSkeleton } from "@/components/metrics/KeyStatRow"
import { ScoreDialSkeleton } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const rows = (n: number, Row: () => React.ReactNode) => Array.from({ length: n }, (_, i) => <Row key={i} />)
const StatRow = () => <KeyStatRowSkeleton variant="row" />

function RowsCard({ n, Row = StatRow }: { n: number; Row?: () => React.ReactNode }) {
  return (
    <Card className="gap-0 px-4 py-1 ring-0">
      <div className="divide-y divide-border">{rows(n, Row)}</div>
    </Card>
  )
}

function CardSkeleton({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <SectionShell variant="card" title={title} level={2}>
      {children}
    </SectionShell>
  )
}

export function HomeSkeleton() {
  return (
    <PageShell
      title="Home"
      dateSwitcher={{ mode: "day" }}
      layout="home"
      slots={{
        top: (
          <div aria-busy className="space-y-6">
            <div className="-mx-4 md:mx-0">
              <DayStripSkeleton />
            </div>
            <div className="grid grid-cols-3 justify-items-center pt-8">
              {rows(3, () => (
                <ScoreDialSkeleton size="md" />
              ))}
            </div>
          </div>
        ),
        right: (
          <div className="space-y-3">
            <Skeleton className="h-7 w-28" />
            <CardSkeleton title="Today's activities">
              <TimelineSkeleton />
            </CardSkeleton>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ),
        left: (
          <div className="space-y-3">
            <Skeleton className="h-7 w-36" />
            <RowsCard n={8} />
          </div>
        ),
      }}
    />
  )
}

const PRIMARY: Record<string, string> = { hr: "Heart rate", stages: "Sleep stages" }

export function DetailSkeleton({ title, chart = "trend", dateSwitcher = true }: { title: string; chart?: "trend" | "hr" | "stages"; dateSwitcher?: boolean }) {
  return (
    <DetailShell
      title={title}
      dateSwitcher={dateSwitcher ? { mode: "day" } : undefined}
      hero={<ScoreDialSkeleton size="lg" />}
      summary={title === "Recovery" ? <RowsCard n={5} Row={ContributorRowSkeleton} /> : <RowsCard n={4} />}
      insight={<InsightCardSkeleton />}
      primary={
        <CardSkeleton title={PRIMARY[chart] ?? `${title} trend`}>
          {chart === "hr" ? <IntradayHrChartSkeleton /> : chart === "stages" ? <HypnogramSkeleton /> : <TrendChartSkeleton />}
        </CardSkeleton>
      }
      secondary={[<Skeleton key="a" className="h-56 rounded-xl" />, <Skeleton key="b" className="h-56 rounded-xl" />]}
    />
  )
}

export function ActivitySkeleton() {
  return (
    <DetailShell
      title="Activity"
      hero={
        <div aria-hidden className="flex flex-col items-center gap-2 py-2">
          <Skeleton className="size-12 rounded-full" />
          <Skeleton className="h-14 w-28 rounded-md" />
          <Skeleton className="h-3 w-24" />
        </div>
      }
      summary={<div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:gap-4">{rows(4, () => <KeyStatRowSkeleton variant="tile" />)}</div>}
      primary={
        <CardSkeleton title="Heart rate">
          <IntradayHrChartSkeleton variant="activity" />
        </CardSkeleton>
      }
      secondary={[<Skeleton key="a" className="h-72 rounded-xl" />, <Skeleton key="b" className="h-40 rounded-xl" />]}
    />
  )
}
