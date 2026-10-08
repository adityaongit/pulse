"use client"

import * as React from "react"
import { Area, Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, Rectangle, ReferenceArea, ReferenceLine, usePlotArea, useXAxisScale, useYAxisScale, XAxis, YAxis } from "recharts"
import { DATA_COLORS, deltaTone, partColor, recoveryColor, type GoodDirection } from "@/lib/bands"
import { formatDay, formatValue, hmm, type FormatKey } from "@/lib/format"
import type { MonthSegment, TrendViewBar, TrendViewRange } from "@/lib/trend"
import { AXIS, ChartFigure, GRID, Pill, useSeriesAnimation, wholeTick } from "./ChartFrame"

export type TrendViewChartProps = {
  label: string
  bars: TrendViewBar[]
  /** `range`: bars from bed to wake on an inverted clock axis (`parts.bed`, `parts.wake` in minutes from midnight);
   * `pair`: two labelled lines, `series[0]` under `series[1]` (hours of sleep against sleep needed). */
  chart: "bars" | "line" | "stack" | "range" | "pair"
  range: TrendViewRange
  colorBy: "band" | "strain" | "sleep" | "single" | "stress"
  format: FormatKey
  unit?: string
  direction: GoodDirection
  /** Stack parts, bottom first. */
  series?: readonly { key: string; label: string }[]
  domain?: [number, number]
  typical?: [number, number] | null
  /** M bars: the dashed AVG line. */
  average?: number | null
  /** 6M: one segment per month over the faint daily (or weekly) trace. */
  segments?: MonthSegment[] | null
  /** The day whose column is highlighted (the selected day in Weekly Trends, the window's last day here). */
  selected?: string
  /** Weekly Trends cards: shorter, no y axis. */
  compact?: boolean
}

const colorOf = (colorBy: TrendViewChartProps["colorBy"], v: number) =>
  colorBy === "band" ? DATA_COLORS[recoveryColor(v)].css : colorBy === "strain" ? DATA_COLORS.strain.css : colorBy === "sleep" ? DATA_COLORS.sleep.css : DATA_COLORS["chart-5"].css

/** "21:00" from minutes after midnight (negative before it). */
const clockOf = (m: number) => {
  const x = ((Math.round(m) % 1440) + 1440) % 1440
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`
}

/** About four evenly spaced ticks on round steps (1, 2, 2.5 or 5 × 10ⁿ; clock steps for minutes) that cover `domain`. */
function niceTicks([lo, hi]: [number, number], duration = false) {
  const raw = (hi - lo) / 3 || 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  // Minutes step on the clock: 15 and 30 minutes, then whole hours.
  const steps = duration ? [5, 10, 15, 30, 60, 120, 180, 240, 360] : [1, 2, 2.5, 5, 10].map((m) => m * mag)
  const step = steps.find((s) => s >= raw) ?? raw
  const start = Math.floor(lo / step) * step
  return Array.from({ length: Math.ceil((hi - start) / step) + 1 }, (_, i) => start + i * step)
}

/** Two-line day tick: weekday over date ("Thu" / "9"), the highlighted day in full white. */
function DayTick({ x, y, payload, range, selected, weekly }: { x?: number | string; y?: number | string; payload?: { value: string }; range: TrendViewRange; selected?: string; weekly: boolean }) {
  const d = payload?.value ?? ""
  const on = d === selected
  const [top, bottom] =
    range === "6m" ? [formatDay(d, { month: "short" }), ""] : range === "w" && !weekly ? [formatDay(d, { weekday: "short" }), formatDay(d, { day: "numeric" })] : [formatDay(d, { month: "short" }), formatDay(d, { day: "numeric" })]
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={12} fontWeight={on ? 700 : 500} fill={on ? "var(--foreground)" : "var(--muted-foreground)"}>
      <tspan x={x} dy="0.71em">{top}</tspan>
      {bottom && <tspan x={x} dy="1.25em">{bottom}</tspan>}
    </text>
  )
}

/**
 * The selected day's column: a soft rounded band the full height of the plot and its tick, as the reference app
 * marks today in Weekly Trends. Columns split the plot evenly (category axis, no padding).
 */
function Highlight({ index, count }: { index: number; count: number }) {
  const area = usePlotArea()
  if (!area) return null
  const step = area.width / count
  const w = Math.min(step * 0.86, 44)
  return <rect x={area.x + step * (index + 0.5) - w / 2} y={area.y - 4} width={w} height={area.height + 46} rx={6} fill="var(--chart-highlight)" pointerEvents="none" />
}

/** The left "AVG." pill on the average line (the reference app pins it to the axis, not the right edge). */
function AvgPill({ value }: { value: number }) {
  const y = useYAxisScale()
  if (!y) return null
  return <Pill x={2} y={y(value) ?? 0} text="AVG." fill="var(--foreground)" color="var(--background)" />
}

/** 6M: a level segment per month with its value above and its change below, coloured by the metric's good direction. */
function Segments({ segments, format, direction, keys }: { segments: MonthSegment[]; format: FormatKey; direction: GoodDirection; keys: string[] }) {
  const x = useXAxisScale()
  const y = useYAxisScale()
  if (!x || !y) return null
  // Categories are the bars' `from` days; a month spans the categories inside it.
  const step = keys.length > 1 ? (x(keys[1]) ?? 0) - (x(keys[0]) ?? 0) : 0
  return (
    <g pointerEvents="none">
      {segments.map((s) => {
        if (s.value === null) return null
        const inside = keys.filter((k) => k >= s.from && k <= s.to)
        if (!inside.length) return null
        const x1 = x(inside[0]) ?? 0
        const x2 = (x(inside.at(-1)!) ?? 0) + Math.max(step, 2)
        const cy = y(s.value) ?? 0
        const tone = s.change === null || s.change === 0 ? "neutral" : deltaTone(direction, s.change, 0).tone
        const color = tone === "good" ? "var(--optimal)" : tone === "bad" ? "var(--warning)" : "var(--foreground)"
        const mid = (x1 + x2) / 2
        return (
          <g key={s.month}>
            <line x1={x1 + 2} x2={x2 - 2} y1={cy} y2={cy} stroke={color} strokeWidth={3} strokeLinecap="round" />
            {x2 - x1 >= 34 && (
              <text x={mid} y={cy - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--foreground)">
                {formatValue(format, s.value)}
              </text>
            )}
            {x2 - x1 >= 34 && s.change !== null && s.change !== 0 && (
              <text x={mid} y={cy + 18} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
                {`${s.change > 0 ? "+" : ""}${s.change}%`}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

/** Time in bed: a bar from bed to wake with the bed time above and the wake time below. */
function RangeBar(props: { x?: number; y?: number; width?: number; height?: number; payload?: { parts?: Record<string, number> | null; on?: boolean }; color: string }) {
  const { x = 0, y = 0, width = 0, height = 0, payload, color } = props
  const p = payload?.parts
  if (!p || !height) return null
  // The clock axis is reversed, so Recharts hands a negative height: the bar runs up from `y`.
  const top = Math.min(y, y + height)
  const h = Math.abs(height)
  const w = Math.min(width, 18)
  const left = x + (width - w) / 2
  return (
    <g>
      <Rectangle x={left} y={top} width={w} height={h} radius={3} fill={color} />
      <text x={x + width / 2} y={top - 6} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
        {clockOf(p.bed)}
      </text>
      <text x={x + width / 2} y={top + h + 14} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
        {clockOf(p.wake)}
      </text>
    </g>
  )
}

export function TrendViewChart(p: TrendViewChartProps) {
  const anim = useSeriesAnimation()
  const uid = React.useId().replace(/:/g, "")
  const six = p.range === "6m"
  const weekly = p.bars.length > 0 && p.bars[0].from !== p.bars[0].to
  const labelled = p.range === "w" || weekly
  const fmt = (v: number) => formatValue(p.format, v)
  const single = colorOf(p.colorBy, 0)
  const rows = p.bars.map((b) => ({
    ...b,
    key: b.from,
    fill: b.value === null ? undefined : colorOf(p.colorBy, b.value),
    opacity: b.provisional ? 0.45 : 1,
    text: b.value === null ? "" : `${fmt(b.value)}${p.unit === "%" ? "%" : ""}`,
    span: b.parts && p.chart === "range" ? [b.parts.bed, b.parts.wake] : null,
    ...Object.fromEntries((p.series ?? []).map((s) => [`part_${s.key}`, b.parts?.[s.key] ?? null])),
  }))
  const keys = rows.map((r) => r.key)
  const values = rows.flatMap((r) => (r.value === null ? [] : [r.value]))
  const pair = p.chart === "pair" && !six && p.series?.length === 2 ? p.series : null
  const partVals = pair ? rows.flatMap((r) => pair.flatMap((s) => (r.parts?.[s.key] != null ? [r.parts[s.key]] : []))) : []
  const segVals = (p.segments ?? []).flatMap((s) => (s.value === null ? [] : [s.value]))

  // Lines get a tight axis around the data and the typical range; bars stand on zero.
  const lineDomain = (): [number, number] => {
    const xs = [...values, ...partVals, ...segVals, ...(p.typical ?? [])]
    if (!xs.length) return [0, 1]
    const lo = Math.min(...xs)
    const hi = Math.max(...xs)
    const pad = Math.max((hi - lo) * 0.25, Math.abs(hi) * 0.02, 1)
    // A pair labels its lower line under the points, so it keeps twice the room at the bottom.
    return [Math.max(0, Math.floor(lo - (p.chart === "pair" ? 2 : 1) * pad)), Math.ceil(hi + pad)]
  }
  const rangeDomain: [number, number] = [
    Math.min(-180, ...rows.flatMap((r) => (r.span ? [Math.floor((r.span[0] - 60) / 240) * 240 + 60] : []))),
    Math.max(780, ...rows.flatMap((r) => (r.span ? [Math.ceil((r.span[1] - 60) / 240) * 240 + 60] : []))),
  ]
  const domain: [number, number] =
    p.chart === "range" ? rangeDomain : p.domain ?? (p.chart === "line" || p.chart === "pair" || (six && !weekly && p.chart !== "stack") ? lineDomain() : [0, Math.max(1, ...values, ...segVals) * 1.15])
  const yTicks = p.domain && p.domain[1] === 100 ? [0, 25, 50, 75, 100] : p.domain && p.domain[1] === 21 ? [0, 5, 10, 15, 21] : niceTicks(domain, p.format === "duration")
  const ticks = p.chart === "range" ? Array.from({ length: Math.round((domain[1] - domain[0]) / 240) + 1 }, (_, i) => domain[0] + i * 240) : undefined

  const xTicks = six ? keys.filter((k, i) => i === 0 || k.slice(0, 7) !== keys[i - 1].slice(0, 7)).map((k) => keys.find((x) => x.slice(0, 7) === k.slice(0, 7) && x.slice(8) >= "14") ?? k) : p.range === "m" && !weekly ? keys.filter((_, i) => (keys.length - 1 - i) % 7 === 0) : keys
  const showAvg = p.range === "m" && !weekly && p.chart === "bars" && p.average != null
  const faint = six && p.chart !== "range"
  const summary = values.length
    ? `${p.label}: ${values.length} ${weekly ? "weeks" : "days"} with data, from ${fmt(Math.min(...values))} to ${fmt(Math.max(...values))}.`
    : `No ${p.label} data in this period.`
  const height = p.compact ? "h-[150px]" : "h-[240px]"
  const last = rows.findLastIndex((r) => r.value !== null)

  return (
    <ChartFigure summary={summary} config={{ value: { label: p.label, color: single } }} className={height}>
      <ComposedChart data={rows} margin={{ top: labelled || p.chart === "range" ? 22 : 10, right: p.chart === "line" && p.range === "m" ? 24 : 6, bottom: p.chart === "range" || p.chart === "pair" ? 12 : 0, left: 0 }}>
        <CartesianGrid {...GRID} />
        <defs>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={single} stopOpacity={0.22} />
            <stop offset="100%" stopColor={single} stopOpacity={0} />
          </linearGradient>
        </defs>
        {p.selected && keys.includes(p.selected) && <Highlight index={keys.indexOf(p.selected)} count={keys.length} />}
        {p.typical && <ReferenceArea y1={p.typical[0]} y2={p.typical[1]} fill="var(--chart-band)" fillOpacity={1} />}
        <XAxis
          dataKey="key"
          {...AXIS}
          height={six ? 24 : 42}
          ticks={xTicks}
          interval={0}
          tick={(t: { x?: number | string; y?: number | string; payload?: { value: string } }) => <DayTick {...t} range={p.range} selected={p.selected} weekly={weekly} />}
        />
        <YAxis
          {...AXIS}
          hide={p.compact}
          width={p.format === "duration" || p.chart === "range" || p.unit === "%" ? 46 : 38}
          domain={p.chart === "range" ? domain : [yTicks[0], yTicks.at(-1)!]}
          reversed={p.chart === "range"}
          ticks={ticks ?? yTicks}
          allowDecimals={p.format !== "int" && p.format !== "grouped"}
          tickFormatter={(v: number) => (p.chart === "range" ? clockOf(v) : p.format === "duration" ? hmm(v) : `${wholeTick(fmt)(v)}${p.unit === "%" ? "%" : ""}`)}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        {/* A line-only chart lays its points edge to edge; an invisible bar gives it the same columns as the bar
            charts, so points sit over their day labels and the highlight lines up. */}
        {(p.chart === "line" || p.chart === "pair" || (faint && !weekly && p.chart !== "stack")) && <Bar dataKey="value" shape={() => <g />} isAnimationActive={false} />}
        {showAvg && <ReferenceLine y={p.average!} stroke="var(--foreground)" strokeOpacity={0.7} strokeDasharray="4 3" />}
        {pair ? (
          pair.map((s, i) => {
            const color = partColor(s.key)
            return (
              <Line key={s.key} dataKey={`part_${s.key}`} type="linear" stroke={color} strokeWidth={2} connectNulls={false} activeDot={false} {...anim}
                dot={(d: { cx?: number; cy?: number; index?: number; value?: unknown }) =>
                  d.value == null || d.cx == null || d.cy == null || (p.range === "m" && d.index !== last) ? (
                    <g key={d.index} />
                  ) : (
                    <circle key={d.index} cx={d.cx} cy={d.cy} r={4.5} fill="var(--card)" stroke={color} strokeWidth={2} />
                  )
                }
              >
                {/* Each day the lower line labels under its point and the upper over it, so the two never collide. */}
                {p.range === "w" && (
                  <LabelList
                    dataKey={`part_${s.key}`}
                    content={(l: { x?: number | string; y?: number | string; index?: number; value?: unknown }) => {
                      if (l.value == null) return null
                      const other = rows[l.index ?? 0]?.parts?.[pair[1 - i].key]
                      const below = other != null && (Number(l.value) < other || (Number(l.value) === other && i === 0))
                      return (
                        <text x={Number(l.x)} y={Number(l.y) + (below ? 20 : -10)} textAnchor="middle" fontSize={12} fontWeight={700} fill={color}>
                          {fmt(Number(l.value))}
                        </text>
                      )
                    }}
                  />
                )}
              </Line>
            )
          })
        ) : p.chart === "range" ? (
          <Bar dataKey="span" shape={(b: object) => <RangeBar {...b} color={single} />} {...anim} />
        ) : p.chart === "line" || (faint && !weekly && p.chart !== "stack") ? (
          [
            !faint && <Area key="area" dataKey="value" type="linear" stroke="none" fill={`url(#area-${uid})`} connectNulls={false} activeDot={false} {...anim} />,
            <Line
              key="line"
              dataKey="value"
              type="linear"
              stroke={faint ? "var(--chart-faint)" : single}
              strokeWidth={faint ? 1.5 : 2}
              connectNulls={false}
              activeDot={false}
              dot={(d: { cx?: number; cy?: number; index?: number; payload?: (typeof rows)[number] }) =>
                faint || d.payload?.value == null || d.cx == null || d.cy == null || (p.range === "m" && d.index !== last) ? (
                  <g key={d.index} />
                ) : (
                  <circle key={d.index} cx={d.cx} cy={d.cy} r={4.5} fill="var(--card)" stroke={single} strokeWidth={2} />
                )
              }
              {...anim}
            >
              {p.range === "w" && !faint && <LabelList dataKey="text" position="top" offset={10} fill={single} fontSize={12} fontWeight={700} />}
              {p.range === "m" && !faint && (
                <LabelList
                  dataKey="text"
                  content={(l: { x?: number | string; y?: number | string; index?: number; value?: unknown }) =>
                    l.index === last ? (
                      <text x={Number(l.x) + 9} y={Number(l.y) - 9} fontSize={12} fontWeight={700} fill={single}>
                        {String(l.value)}
                      </text>
                    ) : null
                  }
                />
              )}
            </Line>,
          ]
        ) : p.chart === "stack" && p.series ? (
          p.series.map((s, i) => (
            <Bar key={s.key} dataKey={`part_${s.key}`} stackId="day" fill={partColor(s.key)} stroke="var(--card)" strokeWidth={1} radius={i === p.series!.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={28} {...anim}>
              {rows.map((r) => (
                <Cell key={r.key} fill={partColor(s.key)} fillOpacity={faint ? 0.35 : r.opacity} />
              ))}
            </Bar>
          ))
        ) : (
          <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} {...anim}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.fill ?? "transparent"} fillOpacity={faint ? 0.35 : r.opacity} />
            ))}
            {labelled && !faint && (
              <LabelList
                dataKey="text"
                content={(l: { x?: number | string; y?: number | string; width?: number | string; index?: number; value?: unknown }) => (
                  <text x={Number(l.x) + Number(l.width) / 2} y={Number(l.y) - 6} textAnchor="middle" fontSize={12} fontWeight={700} fill={rows[l.index ?? 0]?.fill ?? "var(--foreground)"}>
                    {String(l.value ?? "")}
                  </text>
                )}
              />
            )}
          </Bar>
        )}
        {/* A stack's total over each column. A label on the top part goes missing when that part is zero, so an
            invisible line on the total carries it; its points sit at the column centres. */}
        {p.chart === "stack" && labelled && !faint && (
          <Line dataKey="value" stroke="none" dot={false} activeDot={false} isAnimationActive={false}>
            <LabelList dataKey="text" position="top" offset={8} fill="var(--foreground)" fontSize={12} fontWeight={700} />
          </Line>
        )}
        {showAvg && <AvgPill value={p.average!} />}
        {six && p.segments && <Segments segments={p.segments} format={p.format} direction={p.direction} keys={keys} />}
      </ComposedChart>
    </ChartFigure>
  )
}
