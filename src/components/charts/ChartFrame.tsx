"use client"

import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"

/** `<figure>` + sr-only summary + ChartContainer with the spec's chart text and fixed height (spec §5.0). */
export function ChartFigure({
  summary,
  config,
  className,
  grow,
  children,
}: {
  summary: string
  config: ChartConfig
  /** A fixed height class, e.g. "h-[200px]". With `grow`, the minimum height. */
  className: string
  /**
   * Fill a card stretched to its row (SYM4): the plot takes the spare height. Recharts needs a definite height, so
   * `className` keeps a fixed one where the card is not stretched (below 1280 px) and a minimum from there.
   */
  grow?: boolean
  children: React.ComponentProps<typeof ChartContainer>["children"]
}) {
  return (
    <figure className={cn("min-w-0", grow && "flex flex-1 flex-col")}>
      <figcaption className="sr-only">{summary}</figcaption>
      {/* Recharts' keyboard layer makes the plot a tab stop (arrows scrub the tooltip). No outline box on the plot:
          Chrome treated a click as focus-visible and drew a box round the chart; keyboard focus already shows as the
          tooltip and cursor appearing (user report, 2026-10-03). */}
      <ChartContainer
        config={config}
        className={cn(
          "aspect-auto w-full font-numeric text-xs font-medium [&_.recharts-surface]:rounded-md [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none",
          className,
          grow && "xl:flex-1"
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
