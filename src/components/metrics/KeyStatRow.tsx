import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { deltaTone, type ChipTone, type DeltaDir, type GoodDirection, type Tone } from "@/lib/bands"
import { formatValue, MISSING, statSentence, type FormatKey } from "@/lib/format"
import { reasonCopy, type Metric, type ReasonCode } from "@/lib/reasons"
import { CARD_MATERIAL } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"
import { MetricState, type MetricMeta } from "@/components/shells/MetricState"
import { CAPTION, DeltaMark, LABEL, MetricTags, StatusChip, ValueUnit } from "./primitives"
import { Sparkline } from "./Sparkline"

export type SleepStatus = "poor" | "sufficient" | "optimal"

export type KeyStatRowProps = {
  variant: "row" | "card" | "tile"
  icon?: React.ReactNode
  label: string
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
  status?: SleepStatus
  chip?: { tone: ChipTone; text: string }
  href?: string
  /** Client parents only: the tile or row becomes a button (opens a sheet). */
  onSelect?: () => void
  /** Restricts a full-width tile to the named breakpoint, where an odd item would leave a gap. */
  wide?: boolean | "md" | "xl"
  /** A wide tile's recent values (oldest first) drawn on its right as a sparkline, with `band` shaded as the normal range. */
  spark?: { values: (number | null)[]; band?: { low: number; high: number } | null; caption?: string }
  className?: string
}

const TILE_LABEL = "text-[10px] leading-3 font-bold tracking-[0.1em] uppercase"
const TILE_CHIP = "min-h-5 px-1.5 py-0.5 text-[11px] leading-4"
const STATUS_ACTIVE: Record<SleepStatus, string> = {
  poor: "bg-warning",
  sufficient: "bg-foreground-secondary",
  optimal: "bg-optimal",
}

type Computed = { valueText: string; avgText?: string; diffText?: string; dir?: DeltaDir; tone?: Tone; reason?: string; meta?: MetricMeta; loading?: boolean }
const LOADING: Computed = { valueText: "", loading: true }

function compute(p: KeyStatRowProps, value: number | null, meta?: MetricMeta, reason?: ReasonCode): Computed {
  if (value === null) return { valueText: MISSING, reason: reasonCopy(reason, meta?.nightsLeft).short }
  const avg = p.average ?? null
  const t = avg !== null && p.direction !== "none" ? deltaTone(p.direction, value, avg, p.sd) : undefined
  const diff = avg !== null ? value - avg : null
  const diffText = diff === null || formatValue(p.format, Math.abs(diff)) === formatValue(p.format, 0) ? undefined : `${diff > 0 ? "+" : "\u2212"}${formatValue(p.format, Math.abs(diff))}`
  return { valueText: formatValue(p.format, value), avgText: avg !== null ? formatValue(p.format, avg) : undefined, diffText, dir: t?.dir, tone: t?.tone, meta }
}

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
    return cn(CARD_MATERIAL, "flex min-h-14 items-center gap-3 px-4 py-2", tappable && "hover:from-card-hover active:scale-[0.96]", p.className)
  // The hover fill sits on a pseudo-element just past the row's edges, so the row itself (and the divider drawn on it)
  // stays square and full width.
  return cn(
    "flex min-h-14 items-center gap-3 py-2",
    tappable && "relative isolate before:absolute before:-inset-x-2 before:inset-y-0.5 before:-z-1 before:rounded-lg before:transition-[background-color] before:duration-150 hover:before:bg-accent active:before:bg-accent",
    p.className
  )
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
          {/* Long metric labels must wrap to fit narrow phone widths. */}
          {p.label ? <span className={cn(LABEL, "block text-balance")}>{p.label}</span> : <SkeletonText className={cn(LABEL, "w-32")} />}
          {(c.reason || p.caption) && <span className={cn(CAPTION, "mt-0.5 block truncate")}>{c.reason ?? p.caption}</span>}
          {/* Tags sit under the label so a phone never truncates it. */}
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
            <span className="font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums">
              {c.avgText}
              {p.unit === "%" && "%"}
            </span>
          )}
        </span>
        {p.href && p.variant !== "card" && <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />}
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
        "flex min-h-31 min-w-0 flex-col gap-3 p-3",
        p.wide === true && "min-h-0 flex-row items-center",
        p.wide === "md" && "max-md:min-h-0 max-md:flex-row max-md:items-center",
        p.wide === "xl" && "max-xl:min-h-0 max-xl:flex-row max-xl:items-center",
        flagged && "ring-1 ring-warning/50",
        (p.href || p.onSelect) && "hover:from-card-hover active:scale-[0.96]",
        p.className
      )}
    >
      <span aria-hidden className="contents">
        <span
          className={cn(
            "contents",
            p.wide === true && "flex min-w-0 flex-1 flex-col gap-2",
            p.wide === "md" && "max-md:flex max-md:min-w-0 max-md:flex-1 max-md:flex-col max-md:gap-2",
            p.wide === "xl" && "max-xl:flex max-xl:min-w-0 max-xl:flex-1 max-xl:flex-col max-xl:gap-2",
            p.spark && "flex-none! basis-auto"
          )}
        >
          <span className="flex items-center gap-2.5">
            {p.icon && <span className="grid size-5 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.5]">{p.icon}</span>}
            {p.label ? <span className={cn(TILE_LABEL, "line-clamp-3 min-w-0 text-foreground-secondary")}>{p.label}</span> : <SkeletonText className={cn(TILE_LABEL, "w-24")} />}
          </span>
          <span className="mt-auto flex flex-col items-start gap-2">
            {c.loading ? (
              <>
                <SkeletonText className="w-[3ch] font-numeric text-[30px] leading-9 font-bold" />
                <SkeletonText className="w-28 text-[11px] leading-5" />
              </>
            ) : (
            <ValueUnit
              value={c.valueText}
              unit={p.unit}
              className={cn("font-numeric text-[30px] leading-9 font-bold tracking-[-0.01em]", c.reason && "text-muted-foreground")}
              unitClassName="text-sm leading-5 font-medium text-foreground"
            />
            )}
            {c.loading ? null : c.reason ? (
              <span className={CAPTION}>{c.reason}</span>
            ) : (
              <>
                {c.meta && <MetricTags provisional={c.meta.provisional} tags={c.meta.tags} className="justify-start" />}
                <span className={cn("contents", !p.spark && p.wide === true && "hidden", !p.spark && p.wide === "md" && "max-md:hidden", !p.spark && p.wide === "xl" && "max-xl:hidden")}>
                  {p.chip ? (
                    <StatusChip tone={p.chip.tone} className={TILE_CHIP}>
                      {p.chip.text}
                    </StatusChip>
                  ) : (
                    c.avgText && (
                      <StatusChip tone="neutral" delta={c.dir} className={TILE_CHIP}>
                        {c.avgText}
                        {p.unit && <span className="font-semibold">{p.unit === "%" ? "%" : `\u00a0${p.unit}`}</span>}
                      </StatusChip>
                    )
                  )}
                </span>
              </>
            )}
          </span>
        </span>
        {p.wide && p.spark && !c.loading && (
          <Sparkline
            values={p.spark.values}
            band={p.spark.band}
            color={p.chip?.tone === "warning" || p.chip?.tone === "alert" ? "var(--warning)" : "var(--foreground-secondary)"}
            caption={p.spark.caption}
            className={cn("h-16 min-w-0 flex-1 self-center", p.wide === "md" && "md:hidden", p.wide === "xl" && "xl:hidden")}
          />
        )}
        {p.wide && !p.spark && !c.loading && !c.reason && (p.chip || c.avgText) && (
          <span className={cn("flex shrink-0 flex-col items-end gap-1 text-right", p.wide === "md" && "md:hidden", p.wide === "xl" && "xl:hidden")}>
            <span className={CAPTION}>{p.chip ? "Your range" : (p.averageLabel ?? "30-day avg")}</span>
            {p.chip ? (
              <StatusChip tone={p.chip.tone} className={TILE_CHIP}>
                {p.chip.text}
              </StatusChip>
            ) : (
              <>
                <ValueUnit value={c.avgText!} unit={p.unit} className="font-numeric text-lg leading-6 font-bold" unitClassName="text-xs leading-4 font-medium text-muted-foreground" />
                {c.diffText && (
                  <span className={cn("font-numeric text-xs leading-4 font-bold tabular-nums", c.tone === "good" ? "text-optimal" : c.tone === "bad" ? "text-warning" : "text-foreground-secondary")}>
                    {c.diffText}
                    {p.unit && (p.unit === "%" ? "%" : `\u00a0${p.unit}`)} vs avg
                  </span>
                )}
              </>
            )}
          </span>
        )}
      </span>
    </Frame>
  )
}

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

export function KeyStatRowSkeleton({ variant, label = "", icon }: { variant: KeyStatRowProps["variant"]; label?: string; icon?: React.ReactNode }) {
  const p: KeyStatRowProps = { variant, label, icon, metric: undefined, format: "int", direction: "none" }
  return (
    <div aria-hidden className="contents">
      {variant === "tile" ? <Tile p={p} c={LOADING} /> : <Row p={p} c={LOADING} />}
    </div>
  )
}
KeyStatRow.Skeleton = KeyStatRowSkeleton
