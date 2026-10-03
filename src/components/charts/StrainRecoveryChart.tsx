"use client"

import { format, parseISO } from "date-fns"
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, XAxis, YAxis } from "recharts"
import { recoveryBand } from "@/lib/bands"
import { formatValue } from "@/lib/format"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { AXIS, ChartFigure, GRID, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation } from "./ChartFrame"

export type StrainRecoveryPoint = { day: string; strain: number | null; recovery: number | null }

// Text colours on the dark card: red labels use the lifted red (spec §2.3 ◆).
const BAND_TEXT = { green: "var(--recovery-green)", yellow: "var(--recovery-yellow)", red: "var(--recovery-red-text)" } as const
const BAND_FILL = { green: "var(--recovery-green)", yellow: "var(--recovery-yellow)", red: "var(--recovery-red)" } as const
const RIGHT_TICKS = [0, 33, 66, 100]
const LEFT_TICKS = [0, 7, 14, 21]

type Row = StrainRecoveryPoint & { label: string; date: string; today: boolean; hl: number | null }

type TickProps = { x?: number; y?: number; payload?: { value: string | number; index?: number }; rows?: Row[] }
type LabelProps = { x?: number | string; y?: number | string; value?: unknown }

/** Two-line day tick ("Fri" over "17"); today in white and bold. */
function XTick({ x = 0, y = 0, payload, rows = [] }: TickProps) {
  const row = rows[payload?.index ?? 0]
  if (!row) return null
  const [wd, dd] = row.label.split(" ")
  return (
    <text x={x} y={y + 4} textAnchor="middle" fontSize={12} fill={row.today ? "var(--foreground)" : "var(--muted-foreground)"} fontWeight={row.today ? 700 : 500}>
      <tspan x={x} dy="0.71em">
        {wd}
      </tspan>
      <tspan x={x} dy="1.35em">
        {dd}
      </tspan>
    </text>
  )
}

/** Right-axis percentages in their band colours (0 and 33 red, 66 yellow, 100 green). */
function RightTick({ x = 0, y = 0, payload }: TickProps) {
  const v = Number(payload?.value)
  return (
    <text x={x} y={y} dy="0.32em" fontSize={12} fontWeight={600} fill={BAND_TEXT[recoveryBand(v)]}>
      {v}%
    </text>
  )
}

function RecoveryDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Row }) {
  if (cx == null || cy == null || payload?.recovery == null) return null
  return <circle cx={cx} cy={cy} r={4} fill="var(--card)" stroke={BAND_FILL[recoveryBand(payload.recovery)]} strokeWidth={2} />
}

function RecoveryLabel({ x, y, value }: LabelProps) {
  if (typeof value !== "number" || x == null || y == null) return null
  return (
    <text x={Number(x)} y={Number(y) - 10} textAnchor="middle" fontSize={12} fontWeight={700} fill={BAND_TEXT[recoveryBand(value)]}>
      {Math.round(value)}%
    </text>
  )
}

/** Under the dot as WHOOP draws it; above it near the floor, so it never sits on the day ticks. */
function StrainLabel({ x, y, value }: LabelProps) {
  if (typeof value !== "number" || x == null || y == null) return null
  return (
    <text x={Number(x)} y={Number(y) + (value >= 3.5 ? 20 : -10)} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--strain-text)">
      {formatValue("decimal1", value)}
    </text>
  )
}

/**
 * WHOOP's Home "Strain & Recovery" week [latest-home-collapsed-2]: Strain on the left axis (0-21, blue),
 * Recovery on the right (0-100 %, band colours), hollow dots with value labels, today's column lit.
 * Missing days are gaps, never interpolated.
 */
export function StrainRecoveryChart({ points, today, grow }: { points: StrainRecoveryPoint[]; today: string; grow?: boolean }) {
  const anim = useSeriesAnimation()
  const rows: Row[] = points.map((p) => ({
    ...p,
    label: format(parseISO(p.day), "EEE d"),
    date: format(parseISO(p.day), "EEE, MMM d"),
    today: p.day === today,
    hl: p.day === today ? 100 : null,
  }))
  const strains = points.map((p) => p.strain).filter((v): v is number => v !== null)
  const recs = points.map((p) => p.recovery).filter((v): v is number => v !== null)
  const summary = `Strain and Recovery over the last ${points.length} days: Strain ${
    strains.length ? `from ${formatValue("decimal1", Math.min(...strains))} to ${formatValue("decimal1", Math.max(...strains))}` : "not recorded"
  }, Recovery ${recs.length ? `from ${Math.round(Math.min(...recs))} to ${Math.round(Math.max(...recs))} percent` : "not recorded"}.`

  return (
    <ChartFigure summary={summary} config={{ strain: { label: "Strain" }, recovery: { label: "Recovery" } }} className={grow ? "h-[232px] xl:h-auto xl:min-h-[232px]" : "h-[232px]"} grow={grow}>
      <ComposedChart data={rows} accessibilityLayer margin={{ top: 20, right: 4, bottom: 0, left: 4 }} barCategoryGap="18%">
        <CartesianGrid {...GRID} yAxisId="s" />
        <XAxis dataKey="label" interval={0} height={40} tick={<XTick rows={rows} />} {...AXIS} tickMargin={4} />
        <YAxis yAxisId="s" domain={[0, 21]} ticks={LEFT_TICKS} width={24} tick={{ fill: "var(--strain-text)", fontSize: 12, fontWeight: 600 }} {...AXIS} />
        <YAxis yAxisId="r" orientation="right" domain={[0, 100]} ticks={RIGHT_TICKS} width={40} tick={<RightTick />} {...AXIS} />
        {/* Today's column: a light band behind both series, as WHOOP lights the current day. */}
        <Bar yAxisId="r" dataKey="hl" fill="rgb(255 255 255 / 0.06)" radius={6} isAnimationActive={false} tooltipType="none" />
        <ChartTooltip
          isAnimationActive={false}
          cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
          allowEscapeViewBox={{ x: false, y: false }}
          wrapperStyle={{ pointerEvents: "none" }}
          content={
            <ChartTooltipContent
              className={TOOLTIP_CLASS}
              hideIndicator
              labelFormatter={(_, payload) => (payload?.[0]?.payload as Row | undefined)?.date ?? ""}
              formatter={(value, name) => {
                if (name === "hl" || value == null) return null
                return name === "strain" ? (
                  <TooltipLine color="var(--strain)">Strain {formatValue("decimal1", Number(value))}</TooltipLine>
                ) : (
                  <TooltipLine color={BAND_FILL[recoveryBand(Number(value))]}>Recovery {Math.round(Number(value))}%</TooltipLine>
                )
              }}
            />
          }
        />
        <Line
          yAxisId="r"
          dataKey="recovery"
          type="linear"
          stroke="var(--foreground-secondary)"
          strokeOpacity={0.35}
          strokeWidth={1.5}
          connectNulls={false}
          dot={(props: { cx?: number; cy?: number; payload?: Row; index?: number }) => <RecoveryDot key={props.index} {...props} />}
          activeDot={false}
          {...anim}
        >
          <LabelList dataKey="recovery" content={<RecoveryLabel />} />
        </Line>
        <Line
          yAxisId="s"
          dataKey="strain"
          type="linear"
          stroke="var(--strain)"
          strokeWidth={2}
          connectNulls={false}
          dot={{ r: 4, fill: "var(--card)", stroke: "var(--strain)", strokeWidth: 2 }}
          activeDot={{ r: 5, fill: "var(--strain)", stroke: "var(--card)", strokeWidth: 2 }}
          {...anim}
        >
          <LabelList dataKey="strain" content={<StrainLabel />} />
        </Line>
      </ComposedChart>
    </ChartFigure>
  )
}

export function StrainRecoveryChartSkeleton() {
  return <Skeleton aria-hidden className="h-[232px] rounded-lg bg-muted/60" />
}
StrainRecoveryChart.Skeleton = StrainRecoveryChartSkeleton
