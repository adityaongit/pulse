"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { DATA_COLORS } from "@/lib/bands"
import { hourTicks, hypnogramSeries, STAGES, type Stage, type StageSegment } from "@/lib/charts"
import { clock } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellStatus } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { AXIS, ChartFigure, LINE_CURSOR, TOOLTIP_CLASS, TooltipLine, useSeriesAnimation } from "./ChartFrame"

export type HypnogramNight = { bed: number; wake: number; segments: StageSegment[] }
export type HypnogramProps = {
  /** null or no segments: the night has no stage data (Fitbit only stages sleeps over about 3 h). */
  data: Metric<HypnogramNight> | null | undefined
}

const STAGE_NAME: Record<Stage, string> = { awake: "Awake", rem: "REM", light: "Light", deep: "Deep" }
const LANE_NAME = ["Deep", "Light", "REM", "Awake"]

function Chart({ night }: { night: HypnogramNight }) {
  const tz = useOptionalShellStatus()?.timeZone
  const anim = useSeriesAnimation()
  const { connector, stages } = hypnogramSeries(night.segments)
  const total = night.segments.reduce((a, s) => a + (s.end - s.start), 0)
  const share = (st: Stage) =>
    Math.round((night.segments.filter((s) => s.stage === st).reduce((a, s) => a + s.end - s.start, 0) / (total || 1)) * 100)
  const summary = `Sleep stages from ${clock(night.bed, tz)} to ${clock(night.wake, tz)}: ${STAGES.map((s) => `${STAGE_NAME[s]} ${share(s)} percent`).join(", ")}.`
  const segAt = (t: number) => night.segments.find((s) => s.start === t)

  return (
    <ChartFigure summary={summary} config={{}} className="h-40">
      <LineChart data={connector} accessibilityLayer margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[night.bed, night.wake]}
          ticks={hourTicks(night.bed, night.wake, night.wake - night.bed > 10 * 3_600_000 ? 2 : 1, tz)}
          tickFormatter={(v: number) => clock(v, tz)}
          interval="preserveStartEnd"
          {...AXIS}
        />
        <YAxis
          type="number"
          domain={[0, 3]}
          ticks={[3, 2, 1, 0]}
          tickFormatter={(v: number) => LANE_NAME[v] ?? ""}
          width={52}
          {...AXIS}
          tick={{ fontSize: 11, fontWeight: 700 }}
        />
        <ChartTooltip
          isAnimationActive={false}
          cursor={LINE_CURSOR}
          content={
            <ChartTooltipContent
              className={TOOLTIP_CLASS}
              hideIndicator
              labelFormatter={(_, payload) => {
                const s = segAt(Number(payload?.[0]?.payload?.t))
                return s ? `${clock(s.start, tz)} to ${clock(s.end, tz)}` : ""
              }}
              formatter={(_, __, item) => {
                const s = segAt(Number((item.payload as { t: number }).t))
                if (!s) return null
                return (
                  <TooltipLine color={DATA_COLORS[`stage-${s.stage}`].css}>
                    {STAGE_NAME[s.stage]}, {Math.round((s.end - s.start) / 60000)} min
                  </TooltipLine>
                )
              }}
            />
          }
        />
        <Line dataKey="lane" type="stepAfter" stroke="rgb(255 255 255 / 0.25)" strokeWidth={1.5} dot={false} activeDot={false} {...anim} />
        {STAGES.map((st) => (
          <Line
            key={st}
            data={stages[st]}
            dataKey="lane"
            type="stepAfter"
            stroke={DATA_COLORS[`stage-${st}`].css}
            strokeWidth={6}
            strokeLinecap="butt"
            dot={false}
            activeDot={false}
            connectNulls={false}
            tooltipType="none"
            {...anim}
          />
        ))}
      </LineChart>
    </ChartFigure>
  )
}

/** Last night's stages as a step chart over four lanes (spec §5.6, derived design). */
export function Hypnogram({ data }: HypnogramProps) {
  const empty = (
    <div className="grid h-40 place-items-center">
      <EmptyState body="No stage data for this night. Fitbit only stages sleeps longer than about 3 hours." />
    </div>
  )
  return (
    <MetricState
      metric={data}
      skeleton={<HypnogramSkeleton />}
      empty={empty}
      renderReason={(r) => (
        <div className="grid h-40 place-items-center">
          <ReasonPlaceholder reason={r} size="md" />
        </div>
      )}
    >
      {(night) => (night.segments.length ? <Chart night={night} /> : empty)}
    </MetricState>
  )
}

export function HypnogramSkeleton() {
  return <Skeleton aria-hidden className="h-40 rounded-lg" />
}
Hypnogram.Skeleton = HypnogramSkeleton
