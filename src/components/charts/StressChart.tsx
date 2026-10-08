"use client"

import * as React from "react"
import { Area, CartesianGrid, ComposedChart, Line, ReferenceDot, ReferenceLine, XAxis, YAxis } from "recharts"
import { DATA_COLORS, STRESS_COLOR, STRESS_WORD, stressLevel } from "@/lib/bands"
import { bandColor, hourTicks } from "@/lib/charts"
import { clock, formatValue } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellCalendar } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { AXIS, BandGradient, bandPaint, ChartFigure, FadeGradient, GlowDot, GRID, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation, type Band } from "./ChartFrame"
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

// Low from 0, medium from 1, high from 2: one continuous line whose colour follows the level (Bevel's stress chart).
const BANDS: Band[] = (["low", "medium", "high"] as const).map((l, i) => ({ from: i, color: DATA_COLORS[STRESS_COLOR[l]].css }))

function Chart({ s, variant }: { s: StressSeries; variant: "full" | "spark" }) {
  const tz = useOptionalShellCalendar()?.timeZone
  const anim = useSeriesAnimation()
  const id = React.useId().replace(/:/g, "")
  const data = s.points.map((p) => ({ x: p.t, all: p.value }))
  const vals = s.points.flatMap((p) => (p.value === null ? [] : [p.value]))
  const top = Math.max(...vals)
  const bottom = Math.min(...vals)
  const first = s.points[0]?.t ?? 0
  const last = s.now ?? s.points.at(-1)?.t ?? 0
  const latest = [...s.points].reverse().find((p) => p.value !== null)
  const full = variant === "full"
  const summary = latest?.value != null
    ? `Stress through the day, latest ${formatValue("decimal1", latest.value)}, ${STRESS_WORD[stressLevel(latest.value)].toLowerCase()}, at ${clock(latest.t, tz)}.`
    : "Stress through the day."

  return (
    <ChartFigure summary={summary} config={{ all: { label: "Stress", color: "var(--stress-medium)" } }} className={full ? "h-[200px]" : "h-11"}>
      <ComposedChart data={data} accessibilityLayer={full} margin={full ? { top: 16, right: 8, bottom: 0, left: 0 } : { top: 4, right: 4, bottom: 4, left: 4 }}>
        <defs>
          <BandGradient id={`stress-${id}`} top={top} bottom={bottom} bands={BANDS} />
          <FadeGradient id={`stress-fill-${id}`} color={bandColor(top, BANDS)} from={0.22} />
        </defs>
        {full && <CartesianGrid {...GRID} horizontalValues={[1, 2, 3]} />}
        {full && spanAreas(s.spans, true)}
        <XAxis
          dataKey="x"
          type="number"
          scale="time"
          domain={[first, last]}
          hide={!full}
          // The hours, then the time now in bold at the end of the line (dashboard-08), clear of the last hour.
          ticks={full ? (s.now ? [...hourTicks(first, last, 4, tz).filter((t) => last - t > 5_400_000), s.now] : hourTicks(first, last, 4, tz)) : undefined}
          tickFormatter={(v: number) => clock(v, tz)}
          tick={full && s.now ? (p: { x?: number | string; y?: number | string; payload?: { value: number } }) => <NowTick {...p} now={s.now!} tz={tz} /> : undefined}
          interval={s.now ? 0 : "equidistantPreserveStart"}
          minTickGap={24}
          {...AXIS}
        />
        <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} tickFormatter={(v: number) => formatValue("decimal1", v)} width={28} hide={!full} {...AXIS} tickMargin={4} />
        {full && (
          <ChartTooltip
            isAnimationActive={false}
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
        {full && <Area dataKey="all" type="monotone" stroke="none" fill={top > 0 ? `url(#stress-fill-${id})` : "none"} connectNulls={false} activeDot={false} tooltipType="none" {...anim} />}
        <Line
          dataKey="all"
          type="monotone"
          stroke={bandPaint(`stress-${id}`, top, bottom, BANDS)}
          strokeWidth={full ? 2 : 1.5}
          dot={false}
          activeDot={full ? (d: { cx?: number; cy?: number; payload?: { all: number | null } }) => <GlowDot cx={d.cx} cy={d.cy} fill={bandPaint("", d.payload?.all ?? 0, d.payload?.all ?? 0, BANDS)} /> : false}
          connectNulls={false}
          {...anim}
        />
        {full && s.now && <ReferenceLine x={s.now} stroke="var(--chart-cursor)" strokeDasharray="4 4" ifOverflow="hidden" />}
        {/* The latest reading: a white dot, as the reference app ends its line (health-01, dashboard-08). */}
        {latest?.value != null && <ReferenceDot x={latest.t} y={latest.value} r={full ? 4 : 3} fill="var(--foreground)" stroke="none" />}
      </ComposedChart>
    </ChartFigure>
  )
}

/** An hour tick, or the time now in bold. */
function NowTick({ x, y, payload, now, tz }: { x?: number | string; y?: number | string; payload?: { value: number }; now: number; tz?: string }) {
  if (!payload) return null
  const isNow = payload.value === now
  return (
    <text x={x} y={y} dy="0.9em" textAnchor={isNow ? "end" : "middle"} fontSize={12} fontWeight={isNow ? 700 : 400} fill={isNow ? "var(--foreground)" : "var(--muted-foreground)"} className="font-numeric tabular-nums">
      {clock(payload.value, tz)}
    </text>
  )
}

/** Intraday stress 0-3 with level-coloured lines (spec §5.10). */
export function StressChart({ data, variant }: StressChartProps) {
  const empty =
    variant === "full" ? (
      <div className="grid place-items-center">
        <EmptyState body="No still minutes to score yet today. Stress is measured only while you are not moving." />
      </div>
    ) : (
      <p className="flex h-11 items-center text-xs leading-4 font-medium text-muted-foreground">No still minutes yet</p>
    )
  return (
    <MetricState
      metric={data}
      skeleton={<StressChartSkeleton variant={variant} />}
      empty={empty}
      reasonSize={variant === "full" ? "md" : "sm"}
      renderReason={(r) =>
        variant === "full" ? (
          <div className="grid place-items-center">
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
