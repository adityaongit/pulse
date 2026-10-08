import Link from "next/link"
import { notFound } from "next/navigation"
import { ChevronLeft, ChevronRight, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { partColor } from "@/lib/bands"
import { formatValue } from "@/lib/format"
import { parseOffset, parseTrendRange, TREND_VIEW_RANGES, type TrendViewRange } from "@/lib/trend"
import { trendHref } from "@/lib/url"
import { TrendViewChart } from "@/components/charts/TrendViewChart"
import { BreakdownBar } from "@/components/metrics/BreakdownBar"
import { LABEL, SEGMENT_ITEM, SEGMENT_TRACK, StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { TrendMetricMenu } from "@/components/metrics/TrendMetricMenu"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { getTrendView, isTrendViewKey, priorLabel, TREND_VIEW, type TrendViewVM } from "@/server/queries/trendView"
import { pageDay, type SearchParams } from "../../_lib/day"
import { STAT_ICON } from "../../_lib/view"

const RANGE_TEXT: Record<TrendViewRange, string> = { w: "W", m: "M", "6m": "6M" }
const RANGE_ARIA: Record<TrendViewRange, string> = { w: "1 week", m: "1 month", "6m": "6 months" }

export async function generateMetadata({ params }: PageProps<"/trend/[key]">) {
  const { key } = await params
  return { title: isTrendViewKey(key) ? `${TREND_VIEW[key].label} trend` : "Trend view" }
}

/** Trend View `/trend/[key]?d=&r=&p=` (spec §11 R29): one metric over a W / M / 6M window, stepped back `p` periods. */
export default async function TrendViewPage({ params, searchParams }: PageProps<"/trend/[key]">) {
  const { key } = await params
  if (!isTrendViewKey(key)) notFound()
  const sp = await searchParams
  const { d, today, ctx } = await pageDay(searchParams as SearchParams, `/trend/${key}`)
  const range = parseTrendRange(sp.r)
  const offset = parseOffset(sp.p)
  const vm = await getTrendView(key, d, range, offset, ctx)
  const href = (o: { key?: string; r?: TrendViewRange; p?: number }) => trendHref(o.key ?? key, { d, today, r: o.r ?? range, p: o.p ?? offset })

  return (
    <DetailShell
      title="Trend view"
      primary={
        <div className="flex flex-col gap-6">
          <TrendMetricMenu
            current={key}
            options={vm.options.map((o) => ({ key: o.key, label: o.label, href: trendHref(o.key, { d, today, r: range }), icon: STAT_ICON[o.key] }))}
          />
          <Headline vm={vm} href={href} />
          <p className="max-w-[60ch] text-[17px] leading-6 font-medium text-pretty">{vm.verdict}</p>
          <div className="min-w-0">
            <Legend vm={vm} />
            <TrendViewChart
              label={vm.label}
              bars={vm.bars}
              chart={vm.chart}
              range={vm.range}
              colorBy={vm.colorBy}
              format={vm.format}
              unit={vm.unit}
              direction={vm.direction}
              series={vm.series}
              domain={vm.domain}
              typical={vm.typical}
              average={vm.value}
              segments={vm.segments}
            />
            {vm.footnote && (
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-5 text-muted-foreground">
                <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
                {vm.footnote}
              </p>
            )}
          </div>
        </div>
      }
      secondary={[
        vm.breakdown && (
          <div key="breakdown" className="xl:rounded-2xl xl:bg-card xl:p-5">
            <BreakdownBar {...vm.breakdown} />
          </div>
        ),
        <SectionShell key="about" variant="card" level={2} title={vm.about.title} className={vm.breakdown ? undefined : "xl:col-span-2"}>
          <div className="max-w-[65ch] space-y-3 text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            {vm.about.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </SectionShell>,
      ].filter(Boolean)}
    />
  )
}

function Headline({ vm, href }: { vm: TrendViewVM; href: (o: { r?: TrendViewRange; p?: number }) => string }) {
  const arrow = "grid size-10 place-items-center rounded-full text-foreground transition-[background-color,scale] duration-150 ease-standard outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3">
      <div className="min-w-0">
        <p className={cn(LABEL, "text-muted-foreground")}>{vm.caption}</p>
        <ValueUnit value={formatValue(vm.format, vm.value)} unit={vm.format === "duration" ? "hr" : vm.unit} className="block font-numeric text-[34px] leading-10 font-bold" />
        {vm.change !== null && (
          <StatusChip tone={vm.tone === "good" ? "optimal" : vm.tone === "bad" ? "warning" : "neutral"} delta={vm.change > 0 ? "up" : vm.change < 0 ? "down" : "flat"} className="mt-1">
            {Math.abs(vm.change)}% {priorLabel(vm.range)}
          </StatusChip>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <nav aria-label="Range" className={SEGMENT_TRACK}>
          {TREND_VIEW_RANGES.map((r) => (
            <Link key={r} href={href({ r, p: 0 })} replace scroll={false} aria-label={RANGE_ARIA[r]} aria-current={r === vm.range ? "page" : undefined} className={cn(SEGMENT_ITEM, "min-w-14")}>
              {RANGE_TEXT[r]}
            </Link>
          ))}
        </nav>
        <nav aria-label="Period" className="flex items-center gap-1">
          {vm.canPrev ? (
            <Link href={href({ p: vm.offset + 1 })} replace scroll={false} aria-label="Previous period" className={arrow}>
              <ChevronLeft aria-hidden strokeWidth={2.5} className="size-5" />
            </Link>
          ) : (
            <span aria-hidden className={cn(arrow, "text-muted-foreground/40")}>
              <ChevronLeft strokeWidth={2.5} className="size-5" />
            </span>
          )}
          <span className="font-numeric text-[13px] leading-4 font-bold tracking-[0.06em] whitespace-nowrap uppercase tabular-nums">{vm.period}</span>
          {vm.offset > 0 ? (
            <Link href={href({ p: vm.offset - 1 })} replace scroll={false} aria-label="Next period" className={arrow}>
              <ChevronRight aria-hidden strokeWidth={2.5} className="size-5" />
            </Link>
          ) : (
            <span aria-hidden className={cn(arrow, "text-muted-foreground/40")}>
              <ChevronRight strokeWidth={2.5} className="size-5" />
            </span>
          )}
        </nav>
      </div>
    </div>
  )
}

/** The legend over the chart: the typical-range swatch (vitals) or the stack's parts, top right as the reference app sets it. */
function Legend({ vm }: { vm: TrendViewVM }) {
  if (vm.typical)
    return (
      <p className={cn(LABEL, "mb-2 flex items-center justify-end gap-2 text-foreground-secondary")}>
        <span aria-hidden className="size-2.5 rounded-[2px] bg-chart-band ring-1 ring-foreground/15" />
        Typical range
      </p>
    )
  if (!vm.series || vm.chart !== "stack") return null
  return (
    <p className={cn(LABEL, "mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-foreground-secondary")}>
      {[...vm.series].reverse().map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-[2px]" style={{ background: partColor(s.key) }} />
          {s.label}
        </span>
      ))}
    </p>
  )
}
