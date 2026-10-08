"use client"

import { cn } from "@/lib/utils"
import { bandColor, bandStops, type Band } from "@/lib/charts"
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
    // Axis and value labels in tabular figures, so ticks of equal width line up ("0:00", "06:36").
    <figure className={cn("min-w-0 tabular-nums", grow && "flex flex-1 flex-col")}>
      <figcaption className="sr-only">{summary}</figcaption>
      {/* Recharts' keyboard layer makes the plot (its <svg>) a tab stop; arrows scrub the tooltip. The default outline
          box is off: it showed on click (user report, 2026-10-03). The focus ring is the app's, on :focus-visible only,
          so tabbing to a chart shows it and a click or tap does not. An outline, since box-shadow rings skip <svg>. A tap on a
          mark focuses Recharts' <g tabindex="-1"> layer instead; globals.css drops that outline (spec §11 UX3). */}
      <ChartContainer
        config={config}
        className={cn(
          "aspect-auto w-full font-numeric text-xs font-medium [&_.recharts-surface]:rounded-md [&_.recharts-surface]:outline-none [&_.recharts-surface:focus-visible]:outline-3 [&_.recharts-surface:focus-visible]:outline-solid [&_.recharts-surface:focus-visible]:outline-ring/50 [&_.recharts-wrapper]:outline-none",
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

/** Dashed, faint horizontal lines (WHOOP and Bevel both dash theirs). */
export const GRID = { vertical: false, stroke: "var(--chart-grid)", strokeDasharray: "3 4" } as const
export const AXIS = { tickLine: false, axisLine: false, tickMargin: 8 } as const
/** Characters to px at 11 px bold, for pills and gutters. */
const textWidth = (t: string) => Math.ceil(t.length * 6.6)

/**
 * Right margin that holds reference-line pills ("Avg", "7,000", "Your age") outside the plot, so bars and lines never
 * run under them. Pair with `gutterLabel`.
 */
export const labelGutter = (labels: (string | false | null | undefined)[], base = 4) => {
  const widest = Math.max(0, ...labels.map((l) => (l ? textWidth(l) : 0)))
  return widest ? Math.max(base, widest + 16) : base
}

type LabelViewBox = { x?: number; y?: number; width?: number; height?: number }

export type { Band }

/** A filled pill at (x, y), vertically centred: the label of a reference line or a marked point. */
export function Pill({ x, y, text, fill = "var(--secondary)", color = "var(--foreground-secondary)", anchor = "start" }: { x: number; y: number; text: string; fill?: string; color?: string; anchor?: "start" | "middle" }) {
  const w = textWidth(text) + 10
  const left = anchor === "middle" ? x - w / 2 : x
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - 9} width={w} height={18} rx={9} fill={fill} />
      <text x={left + w / 2} y={y} dy="0.35em" textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
        {text}
      </text>
    </g>
  )
}

/** A reference line's label as a pill in the right gutter (see `labelGutter`). */
export const gutterLabel = (value: string, color = "var(--foreground-secondary)") =>
  function GutterLabel({ viewBox }: { viewBox?: LabelViewBox }) {
    const v = viewBox ?? {}
    return <Pill x={(v.x ?? 0) + (v.width ?? 0) + 4} y={v.y ?? 0} text={value} color={color} />
  }

/** Tick text for a numeric axis: whole numbers drop their ".0" (48, not 48.0); others keep the metric's format. */
export const wholeTick = (fmt: (v: number) => string) => (v: number) => (Number.isInteger(v) ? Math.round(v).toLocaleString("en-US") : fmt(v))

/**
 * A vertical gradient that colours each height by the band of its value: the line or area takes the band colour where
 * it passes. Gradients in objectBoundingBox units span the shape's own box, so the stops are placed from the series'
 * `top` and `bottom` values (a line's box runs from its highest to its lowest point). For strokes: in a fill the
 * hard stops read as stacked blocks, so fills use `FadeGradient`.
 */
export function BandGradient({ id, top, bottom, bands }: { id: string; top: number; bottom: number; bands: Band[] }) {
  if (!(top > bottom)) return null
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      {bandStops(top, bottom, bands).map((s, i) => (
        <stop key={i} offset={s.offset} stopColor={s.color} />
      ))}
    </linearGradient>
  )
}

/** `url(#id)` when the series spans some height; a zero-height box draws nothing with a bounding-box gradient, so a flat series takes its band colour. */
export const bandPaint = (id: string, top: number, bottom: number, bands: Band[]) => (top > bottom ? `url(#${id})` : bandColor(top, bands))

/** A one-colour fade: `color` at `from` opacity at the top to `to` at the floor (an area under a line fades to nothing). */
export function FadeGradient({ id, color, from = 0.35, to = 0 }: { id: string; color: string; from?: number; to?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={from} />
      <stop offset="100%" stopColor={color} stopOpacity={to} />
    </linearGradient>
  )
}

/** Active dot: the series colour with a soft halo, as both reference apps mark the scrubbed point. */
export function GlowDot({ cx, cy, fill }: { cx?: number; cy?: number; fill?: string }) {
  if (cx == null || cy == null) return null
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={9} fill={fill} fillOpacity={0.22} />
      <circle cx={cx} cy={cy} r={4.5} fill={fill} stroke="var(--card)" strokeWidth={2} />
    </g>
  )
}

export const LINE_CURSOR = { stroke: "var(--chart-cursor)", strokeWidth: 1, strokeDasharray: "3 3" }
export const BAR_CURSOR = { fill: "color-mix(in srgb, var(--foreground) 5%, transparent)" }
export const TOOLTIP_CLASS = "rounded-xl border-0 bg-popover shadow-overlay ring-1 ring-foreground/10"

/** One tooltip line: a colour tick and text. */
export function TooltipLine({ color, children }: { color?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {color && <span className="h-3 w-1 shrink-0 rounded-[2px]" style={{ background: color }} />}
      <span className="text-foreground tabular-nums">{children}</span>
    </div>
  )
}
