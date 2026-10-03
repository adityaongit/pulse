// Shared by the Trends page and its loading shape.
import Link from "next/link"
import { cn } from "@/lib/utils"
import type { TrendRange } from "@/lib/url"
import { TREND_METRICS, type TrendMetricKey } from "@/server/queries/trends"

/** Chart card beside the Averages card from 1280 px. */
export const TRENDS_GRID = "grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-4"

export const PERIOD: Record<TrendRange, { label: string; prior: string }> = {
  w: { label: "Last 7 days", prior: "the 7 days before" },
  m: { label: "Last 30 days", prior: "the 30 days before" },
  "6m": { label: "Last 6 months", prior: "the 6 months before" },
  "1y": { label: "Last 12 months", prior: "the year before" },
}

/** One pill per metric: a horizontal strip edge to edge on phone, wrapping from 768 px. Links keep `?r=`. */
export function MetricPicker({ current, r }: { current?: TrendMetricKey; r?: string }) {
  return (
    <nav aria-label="Metric" className="-mx-4 md:mx-0">
      <ul className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-0">
        {TREND_METRICS.map((m) => (
          <li key={m.key} className="shrink-0">
            <Link
              href={`/trends?metric=${m.key}${r ? `&r=${r}` : ""}`}
              replace
              scroll={false}
              aria-current={m.key === current ? "page" : undefined}
              className={cn(
                "inline-flex h-10 items-center rounded-full bg-muted px-4 text-[13px] font-bold tracking-[0.06em] text-muted-foreground uppercase transition-[background-color,color,scale] duration-150 ease-standard outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
                "aria-[current=page]:bg-foreground aria-[current=page]:text-primary-foreground"
              )}
            >
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
