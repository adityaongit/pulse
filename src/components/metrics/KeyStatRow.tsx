import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { deltaTone, type ChipTone, type DeltaDir, type GoodDirection, type Tone } from "@/lib/bands"
import { formatValue, MISSING, statSentence, type FormatKey } from "@/lib/format"
import { reasonCopy, type Metric, type ReasonCode } from "@/lib/reasons"
import { CARD_MATERIAL } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"
import { MetricState, type MetricMeta } from "@/components/shells/MetricState"
import { DeltaMark, MetricTags, StatusChip, ValueUnit } from "./primitives"

export type SleepStatus = "poor" | "sufficient" | "optimal"

export type KeyStatRowProps = {
  /** `row` inside a card's list; `card` is a row that is its own card (Home "My Dashboard", V9); `tile` for grids. */
  variant: "row" | "card" | "tile"
  /** A lucide icon element (20 px, muted) or a swatch. */
  icon?: React.ReactNode
  label: string
  /** A caption under the label ("Typical 5-10%"). */
  caption?: string
  metric: Metric<number> | null | undefined
  unit?: string
  format: FormatKey
  /** The 30-day average, shown under the value (row) or as the delta chip (tile). */
  average?: number | null
  /** Spoken name of the comparison; default "30-day average". */
  averageLabel?: string
  /** Good direction for the arrow tone; "none" hides the arrow (Strain Target, stage rows). */
  direction: GoodDirection | "none"
  sd?: number
  /** Sleep summary rows: three segments before the value. */
  status?: SleepStatus
  /** Tile status chip ("within 16.1 - 16.9"); warning or alert rings the tile. */
  chip?: { tone: ChipTone; text: string }
  href?: string
  /** Client parents only: the tile or row becomes a button (opens a sheet). */
  onSelect?: () => void
  className?: string
}

const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase"
const CAPTION = "text-xs leading-4 font-medium text-muted-foreground"
const STATUS_ACTIVE: Record<SleepStatus, string> = {
  poor: "bg-warning",
  sufficient: "bg-foreground-secondary",
  optimal: "bg-optimal",
}

type Computed = { valueText: string; avgText?: string; dir?: DeltaDir; tone?: Tone; reason?: string; meta?: MetricMeta; loading?: boolean }
const LOADING: Computed = { valueText: "", loading: true }

function compute(p: KeyStatRowProps, value: number | null, meta?: MetricMeta, reason?: ReasonCode): Computed {
  if (value === null) return { valueText: MISSING, reason: reasonCopy(reason, meta?.nightsLeft).short }
  const avg = p.average ?? null
  const t = avg !== null && p.direction !== "none" ? deltaTone(p.direction, value, avg, p.sd) : undefined
  return { valueText: formatValue(p.format, value), avgText: avg !== null ? formatValue(p.format, avg) : undefined, dir: t?.dir, tone: t?.tone, meta }
}

/** Interactive wrapper: a link, a button, or a plain element. */
function Frame({ p, className, children, sentence }: { p: KeyStatRowProps; className: string; children: React.ReactNode; sentence: string }) {
  const body = (
    <>
      <span className="sr-only">{sentence}</span>
      {children}
    </>
  )
  const interactive =
    "outline-none focus-visible:ring-3 focus-visible:ring-ring/50 transition-[background-color,scale,--tw-gradient-from] duration-150 ease-standard"
  if (p.href)
    return (
      <Link href={p.href} className={cn(className, interactive)}>
        {body}
      </Link>
    )
  if (p.onSelect)
    return (
      <button type="button" onClick={p.onSelect} className={cn(className, interactive, "w-full text-left")}>
        {body}
      </button>
    )
  return <div className={className}>{body}</div>
}

function rowClass(p: KeyStatRowProps) {
  const tappable = !!(p.href || p.onSelect)
  if (p.variant === "card")
    // 56 px, one card per metric [latest-home-dashboard-1]; presses in like every card link.
    return cn(CARD_MATERIAL, "flex min-h-14 items-center gap-3 px-4 py-2", tappable && "hover:from-card-hover active:scale-[0.96]", p.className)
  return cn("flex min-h-14 items-center gap-3 py-2", tappable && "-mx-2 rounded-lg px-2 hover:bg-accent active:bg-accent", p.className)
}

function Row({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const sentence = c.loading
    ? ""
    : c.reason
      ? `${p.label}: ${c.reason}`
      : statSentence({ label: p.label, valueText: c.valueText, unit: p.unit, averageText: c.avgText, averageLabel: p.averageLabel, dir: c.dir, tone: c.tone })
  return (
    <Frame p={c.loading ? { ...p, href: undefined, onSelect: undefined } : p} sentence={sentence} className={rowClass(p)}>
      <span aria-hidden className="contents">
        {p.icon && <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]">{p.icon}</span>}
        <span className="min-w-0 flex-1">
          {p.label ? <span className={cn(LABEL, "block truncate")}>{p.label}</span> : <SkeletonText className={cn(LABEL, "w-32")} />}
          {(c.reason || p.caption) && <span className={cn(CAPTION, "mt-0.5 block truncate")}>{c.reason ?? p.caption}</span>}
          {/* Tags sit under the label, not after the unit, so a phone never truncates the label (spec §11 note). */}
          {c.meta && <MetricTags provisional={c.meta.provisional} tags={c.meta.tags} className="mt-1 justify-start" />}
        </span>
        {p.status && (
          <span className="flex shrink-0 gap-1">
            {(["poor", "sufficient", "optimal"] as const).map((k) => (
              <span key={k} className={cn("h-1 w-4 rounded-sm", !c.reason && p.status === k ? STATUS_ACTIVE[k] : "bg-dial-track")} />
            ))}
          </span>
        )}
        <span className={cn("grid shrink-0 items-center gap-x-2 text-right", p.direction !== "none" ? "grid-cols-[auto_8px]" : "grid-cols-1")}>
          {c.loading ? (
            <SkeletonText className="w-[4ch] font-numeric text-xl leading-6 font-bold" />
          ) : (
            <ValueUnit value={c.valueText} unit={p.unit} className={cn("font-numeric text-xl leading-6 font-bold", c.reason && "text-muted-foreground")} />
          )}
          {p.direction !== "none" && (c.dir ? <DeltaMark dir={c.dir} tone={c.tone!} /> : <span />)}
          {c.avgText && !c.reason && (
            <span className="font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums">{c.avgText}</span>
          )}
        </span>
        {p.href && <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
      </span>
    </Frame>
  )
}

function Tile({ p, c }: { p: KeyStatRowProps; c: Computed }) {
  const flagged = !c.reason && !c.loading && (p.chip?.tone === "warning" || p.chip?.tone === "alert")
  const sentence = c.loading
    ? ""
    : c.reason
    ? `${p.label}: ${c.reason}`
    : [
        statSentence({ label: p.label, valueText: c.valueText, unit: p.unit, averageText: p.chip ? undefined : c.avgText, averageLabel: p.averageLabel, dir: c.dir, tone: c.tone }),
        p.chip?.text,
      ]
        .filter(Boolean)
        .join(", ")
  return (
    <Frame
      p={c.loading ? { ...p, href: undefined, onSelect: undefined } : p}
      sentence={sentence}
      className={cn(
        CARD_MATERIAL,
        "flex min-h-34 min-w-0 flex-col gap-3 p-4",
        flagged && "ring-1 ring-warning/50",
        (p.href || p.onSelect) && "hover:from-card-hover active:scale-[0.96]",
        p.className
      )}
    >
      <span aria-hidden className="contents">
        <span className="flex items-start gap-2">
          {p.icon && <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]">{p.icon}</span>}
          {p.label ? <span className={cn(LABEL, "line-clamp-3 min-w-0 pt-0.5")}>{p.label}</span> : <SkeletonText className={cn(LABEL, "w-24 pt-0.5")} />}
        </span>
        <span className="mt-auto flex flex-col items-start gap-2">
          {c.loading ? (
            <>
              <SkeletonText className="w-[3ch] font-numeric text-4xl leading-10 font-bold" />
              <SkeletonText className="w-28 text-xs leading-6" />
            </>
          ) : (
          <ValueUnit
            value={c.valueText}
            unit={p.unit}
            className={cn("font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]", c.reason && "text-muted-foreground")}
          />
          )}
          {c.loading ? null : c.reason ? (
            <span className={CAPTION}>{c.reason}</span>
          ) : (
            <>
              {c.meta && <MetricTags provisional={c.meta.provisional} tags={c.meta.tags} className="justify-start" />}
              {p.chip ? (
                <StatusChip tone={p.chip.tone}>{p.chip.text}</StatusChip>
              ) : (
                c.avgText && (
                  <StatusChip tone="neutral" delta={c.dir}>
                    {c.avgText}
                    {p.unit && <span className="font-semibold">{p.unit === "%" ? "%" : ` ${p.unit}`}</span>}
                  </StatusChip>
                )
              )}
            </>
          )}
        </span>
      </span>
    </Frame>
  )
}

/** One metric with label, value, unit, average and a direction-aware arrow (spec §5.2). */
export function KeyStatRow(p: KeyStatRowProps) {
  const View = p.variant === "tile" ? Tile : Row
  return (
    <MetricState
      metric={p.metric}
      skeleton={<View p={p} c={LOADING} />}
      empty={<View p={p} c={compute(p, null, undefined, "no_data")} />}
      renderReason={(reason, meta) => <View p={p} c={compute(p, null, meta, reason)} />}
    >
      {(value, meta) => <View p={p} c={compute(p, value, meta)} />}
    </MetricState>
  )
}

/**
 * Loading shape (spec §5.19): the row or tile's own box, with its real icon and label when known
 * (they are static) and a bar for the value.
 */
export function KeyStatRowSkeleton({ variant, label = "", icon }: { variant: KeyStatRowProps["variant"]; label?: string; icon?: React.ReactNode }) {
  const p: KeyStatRowProps = { variant, label, icon, metric: undefined, format: "int", direction: "none" }
  return (
    <div aria-hidden className="contents">
      {variant === "tile" ? <Tile p={p} c={LOADING} /> : <Row p={p} c={LOADING} />}
    </div>
  )
}
KeyStatRow.Skeleton = KeyStatRowSkeleton
