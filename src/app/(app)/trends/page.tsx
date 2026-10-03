import { connection } from "next/server"
import { RANGES, type TrendRange } from "@/lib/url"
import { getTrends, parseTrendMetric } from "@/server/queries/trends"
import { TrendChart } from "@/components/charts/TrendChart"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { mapMetric } from "../_lib/view"
import { MetricPicker, PERIOD, TRENDS_GRID } from "./parts"

export const metadata = { title: "Trends" }

/** Trends `/trends?metric=&r=` (More, U21): one daily metric over up to a year, each range against the one before. */
export default async function TrendsPage({ searchParams }: PageProps<"/trends">) {
  await connection()
  const sp = await searchParams
  const m = parseTrendMetric(sp.metric)
  const r = typeof sp.r === "string" && (RANGES as readonly string[]).includes(sp.r) ? sp.r : undefined
  const vm = getTrends(m.key)
  const deltas = Object.fromEntries(
    vm.periods.map((p) => [p.range, p.average.value === null || p.prior === null ? null : Math.round((p.average.value - p.prior) * 10) / 10])
  ) as Record<TrendRange, number | null>

  return (
    <DetailShell
      title="Trends"
      primary={
        <div className="flex flex-col gap-4 xl:gap-6">
          <MetricPicker current={m.key} r={r} />
          <div className={TRENDS_GRID}>
            <SectionShell variant="card" level={2} title={m.label} action={{ label: "Details", href: m.href }}>
              <TrendChart
                key={m.key}
                label={m.label}
                unit={m.unit}
                format={m.format}
                colorBy={m.colorBy}
                direction={m.direction}
                data={mapMetric(vm.points, (ps) => ps.map((p) => ({ date: p.day, value: p.value, provisional: p.provisional })))}
                deltas={deltas}
                ranges={RANGES}
              />
            </SectionShell>
            <SectionShell variant="card" level={2} title="Averages">
              <div className="divide-y divide-border">
                {vm.periods.map((p) => (
                  <KeyStatRow
                    key={p.range}
                    variant="row"
                    label={PERIOD[p.range].label}
                    caption={`vs. ${PERIOD[p.range].prior}`}
                    metric={p.average}
                    unit={m.unit}
                    format={m.format}
                    average={p.prior}
                    averageLabel={PERIOD[p.range].prior}
                    direction={m.direction}
                  />
                ))}
              </div>
            </SectionShell>
          </div>
        </div>
      }
    />
  )
}
