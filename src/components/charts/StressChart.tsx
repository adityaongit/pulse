"use client"

import { ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { DATA_COLORS, STRESS_COLOR, STRESS_WORD, stressLevel } from "@/lib/bands"
import { hourTicks, splitByBand } from "@/lib/charts"
import { clock, formatValue } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellStatus } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { AXIS, ChartFigure, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation } from "./ChartFrame"
import { spanAreas, type ChartSpan } from "./IntradayHrChart"

export type StressSeries = {
  /** 0-3 per still minute; moving minutes are null (gaps). */
  points: { t: number; value: number | null }[]
  spans?: ChartSpan[]
  /** Today only: the dashed "now" line. */
  now?: number
}

export type StressChartProps = {
  data: Metric<StressSeries> | null | undefined
  /** `full`: 200 px with axes (Stress Monitor). `spark`: 44 px, no axes (Home, Health hub). */
  variant: "full" | "spark"
}

const STROKES = (["low", "medium", "high"] as const).map((l) => DATA_COLORS[STRESS_COLOR[l]].css)

function Chart({ s, variant }: { s: StressSeries; variant: "full" | "spark" }) {
  const tz = useOptionalShellStatus()?.timeZone
  const anim = useSeriesAnimation()
  const { rows, keys } = splitByBand(s.points.map((p) => ({ x: p.t, y: p.value })), [1, 2])
  const data = rows.map((r, i) => ({ ...r, all: s.points[i].value }))
  const first = s.points[0]?.t ?? 0
  const last = s.now ?? s.points.at(-1)?.t ?? 0
  const latest = [...s.points].reverse().find((p) => p.value !== null)
  const full = variant === "full"
  const summary = latest?.value != null
    ? `Stress through the day, latest ${formatValue("decimal1", latest.value)}, ${STRESS_WORD[stressLevel(latest.value)].toLowerCase()}, at ${clock(latest.t, tz)}.`
    : "Stress through the day."
  const latestColor = latest?.value != null ? DATA_COLORS[STRESS_COLOR[stressLevel(latest.value)]].css : undefined

  return (
    <ChartFigure summary={summary} config={{ all: { label: "Stress", color: "var(--stress-medium)" } }} className={full ? "h-[200px]" : "h-11"}>
      <ComposedChart data={data} accessibilityLayer={full} margin={full ? { top: 16, right: 8, bottom: 0, left: 0 } : { top: 4, right: 4, bottom: 4, left: 4 }}>
        {full && <ReferenceLine y={1} stroke="var(--chart-grid)" />}
        {full && <ReferenceLine y={2} stroke="var(--chart-grid)" />}
        {full && spanAreas(s.spans)}
        <XAxis
          dataKey="x"
          type="number"
          scale="time"
          domain={[first, last]}
          hide={!full}
          ticks={full ? hourTicks(first, last, 4, tz) : undefined}
          tickFormatter={(v: number) => clock(v, tz)}
          interval="preserveStartEnd"
          minTickGap={24}
          {...AXIS}
        />
        <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v: number) => v.toFixed(1)} width={28} hide={!full} {...AXIS} tickMargin={4} />
        {full && (
          <ChartTooltip
            cursor={LINE_CURSOR}
            content={
              <ChartTooltipContent
                className={TOOLTIP_CLASS}
                hideIndicator
                labelFormatter={(_, payload) => clock(Number(payload?.[0]?.payload?.x), tz)}
                formatter={(v, name) => {
                  if (name !== "all") return null
                  const n = Number(v)
                  return (
                    <TooltipLine color={DATA_COLORS[STRESS_COLOR[stressLevel(n)]].css}>
                      {formatValue("decimal1", n)} {STRESS_WORD[stressLevel(n)]}
                    </TooltipLine>
                  )
                }}
              />
            }
          />
        )}
        <Line dataKey="all" stroke="none" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
        {keys.map((k, i) => (
          <Line key={k} dataKey={k} type="monotone" stroke={STROKES[i]} strokeWidth={full ? 2 : 1.5} dot={false} activeDot={false} connectNulls={false} tooltipType="none" {...anim} />
        ))}
        {full && s.now && <ReferenceLine x={s.now} stroke="var(--chart-cursor)" strokeDasharray="4 4" ifOverflow="hidden" />}
        {latest?.value != null && <ReferenceDot x={latest.t} y={latest.value} r={full ? 4 : 3} fill={latestColor} stroke="none" />}
      </ComposedChart>
    </ChartFigure>
  )
}

/** Intraday stress 0-3 with level-coloured lines (spec §5.10). */
export function StressChart({ data, variant }: StressChartProps) {
  const h = variant === "full" ? "h-[200px]" : "h-11"
  const empty =
    variant === "full" ? (
      <div className="grid h-[200px] place-items-center">
        <EmptyState body="No still minutes to score yet today. Stress is measured only while you are not moving." />
      </div>
    ) : (
      <p className="flex h-11 items-center text-xs leading-4 font-medium text-muted-foreground">No still minutes yet</p>
    )
  return (
    <MetricState
      metric={data}
      skeleton={<Skeleton aria-hidden className={`${h} rounded-lg`} />}
      empty={empty}
      reasonSize={variant === "full" ? "md" : "sm"}
      renderReason={(r) =>
        variant === "full" ? (
          <div className="grid h-[200px] place-items-center">
            <ReasonPlaceholder reason={r} size="md" />
          </div>
        ) : (
          <div className="flex h-11 items-center">
            <ReasonPlaceholder reason={r} size="sm" />
          </div>
        )
      }
    >
      {(s) => (s.points.some((p) => p.value !== null) ? <Chart s={s} variant={variant} /> : empty)}
    </MetricState>
  )
}

export function StressChartSkeleton({ variant }: { variant: "full" | "spark" }) {
  return <Skeleton aria-hidden className={`${variant === "full" ? "h-[200px]" : "h-11"} rounded-lg`} />
}
StressChart.Skeleton = StressChartSkeleton
