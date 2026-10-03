"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { format, parseISO } from "date-fns"
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceArea, ReferenceLine, XAxis, YAxis } from "recharts"
import { cn } from "@/lib/utils"
import { DATA_COLORS, deltaTone, recoveryColor, STRESS_COLOR, stressLevel, type GoodDirection } from "@/lib/bands"
import { dayLabel, formatValue, spoken, type FormatKey } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { parseRange, RANGE_DAYS, withParam, type TrendRange } from "@/lib/url"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellStatus } from "@/components/shells/ShellStatus"
import { StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { AXIS, BAR_CURSOR, ChartFigure, GRID, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation } from "./ChartFrame"

export type TrendPoint = { date: string; value: number | null; provisional?: boolean }

export type TrendChartProps = {
  /** Metric name for the chart summary ("Recovery"). */
  label: string
  /** Up to 182 days ending on `d`, oldest first (U10); the chart slices by range. */
  data: Metric<TrendPoint[]> | null | undefined
  unit?: string
  format: FormatKey
  colorBy: "band" | "strain" | "sleep" | "single" | "stress"
  /** Gives the delta chip a good/bad tone; omit for neutral metrics. */
  direction?: GoodDirection
  /** Change of the range average against the prior range, per range (U10). */
  deltas?: Partial<Record<TrendRange, number | null>>
  /** Shades mean ± 1 σ ("Shaded: your normal range"). */
  baseline?: { mean: number; sd: number } | null
  /** Strain Target band ("Shaded: your Strain Target"). */
  target?: [number, number] | null
  /** Pins one range and hides the toggle (Stress 30-day trend). */
  fixedRange?: TrendRange
  /** Range when `?r=` is absent (default `m`; Fitness VO2 max uses `6m`). */
  defaultRange?: TrendRange
  /** A labelled horizontal line ("Your age" on WHOOP Age history). */
  reference?: { y: number; label: string }
}

const RANGE_ARIA: Record<TrendRange, string> = { w: "1 week", m: "1 month", "6m": "6 months" }
const RANGE_PRIOR: Record<TrendRange, string> = { w: "vs. prior week", m: "vs. prior month", "6m": "vs. prior 6 months" }
const RANGE_WORD: Record<TrendRange, string> = { w: "week", m: "month", "6m": "6 months" }
const RANGE_LABEL: Record<TrendRange, string> = { w: "W", m: "M", "6m": "6M" }

function colorFor(colorBy: TrendChartProps["colorBy"], v: number) {
  if (colorBy === "band") return DATA_COLORS[recoveryColor(v)].css
  if (colorBy === "stress") return DATA_COLORS[STRESS_COLOR[stressLevel(v)]].css
  if (colorBy === "strain") return DATA_COLORS.strain.css
  if (colorBy === "sleep") return DATA_COLORS.sleep.css
  return DATA_COLORS["chart-5"].css
}

function Trend({ points, p }: { points: TrendPoint[]; p: TrendChartProps }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const today = useOptionalShellStatus()?.today ?? points.at(-1)?.date ?? ""
  const anim = useSeriesAnimation()
  const fallback = p.defaultRange ?? "m"
  const urlRange = params.get("r") ? parseRange(params.get("r") ?? undefined) : fallback
  const [range, setRange] = React.useState<TrendRange>(p.fixedRange ?? urlRange)
  const [active, setActive] = React.useState<number | null>(null)
  // Follow `?r=` when it changes elsewhere (another chart, back/forward) without an effect.
  const [lastUrlRange, setLastUrlRange] = React.useState(urlRange)
  if (urlRange !== lastUrlRange) {
    setLastUrlRange(urlRange)
    if (!p.fixedRange) setRange(urlRange)
  }

  const rows = points.slice(-RANGE_DAYS[range]).map((pt) => ({
    ...pt,
    fill: pt.value === null ? undefined : colorFor(p.colorBy, pt.value),
    fillOpacity: pt.provisional ? 0.45 : 1,
    text: pt.value === null ? "" : formatValue(p.format, pt.value),
  }))
  const values = rows.map((r) => r.value).filter((v): v is number => v !== null)
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  const delta = p.deltas?.[range] ?? null
  const tone = delta === null || !p.direction || delta === 0 ? null : deltaTone(p.direction, delta, 0).tone
  const scrubbed = active !== null ? rows[active] : null
  const line = range === "6m"
  // A single-hue 6M line (WHOOP Age, VO2 max, vitals) fits its data; bars always start at zero.
  const domain: [number | "auto", number | "auto"] =
    p.colorBy === "band" ? [0, 100] : p.colorBy === "stress" ? [0, 3] : line && p.colorBy === "single" ? ["auto", "auto"] : [0, "auto"]

  const ticks =
    range === "w"
      ? rows.map((r) => r.date)
      : range === "m"
        ? rows.filter((_, i) => (rows.length - 1 - i) % 7 === 0).map((r) => r.date)
        : rows.filter((r, i) => i > 0 && r.date.slice(0, 7) !== rows[i - 1].date.slice(0, 7)).map((r) => r.date)
  const tickFormat = (d: string) => format(parseISO(d), range === "w" ? "EEEEE" : range === "m" ? "MMM d" : "MMM")

  const summary = values.length
    ? `${p.label} over the last ${RANGE_WORD[range]}: average ${spoken(formatValue(p.format, avg), p.unit)}, range ${formatValue(p.format, Math.min(...values))} to ${formatValue(p.format, Math.max(...values))}${rows.length - values.length ? `, ${rows.length - values.length} ${rows.length - values.length === 1 ? "day" : "days"} missing` : ""}.`
    : `No ${p.label} data in the last ${RANGE_WORD[range]}.`

  const changeRange = (v: string) => {
    if (!v) return
    setRange(v as TrendRange)
    setActive(null)
    router.replace(`${pathname}${withParam(params.toString(), "r", v === fallback ? null : v)}`, { scroll: false })
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0" aria-live="polite">
          <p className="text-xs leading-4 font-bold tracking-[0.08em] text-muted-foreground uppercase tabular-nums">
            {scrubbed ? dayLabel(scrubbed.date, today) : "Average"}
          </p>
          <ValueUnit
            value={formatValue(p.format, scrubbed ? scrubbed.value : avg)}
            unit={p.unit}
            className="block font-numeric text-[28px] leading-8 font-bold"
          />
          {!scrubbed && delta !== null && (
            <StatusChip
              tone={tone === "good" ? "optimal" : tone === "bad" ? "warning" : "neutral"}
              delta={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}
              className="mt-1"
            >
              {formatValue(p.format, Math.abs(delta))}
              {p.unit === "%" ? "%" : p.unit ? ` ${p.unit}` : ""} {RANGE_PRIOR[range]}
            </StatusChip>
          )}
        </div>
        {!p.fixedRange && (
          <ToggleGroup type="single" value={range} onValueChange={changeRange} spacing={0} className="shrink-0 gap-0.5 rounded-lg bg-muted p-0.5" aria-label="Range">
            {(["w", "m", "6m"] as const).map((r) => (
              <ToggleGroupItem
                key={r}
                value={r}
                aria-label={RANGE_ARIA[r]}
                className="h-10 min-w-11 rounded-md! px-3 font-numeric text-[13px] font-bold text-muted-foreground transition-[background-color,color] duration-150 ease-standard hover:bg-transparent hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground"
              >
                {RANGE_LABEL[r]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      {values.length === 0 ? (
        <div className="grid h-[200px] place-items-center">
          <EmptyState body="No data in this range yet." />
        </div>
      ) : (
        <ChartFigure summary={summary} config={{ value: { label: p.label, color: colorFor(p.colorBy, avg ?? 0) } }} className="h-[200px]">
          <ComposedChart
            data={rows}
            accessibilityLayer
            margin={{ top: range === "w" ? 18 : 8, right: 4, bottom: 0, left: 4 }}
            onMouseMove={(s) => setActive(s?.activeTooltipIndex == null ? null : Number(s.activeTooltipIndex))}
            onMouseLeave={() => setActive(null)}
          >
            <CartesianGrid {...GRID} />
            <XAxis dataKey="date" {...AXIS} ticks={ticks} tickFormatter={tickFormat} interval={range === "w" ? 0 : "preserveStartEnd"} minTickGap={8} />
            <YAxis hide={!line} {...AXIS} width={32} tickCount={3} domain={domain} tickFormatter={(v: number) => formatValue(p.format, v)} />
            {p.baseline && (
              <ReferenceArea y1={p.baseline.mean - p.baseline.sd} y2={p.baseline.mean + p.baseline.sd} fill="var(--chart-band)" fillOpacity={1} ifOverflow="extendDomain" />
            )}
            {p.reference && (
              <ReferenceLine
                y={p.reference.y}
                stroke="var(--chart-cursor)"
                strokeDasharray="4 4"
                ifOverflow="extendDomain"
                label={{ value: p.reference.label, position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            )}
            {/* WHOOP's month bars carry a dashed average line [latest-trends-1] (spec §11 F21). */}
            {!line && range !== "w" && avg !== null && (
              <ReferenceLine
                y={avg}
                stroke="var(--chart-cursor)"
                strokeDasharray="3 3"
                label={{ value: "Avg", position: "insideBottomLeft", fill: "var(--foreground-secondary)", fontSize: 11, fontWeight: 600 }}
              />
            )}
            {p.target && <ReferenceArea y1={p.target[0]} y2={p.target[1]} fill="var(--dial-target)" fillOpacity={0.3} ifOverflow="extendDomain" />}
            <ChartTooltip
              isAnimationActive={false}
              cursor={line ? LINE_CURSOR : BAR_CURSOR}
              content={
                <ChartTooltipContent
                  className={TOOLTIP_CLASS}
                  indicator="line"
                  hideIndicator
                  labelFormatter={(_, payload) => dayLabel(String(payload?.[0]?.payload?.date ?? ""), today)}
                  formatter={(_, __, item) => {
                    const row = item.payload as (typeof rows)[number]
                    return (
                      <div className="grid gap-1">
                        <TooltipLine color={row.fill}>
                          {row.text}
                          {p.unit ? (p.unit === "%" ? "%" : ` ${p.unit}`) : ""}
                        </TooltipLine>
                        {row.provisional && <span className="text-muted-foreground">Provisional</span>}
                      </div>
                    )
                  }}
                />
              }
            />
            {line ? (
              <Line
                dataKey="value"
                type="monotone"
                stroke="var(--foreground-secondary)"
                strokeWidth={1.5}
                connectNulls={false}
                dot={(d: { cx?: number; cy?: number; index?: number; payload?: (typeof rows)[number] }) =>
                  d.payload?.value == null || d.cx == null || d.cy == null ? (
                    <g key={d.index} />
                  ) : (
                    <circle key={d.index} cx={d.cx} cy={d.cy} r={3} fill={d.payload.fill} fillOpacity={d.payload.fillOpacity} />
                  )
                }
                activeDot={{ r: 5, strokeWidth: 0 }}
                {...anim}
              />
            ) : (
              <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={28} {...anim}>
                {range === "w" && <LabelList dataKey="text" position="top" fill="var(--foreground)" fontSize={11} />}
              </Bar>
            )}
          </ComposedChart>
        </ChartFigure>
      )}
      {(p.baseline || p.target) && values.length > 0 && (
        <p className={cn("mt-2 text-xs leading-4 font-medium text-muted-foreground")}>
          {p.target ? "Shaded: your Strain Target" : "Shaded: your normal range"}
        </p>
      )}
    </div>
  )
}

/** One metric over W, M or 6M (spec §5.5). The range lives in `?r=` (default `m`). */
export function TrendChart(p: TrendChartProps) {
  return (
    <MetricState metric={p.data} skeleton={<TrendChartSkeleton />} empty={<EmptyState body="No data in this range yet." />}>
      {(points) => (
        <React.Suspense fallback={<TrendChartSkeleton />}>
          <Trend points={points} p={p} />
        </React.Suspense>
      )}
    </MetricState>
  )
}

export function TrendChartSkeleton() {
  // The header's real label and a disabled range toggle; bars for the numbers; the plot at its fixed height (spec §5.19).
  return (
    <div aria-hidden className="min-w-0">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs leading-4 font-bold tracking-[0.08em] text-muted-foreground uppercase">Average</p>
          <SkeletonText className="w-[4ch] font-numeric text-[28px] leading-8 font-bold" />
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-lg bg-muted p-0.5">
          {(["w", "m", "6m"] as const).map((r) => (
            <span key={r} className="grid h-10 min-w-11 place-items-center rounded-md px-3 font-numeric text-[13px] font-bold text-muted-foreground/60">
              {RANGE_LABEL[r]}
            </span>
          ))}
        </div>
      </div>
      <Skeleton className="h-[200px] rounded-lg bg-muted/60" />
    </div>
  )
}
TrendChart.Skeleton = TrendChartSkeleton
