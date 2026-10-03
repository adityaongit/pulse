import { Activity, Heart, Moon, Thermometer, Wind } from "lucide-react"
import { BAND_COLOR } from "@/lib/bands"
import type { FormatKey } from "@/lib/format"
import { reasonCopy } from "@/lib/reasons"
import { TrendChart } from "@/components/charts/TrendChart"
import { ContributorRow } from "@/components/metrics/ContributorRow"
import { DriverList } from "@/components/metrics/DriverList"
import { InsightCard } from "@/components/metrics/InsightCard"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"
import { getRecovery } from "@/server/queries/recovery"
import type { Contributor, RecoveryVM } from "@/server/queries/types"
import { pageDay, type SearchParams } from "../_lib/day"
import { RECOVERY_INFO } from "../_lib/info"
import { CAPTION, LEGEND, trendProps } from "../_lib/view"

export const metadata = { title: "Recovery", description: "What shaped your Recovery: HRV, resting heart rate, breathing, sleep and skin temperature against your baseline." }

const ICON: Record<Contributor["key"], React.ReactNode> = { hrv: <Activity />, rhr: <Heart />, resp: <Wind />, sleep: <Moon />, skinTemp: <Thermometer /> }
const FORMAT: Record<Contributor["key"], FormatKey> = { hrv: "int", rhr: "int", resp: "decimal1", sleep: "int", skinTemp: "signed1" }

/** Recovery `/recovery?d=` (spec §7.2). */
export default async function RecoveryPage({ searchParams }: PageProps<"/recovery">) {
  const { d, weekly } = await pageDay(searchParams as SearchParams, "/recovery")
  const vm = getRecovery(d)
  const r = vm.recovery
  const trend = trendProps(vm.trend)

  return (
    <DetailShell
      title="Recovery"
      info={RECOVERY_INFO}
      dateSwitcher={{ mode: "day", placement: "header" }}
      notch
      hero={<ScoreDial variant="recovery" size="lg" value={r.value} reason={r.reason} nightsLeft={r.nightsLeft} provisional={r.provisional} tags={r.tags} />}
      summary={
        <Card className="gap-0 px-4 py-1 ring-0">
          <div className="divide-y divide-border">
            {vm.contributors.map((c) => (
              <ContributorItem key={c.key} c={c} nightsLeft={r.nightsLeft} />
            ))}
          </div>
          <p className={LEGEND}>Dot: today. Shaded: your normal range.</p>
        </Card>
      }
      insight={vm.insight && <InsightCard body={vm.insight} action={{ label: "See what shaped it", href: "#drivers" }} />}
      primary={
        <SectionShell variant="card" title={weekly ? "Weekly trends" : "Recovery trend"} level={2}>
          <TrendChart label="Recovery" unit="%" format="int" colorBy="band" direction="up" {...trend} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="drivers" variant="card" title="What shaped it" id="drivers" level={2}>
          <Drivers vm={vm} />
        </SectionShell>,
        <SectionShell key="forecast" variant="card" title="Tomorrow's forecast" level={2} className="xl:self-start">
          <Forecast vm={vm} />
        </SectionShell>,
      ]}
    />
  )
}

/** A contributor without a usable baseline (calibrating) reads as its reason rather than a bare number. */
function ContributorItem({ c, nightsLeft }: { c: Contributor; nightsLeft?: number }) {
  const metric = c.baseline || c.metric.value === null ? c.metric : { value: null, reason: "calibrating" as const, provisional: false, nightsLeft }
  const reason = metric.reason && metric.reason !== "no_data" ? reasonCopy(metric.reason, metric.nightsLeft ?? nightsLeft).long : undefined
  return (
    <ContributorRow
      variant="recovery"
      icon={ICON[c.key]}
      label={c.label}
      unit={c.unit}
      format={FORMAT[c.key]}
      metric={metric}
      baseline={c.baseline ?? { mean: 0, sd: 1 }}
      points={c.points}
      direction={c.direction}
      reasonCopy={reason}
    />
  )
}

function Drivers({ vm }: { vm: RecoveryVM }) {
  const m = vm.drivers
  if (m.value === null && m.reason === "calibrating") return <EmptyState body="No drivers yet: Recovery needs 7 nights first." />
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  return <DriverList variant="recovery" unit="pts" data={m} />
}

function Forecast({ vm }: { vm: RecoveryVM }) {
  const f = vm.forecast
  if (f.value === null)
    return (
      <ReasonPlaceholder
        reason={f.reason}
        nightsLeft={f.nightsLeft}
        size="sm"
        copy={f.reason === "calibrating" ? "Forecast starts after 14 nights." : undefined}
      />
    )
  return (
    <div className="flex items-center gap-4">
      <ScoreDial variant="stat" size="sm" value={f.value.value} max={100} color={BAND_COLOR[f.value.band]} unit="%" label="Tomorrow" extraTags={["estimate"]} />
      <p className={`${CAPTION} min-w-0 text-pretty`}>Estimate. Based on today&apos;s strain and your recent trend.</p>
    </div>
  )
}
