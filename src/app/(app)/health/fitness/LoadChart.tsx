"use client"

import { format, parseISO } from "date-fns"
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts"
import { formatValue } from "@/lib/format"
import type { FitnessVM } from "@/server/queries/types"
import { ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { AXIS, ChartFigure, GRID, LINE_CURSOR, TOOLTIP_CLASS, useSeriesAnimation } from "@/components/charts/ChartFrame"

const CONFIG = {
  ctl: { label: "Fitness", color: "var(--chart-1)" },
  atl: { label: "Fatigue", color: "var(--chart-4)" },
  tsb: { label: "Form", color: "var(--chart-2)" },
}

/** Fitness (CTL), fatigue (ATL) and form (TSB) over 90 days (spec §7.10). */
export function LoadChart({ load }: { load: FitnessVM["load"] }) {
  const anim = useSeriesAnimation()
  const last = [...load].reverse().find((p) => p.ctl !== null)
  const summary = last
    ? `Training load over 90 days: fitness ${formatValue("int", last.ctl)}, fatigue ${formatValue("int", last.atl)}, form ${formatValue("signedInt", last.tsb)} today.`
    : "No training load data yet."
  const ticks = load.filter((p, i) => i > 0 && p.day.slice(0, 7) !== load[i - 1].day.slice(0, 7)).map((p) => p.day)

  return (
    <ChartFigure summary={summary} config={CONFIG} className="h-[220px]">
      <ComposedChart data={load} accessibilityLayer margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="day" {...AXIS} ticks={ticks} tickFormatter={(d: string) => format(parseISO(d), "MMM")} />
        <YAxis {...AXIS} width={32} tickCount={4} tickFormatter={(v: number) => formatValue("int", v)} />
        <ReferenceLine y={0} stroke="var(--chart-cursor)" />
        <ChartTooltip
          cursor={LINE_CURSOR}
          content={
            <ChartTooltipContent
              className={TOOLTIP_CLASS}
              indicator="line"
              labelFormatter={(_, p) => format(parseISO(String(p?.[0]?.payload?.day ?? "")), "EEE, MMM d")}
              formatter={(v, name) => (
                <span className="flex w-full justify-between gap-3">
                  <span className="text-muted-foreground">{CONFIG[name as keyof typeof CONFIG]?.label}</span>
                  <span className="tabular-nums">{formatValue(name === "tsb" ? "signedInt" : "int", Number(v))}</span>
                </span>
              )}
            />
          }
        />
        <Bar dataKey="tsb" fill="var(--color-tsb)" maxBarSize={4} {...anim}>
          {load.map((p) => (
            <Cell key={p.day} fill={(p.tsb ?? 0) < 0 ? "var(--warning)" : "var(--chart-2)"} fillOpacity={0.6} />
          ))}
        </Bar>
        <Line dataKey="ctl" type="monotone" stroke="var(--color-ctl)" strokeWidth={2} dot={false} connectNulls={false} {...anim} />
        <Line dataKey="atl" type="monotone" stroke="var(--color-atl)" strokeWidth={1.5} dot={false} connectNulls={false} {...anim} />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartFigure>
  )
}
