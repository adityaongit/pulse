import { partColor } from "@/lib/bands"
import { cn } from "@/lib/utils"
import { LABEL } from "./primitives"

/**
 * The legend over a Trend View chart, top right as the reference app sets it: the typical-range swatch on vitals,
 * square swatches for a stack (top part first), rings for a pair of lines.
 */
export function TrendLegend({ chart, series, typical, className }: { chart: string; series?: readonly { key: string; label: string }[]; typical?: boolean; className?: string }) {
  const items =
    typical
      ? [{ key: "typical", label: "Typical range", swatch: <span className="size-2.5 rounded-[2px] bg-chart-band ring-1 ring-foreground/15" /> }]
      : series && chart === "stack"
        ? [...series].reverse().map((s) => ({ key: s.key, label: s.label, swatch: <span className="size-2.5 rounded-[2px]" style={{ background: partColor(s.key) }} /> }))
        : series && chart === "pair"
          ? series.map((s) => ({ key: s.key, label: s.label, swatch: <span className="size-2.5 rounded-full border-2" style={{ borderColor: partColor(s.key) }} /> }))
          : []
  if (!items.length) return null
  return (
    <p className={cn(LABEL, "mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[11px] text-foreground-secondary", className)}>
      {items.map((i) => (
        <span key={i.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-flex">{i.swatch}</span>
          {i.label}
        </span>
      ))}
    </p>
  )
}
