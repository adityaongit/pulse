"use client"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

/** `<figure>` + sr-only summary + ChartContainer with the spec's chart text and fixed height (spec §5.0). */
export function ChartFigure({
  summary,
  config,
  className,
  children,
}: {
  summary: string
  config: ChartConfig
  /** A fixed height class, e.g. "h-[200px]". */
  className: string
  children: React.ComponentProps<typeof ChartContainer>["children"]
}) {
  return (
    <figure className="min-w-0">
      <figcaption className="sr-only">{summary}</figcaption>
      {/* Recharts' keyboard layer makes the plot a tab stop (arrows scrub the tooltip); ChartContainer hides its outline,
          so the focused plot gets the app's ring back (U18 G-06). */}
      <ChartContainer
        config={config}
        className={cn(
          "aspect-auto w-full font-numeric text-xs font-medium [&_.recharts-surface]:rounded-md [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring/50",
          className
        )}
      >
        {children}
      </ChartContainer>
    </figure>
  )
}

/** Animation props for every series: 500 ms ease-out, off under reduced motion. */
export function useSeriesAnimation() {
  const reduced = useReducedMotion()
  return { isAnimationActive: !reduced, animationDuration: 500, animationEasing: "ease-out" as const }
}

export const GRID = { vertical: false, stroke: "var(--chart-grid)" } as const
export const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const
export const LINE_CURSOR = { stroke: "var(--chart-cursor)", strokeWidth: 1 }
export const BAR_CURSOR = { fill: "rgb(255 255 255 / 0.05)" }
export const TOOLTIP_CLASS = "rounded-xl border-0 bg-popover shadow-overlay ring-1 ring-white/10"

/** One tooltip line: a colour tick and text. */
export function TooltipLine({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="h-3 w-1 shrink-0 rounded-[2px]" style={{ background: color }} />}
      <span className="text-foreground tabular-nums">{children}</span>
    </div>
  )
}
