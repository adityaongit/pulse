"use client"

import * as React from "react"
import { Activity, Moon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts"
import { DATA_COLORS, ZONE_COLOR } from "@/lib/bands"
import { bandColor } from "@/lib/charts"
import { clockTicks, hourTicks, paddedDomain } from "@/lib/charts"
import { clock } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellCalendar } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { AXIS, BandGradient, bandPaint, ChartFigure, FadeGradient, GlowDot, GRID, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation, type Band } from "./ChartFrame"

/** A marked stretch on an intraday chart. `label` is the short name: "Run", "Ride", "Strength", "Sleep", "Nap". */
export type ChartSpan = { kind: "workout" | "sleep"; start: number; end: number; label: string }
export type HrZone = { zone: number; label: string; min: number; max: number }

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

const SPAN_COLOR = { workout: "var(--strain)", sleep: "var(--sleep)" } as const

/** A marked stretch's header: a 2 px accent along its top edge, and an icon with its name centred above it (WHOOP's day chart). */
function SpanMark({ viewBox, kind, text }: { viewBox?: { x?: number; y?: number; width?: number }; kind: ChartSpan["kind"]; text: string }) {
  const { x = 0, y = 0, width = 0 } = viewBox ?? {}
  const Icon = kind === "sleep" ? Moon : Activity
  const w = 14 + Math.ceil(text.length * 6.2)
  // A header stays inside its own stretch, so back-to-back spans never overprint: the name when it fits, else the icon alone.
  const named = width >= w
  const left = named ? x + width / 2 - w / 2 : x + width / 2 - 5.5
  return (
    <g pointerEvents="none">
      <rect x={x} y={y} width={width} height={2} fill={SPAN_COLOR[kind]} />
      {width >= 11 && <Icon x={left} y={y - 15} width={11} height={11} color={SPAN_COLOR[kind]} strokeWidth={2.25} />}
      {named && (
        <text x={left + 14} y={y - 9.5} dy="0.35em" fontSize={11} fontWeight={600} fill="var(--foreground-secondary)">
          {text}
        </text>
      )}
    </g>
  )
}

/** Each marked stretch shaded, with its header along the top. */
export function spanAreas(spans: ChartSpan[] | undefined) {
  return (spans ?? []).map((s) => (
    <ReferenceArea
      key={`${s.kind}-${s.start}`}
      x1={s.start}
      x2={s.end}
      fill={s.kind === "workout" ? "var(--strain-deep)" : "var(--sleep)"}
      fillOpacity={s.kind === "workout" ? 0.12 : 0.08}
      ifOverflow="hidden"
      label={({ viewBox }: { viewBox?: { x?: number; y?: number; width?: number } }) => <SpanMark viewBox={viewBox} kind={s.kind} text={s.label} />}
    />
  ))
}

/** Bands for colouring heart rate by zone, ascending; under the first zone the line stays neutral. */
export const zoneBands = (zones: HrZone[]): Band[] => [
  { from: 0, color: "var(--foreground-secondary)" },
  ...[...zones].sort((a, b) => a.min - b.min).map((z) => ({ from: z.min, color: DATA_COLORS[ZONE_COLOR[z.zone] ?? "strain"].css })),
]

/**
 * The zones on the bpm axis: a 4 px colour strip along the plot's right edge at each zone's height, labelled Z1-Z5.
 * Only the part of a zone inside the y domain is drawn, so zones the heart rate never reached don't appear.
 * (A ruler under the plot read as stretches of time.)
 */
export function zoneStrips(zones: HrZone[] | undefined, domain: [number, number]) {
  return (zones ?? []).flatMap((z) => {
    const lo = Math.max(z.min, domain[0])
    const hi = Math.min(z.max, domain[1])
    if (hi <= lo) return []
    const color = DATA_COLORS[ZONE_COLOR[z.zone] ?? "strain"].css
    return [
      <ReferenceArea
        key={`zone-${z.zone}`}
        y1={lo}
        y2={hi}
        fill="transparent"
        ifOverflow="visible"
        label={({ viewBox }: { viewBox?: { x?: number; y?: number; width?: number; height?: number } }) => {
          const { x = 0, y = 0, width = 0, height = 0 } = viewBox ?? {}
          return (
            <g pointerEvents="none">
              <rect x={x + width + 3} y={y + 0.5} width={4} height={Math.max(0, height - 1)} rx={2} fill={color} />
              {height >= 11 && (
                <text x={x + width + 11} y={y + height / 2} dy="0.35em" fontSize={10} fontWeight={700} fill={color}>
                  Z{z.zone}
                </text>
              )}
            </g>
          )
        }}
      />,
    ]
  })
}

function Chart({ hr, variant }: { hr: HrSeries; variant: "day" | "activity" }) {
  const tz = useOptionalShellCalendar()?.timeZone
  const anim = useSeriesAnimation()
  const id = React.useId().replace(/:/g, "")
  const first = hr.points[0]?.t ?? 0
  const last = hr.points.at(-1)?.t ?? 0
  const domain = paddedDomain(hr.points.map((p) => p.bpm))
  const bpms = hr.points.map((p) => p.bpm).filter((b): b is number => b !== null)
  const zoneOf = (bpm: number) => hr.zones?.find((z) => bpm >= z.min && bpm <= z.max)?.label
  const summary = `Heart rate from ${clock(first, tz)} to ${clock(last, tz)}: low ${Math.min(...bpms)}, high ${Math.max(...bpms)} beats per minute.`
  // The day chart draws heart rate grey and colours it by zone only inside workouts (WHOOP's day view); an activity is all workout.
  const workouts = (hr.spans ?? []).filter((s) => s.kind === "workout")
  const inWorkout = (t: number) => variant === "activity" || workouts.some((s) => t >= s.start && t <= s.end)
  const rows = hr.points.map((p, i) => {
    const on = inWorkout(p.t)
    // A minute at the edge of a workout belongs to both series, so the two strokes meet.
    const edge = i > 0 && inWorkout(hr.points[i - 1].t) !== on
    return { t: p.t, bpm: p.bpm, hot: on || edge ? p.bpm : null, cool: !on || edge ? p.bpm : null }
  })
  const hot = rows.flatMap((r) => (r.hot == null ? [] : [r.hot]))
  const hotTop = hot.length ? Math.max(...hot) : 0
  const hotBottom = hot.length ? Math.min(...hot) : 0
  const bands = zoneBands(hr.zones ?? [])
  // An activity marks its start and end with dashed lines and bold times under them (activity-01, activity-05).
  const workout = variant === "activity" ? workouts[0] : undefined

  return (
    <div>
      <ChartFigure summary={summary} config={{ bpm: { label: "Heart rate", color: "var(--strain)" } }} className={variant === "day" ? "h-[200px]" : "h-[180px]"}>
        <AreaChart data={rows} accessibilityLayer margin={{ top: workout ? 8 : 18, right: workout ? 8 : 28, bottom: 0, left: 0 }}>
          <defs>
            <BandGradient id={`hr-line-${id}`} top={hotTop} bottom={hotBottom} bands={bands} />
            {/* The fill is one soft fade in the peak's colour: band stops in a fill read as stacked blocks. */}
            <FadeGradient id={`hr-fill-${id}`} color={bandColor(hotTop, bands)} from={0.3} />
            <FadeGradient id={`hr-cool-${id}`} color="var(--foreground)" from={0.1} />
          </defs>
          <CartesianGrid {...GRID} />
          {variant === "day" && spanAreas(hr.spans)}
          {variant === "day" && zoneStrips(hr.zones, domain)}
          {workout &&
            [workout.start, workout.end].map((x) => (
              <ReferenceLine
                key={x}
                x={x}
                stroke="var(--foreground-secondary)"
                strokeDasharray="3 3"
                ifOverflow="hidden"
                label={({ viewBox }: { viewBox?: { x?: number; y?: number; height?: number } }) => <circle cx={viewBox?.x ?? 0} cy={(viewBox?.y ?? 0) + (viewBox?.height ?? 0)} r={2.5} fill="var(--foreground)" />}
              />
            ))}
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={[first, last]}
            ticks={workout ? [workout.start, workout.end] : variant === "day" ? hourTicks(first, last, 6, tz) : clockTicks(first, last, last - first <= 3_600_000 ? 15 : last - first <= 3 * 3_600_000 ? 30 : 60, tz)}
            tickFormatter={(v: number) => clock(v, tz)}
            interval={workout ? 0 : "preserveStartEnd"}
            minTickGap={24}
            {...AXIS}
            {...(workout && { tick: { fill: "var(--foreground)", fontSize: 12, fontWeight: 700 } })}
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
                formatter={(v, name) => {
                  if (name !== "bpm") return null
                  const bpm = Number(v)
                  const z = zoneOf(bpm)
                  return (
                    <div className="grid gap-1">
                      <TooltipLine color={bandPaint("", bpm, bpm, bands)}>{bpm} bpm</TooltipLine>
                      {z && <span className="text-muted-foreground">{z}</span>}
                    </div>
                  )
                }}
              />
            }
          />
          {/* The full series, invisible: it carries the tooltip and the scrubbed dot across both strokes. */}
          <Area
            dataKey="bpm"
            type="monotone"
            stroke="none"
            fill="none"
            connectNulls={false}
            isAnimationActive={false}
            activeDot={(d: { cx?: number; cy?: number; payload?: { bpm: number | null } }) => <GlowDot cx={d.cx} cy={d.cy} fill={bandPaint("", d.payload?.bpm ?? 0, d.payload?.bpm ?? 0, bands)} />}
          />
          <Area dataKey="cool" type="monotone" stroke="var(--muted-foreground)" strokeWidth={1.25} fill={`url(#hr-cool-${id})`} connectNulls={false} activeDot={false} tooltipType="none" {...anim} />
          <Area dataKey="hot" type="monotone" stroke={bandPaint(`hr-line-${id}`, hotTop, hotBottom, bands)} strokeWidth={1.75} fill={hotTop > domain[0] ? `url(#hr-fill-${id})` : "none"} connectNulls={false} activeDot={false} tooltipType="none" {...anim} />
        </AreaChart>
      </ChartFigure>
    </div>
  )
}

/** Heart rate across the day or an activity, with zones and markers (spec §5.7). */
export function IntradayHrChart({ data, variant = "day" }: IntradayHrChartProps) {
  const empty = (
    <div className="grid place-items-center">
      <EmptyState body="No heart-rate data for this day." />
    </div>
  )
  return (
    <MetricState
      metric={data}
      skeleton={<IntradayHrChartSkeleton variant={variant} />}
      empty={empty}
      renderReason={(r) => (
        <div className="grid place-items-center">
          <ReasonPlaceholder reason={r} size="md" />
        </div>
      )}
    >
      {(hr) => (hr.points.some((p) => p.bpm !== null) ? <Chart hr={hr} variant={variant} /> : empty)}
    </MetricState>
  )
}

export function IntradayHrChartSkeleton({ variant = "day" }: { variant?: "day" | "activity" }) {
  return <Skeleton aria-hidden className={`${variant === "day" ? "h-[200px]" : "h-[180px]"} rounded-lg bg-muted/60`} />
}
IntradayHrChart.Skeleton = IntradayHrChartSkeleton
