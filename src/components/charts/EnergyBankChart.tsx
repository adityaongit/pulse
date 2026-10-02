"use client"

import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceDot, XAxis, YAxis } from "recharts"
import { DATA_COLORS, recoveryColor } from "@/lib/bands"
import { hourTicks, splitByBand } from "@/lib/charts"
import { clock, formatValue } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellStatus } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { AXIS, ChartFigure, GRID, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation } from "./ChartFrame"

export type EnergySeries = {
  /** Reserve 0-100 from wake to now (today) or to sleep (past days). */
  points: { t: number; value: number | null }[]
  /** Drains; the chart annotates the three biggest. `amount` is positive ("−18 Run" for 18). */
  drains?: { t: number; amount: number; label: string }[]
  naps?: { start: number; end: number }[]
}

export type EnergyBankChartProps = { data: Metric<EnergySeries> | null | undefined }

// Energy bands like Recovery: red ≤ 33, yellow 34-66, green ≥ 67.
const BANDS = [34, 67]
const BAND_STROKE = [DATA_COLORS["recovery-red"].css, DATA_COLORS["recovery-yellow"].css, DATA_COLORS["recovery-green"].css]

function Chart({ e }: { e: EnergySeries }) {
  const tz = useOptionalShellStatus()?.timeZone
  const anim = useSeriesAnimation()
  const { rows, keys } = splitByBand(e.points.map((p) => ({ x: p.t, y: p.value })), BANDS)
  const data = rows.map((r, i) => ({ ...r, all: e.points[i].value }))
  const first = e.points[0]?.t ?? 0
  const last = e.points.at(-1)?.t ?? 0
  const latest = [...e.points].reverse().find((p) => p.value !== null)
  const valueAt = (t: number) => e.points.reduce((best, p) => (Math.abs(p.t - t) < Math.abs(best.t - t) ? p : best), e.points[0]).value
  const drains = [...(e.drains ?? [])].sort((a, b) => b.amount - a.amount).slice(0, 3)
  const startV = e.points.find((p) => p.value !== null)?.value
  const summary = `Energy from ${clock(first, tz)}: started at ${formatValue("int", startV)} percent, now ${formatValue("int", latest?.value)} percent.`

  return (
    <ChartFigure summary={summary} config={{ all: { label: "Energy", color: "var(--recovery-green)" } }} className="h-[140px]">
      <ComposedChart data={data} accessibilityLayer margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        {e.naps?.map((n) => (
          <ReferenceArea
            key={n.start}
            x1={n.start}
            x2={n.end}
            fill="var(--sleep)"
            fillOpacity={0.12}
            ifOverflow="hidden"
            label={{ value: "Nap", position: "insideTop", fill: "var(--foreground-secondary)", fontSize: 11 }}
          />
        ))}
        <XAxis dataKey="x" type="number" scale="time" domain={[first, last]} ticks={hourTicks(first, last, 6, tz)} tickFormatter={(v: number) => clock(v, tz)} interval="preserveStartEnd" minTickGap={24} {...AXIS} />
        <YAxis domain={[0, 100]} ticks={[33, 67, 100]} width={28} {...AXIS} tickMargin={4} />
        <ChartTooltip
          cursor={LINE_CURSOR}
          content={
            <ChartTooltipContent
              className={TOOLTIP_CLASS}
              hideIndicator
              labelFormatter={(_, payload) => clock(Number(payload?.[0]?.payload?.x), tz)}
              formatter={(v, name) =>
                name === "all" ? <TooltipLine color={DATA_COLORS[recoveryColor(Number(v))].css}>{formatValue("int", Number(v))}%</TooltipLine> : null
              }
            />
          }
        />
        <Area dataKey="all" type="monotone" stroke="none" fill="var(--foreground)" fillOpacity={0.06} connectNulls={false} activeDot={false} {...anim} />
        {keys.map((k, i) => (
          <Line key={k} dataKey={k} type="monotone" stroke={BAND_STROKE[i]} strokeWidth={2} dot={false} activeDot={false} connectNulls={false} tooltipType="none" {...anim} />
        ))}
        {drains.map((d) => {
          const y = valueAt(d.t)
          return y === null ? null : (
            <ReferenceDot
              key={d.t}
              x={d.t}
              y={y}
              r={3}
              fill="var(--warning)"
              stroke="none"
              label={{ value: `${formatValue("int", -d.amount)} ${d.label}`, position: "top", fill: "var(--warning)", fontSize: 11 }}
            />
          )
        })}
        {latest?.value != null && (
          <ReferenceDot x={latest.t} y={latest.value} r={4} fill={DATA_COLORS[recoveryColor(latest.value)].css} stroke="var(--card)" strokeWidth={2} />
        )}
      </ComposedChart>
    </ChartFigure>
  )
}

/** Bevel's Energy Bank in WHOOP's language (spec §5.9). */
export function EnergyBankChart({ data }: EnergyBankChartProps) {
  const empty = (
    <div className="grid h-[140px] place-items-center">
      <EmptyState body="Energy Bank starts once you wake up." />
    </div>
  )
  return (
    <MetricState
      metric={data}
      skeleton={<EnergyBankChartSkeleton />}
      empty={empty}
      renderReason={(r, meta) => (
        <div className="grid h-[140px] place-items-center">
          <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />
        </div>
      )}
    >
      {(e) => (e.points.some((p) => p.value !== null) ? <Chart e={e} /> : empty)}
    </MetricState>
  )
}

export function EnergyBankChartSkeleton() {
  return <Skeleton aria-hidden className="h-[140px] rounded-lg" />
}
EnergyBankChart.Skeleton = EnergyBankChartSkeleton
