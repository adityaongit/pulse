"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts"
import { clockTicks, hourTicks, paddedDomain } from "@/lib/charts"
import { clock } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellStatus } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { AXIS, ChartFigure, GRID, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation } from "./ChartFrame"

/** A marked stretch on an intraday chart. `label` is the short name: "Run", "Ride", "Strength", "Sleep", "Nap". */
export type ChartSpan = { kind: "workout" | "sleep"; start: number; end: number; label: string }
export type HrZone = { zone: number; min: number; max: number }

export type HrSeries = {
  /** Per-minute heart rate (epoch ms); null is a gap, never interpolated. */
  points: { t: number; bpm: number | null }[]
  zones?: HrZone[]
  spans?: ChartSpan[]
  /** Today only: the dashed "now" line. */
  now?: number
}

export type IntradayHrChartProps = {
  data: Metric<HrSeries> | null | undefined
  /** `day`: 200 px with 6-hourly ticks. `activity`: 180 px for one workout window. */
  variant?: "day" | "activity"
}

export function spanAreas(spans: ChartSpan[] | undefined) {
  return (spans ?? []).map((s) => (
    <ReferenceArea
      key={`${s.kind}-${s.start}`}
      x1={s.start}
      x2={s.end}
      fill={s.kind === "workout" ? "var(--strain-deep)" : "var(--sleep)"}
      fillOpacity={s.kind === "workout" ? 0.3 : 0.12}
      ifOverflow="hidden"
      label={{ value: s.label, position: "insideTop", fill: "var(--foreground-secondary)", fontSize: 11 }}
    />
  ))
}

function Chart({ hr, variant }: { hr: HrSeries; variant: "day" | "activity" }) {
  const tz = useOptionalShellStatus()?.timeZone
  const anim = useSeriesAnimation()
  const id = React.useId().replace(/:/g, "")
  const first = hr.points[0]?.t ?? 0
  const last = hr.points.at(-1)?.t ?? 0
  const domain = paddedDomain(hr.points.map((p) => p.bpm))
  const bpms = hr.points.map((p) => p.bpm).filter((b): b is number => b !== null)
  const zoneOf = (bpm: number) => hr.zones?.find((z) => bpm >= z.min && bpm <= z.max)?.zone
  const summary = `Heart rate from ${clock(first, tz)} to ${clock(last, tz)}: low ${Math.min(...bpms)}, high ${Math.max(...bpms)} beats per minute.`

  return (
    <ChartFigure summary={summary} config={{ bpm: { label: "Heart rate", color: "var(--strain)" } }} className={variant === "day" ? "h-[200px]" : "h-[180px]"}>
      <AreaChart data={hr.points} accessibilityLayer margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`hr-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--strain)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--strain)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        {hr.zones?.map((z) => (
          <ReferenceArea
            key={z.zone}
            y1={z.min}
            y2={z.max}
            fill={z.zone % 2 ? "var(--chart-band)" : "transparent"}
            fillOpacity={1}
            ifOverflow="hidden"
            label={{ value: `Z${z.zone}`, position: "insideRight", fill: "var(--muted-foreground)", fontSize: 10 }}
          />
        ))}
        {spanAreas(hr.spans)}
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[first, last]}
          ticks={variant === "day" ? hourTicks(first, last, 6, tz) : clockTicks(first, last, last - first <= 3_600_000 ? 15 : last - first <= 3 * 3_600_000 ? 30 : 60, tz)}
          tickFormatter={(v: number) => clock(v, tz)}
          interval="preserveStartEnd"
          minTickGap={24}
          {...AXIS}
        />
        <YAxis domain={domain} width={32} tickCount={4} {...AXIS} />
        {hr.now && <ReferenceLine x={hr.now} stroke="var(--chart-cursor)" strokeDasharray="4 4" ifOverflow="hidden" />}
        <ChartTooltip
          isAnimationActive={false}
          cursor={LINE_CURSOR}
          content={
            <ChartTooltipContent
              className={TOOLTIP_CLASS}
              hideIndicator
              labelFormatter={(_, payload) => clock(Number(payload?.[0]?.payload?.t), tz)}
              formatter={(v) => {
                const bpm = Number(v)
                const z = zoneOf(bpm)
                return (
                  <div className="grid gap-1">
                    <TooltipLine color="var(--strain)">{bpm} bpm</TooltipLine>
                    {z && <span className="text-muted-foreground">Zone {z}</span>}
                  </div>
                )
              }}
            />
          }
        />
        <Area dataKey="bpm" type="monotone" stroke="var(--strain)" strokeWidth={1.5} fill={`url(#hr-fill-${id})`} connectNulls={false} {...anim} />
      </AreaChart>
    </ChartFigure>
  )
}

/** Heart rate across the day or an activity, with zones and markers (spec §5.7). */
export function IntradayHrChart({ data, variant = "day" }: IntradayHrChartProps) {
  const h = variant === "day" ? "h-[200px]" : "h-[180px]"
  const empty = (
    <div className={`grid place-items-center ${h}`}>
      <EmptyState body="No heart-rate data for this day." />
    </div>
  )
  return (
    <MetricState
      metric={data}
      skeleton={<Skeleton aria-hidden className={`${h} rounded-lg`} />}
      empty={empty}
      renderReason={(r) => (
        <div className={`grid place-items-center ${h}`}>
          <ReasonPlaceholder reason={r} size="md" />
        </div>
      )}
    >
      {(hr) => (hr.points.some((p) => p.bpm !== null) ? <Chart hr={hr} variant={variant} /> : empty)}
    </MetricState>
  )
}

export function IntradayHrChartSkeleton({ variant = "day" }: { variant?: "day" | "activity" }) {
  return <Skeleton aria-hidden className={`${variant === "day" ? "h-[200px]" : "h-[180px]"} rounded-lg`} />
}
IntradayHrChart.Skeleton = IntradayHrChartSkeleton
