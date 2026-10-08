import { Check, CircleAlert, Triangle, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CHIP_TONE_CLASS, type ChipTone, type DeltaDir, type Tone } from "@/lib/bands"
import { isSymbolUnit } from "@/lib/format"
import { TAG_COPY, type MetricTag } from "@/lib/reasons"

// Small shared marks used by every kit component (spec §5.0). One look per meaning.

/** Shared type styles: the uppercase small label and the muted caption. */
export const LABEL = "text-xs leading-4 font-bold tracking-[0.1em] uppercase"
export const CAPTION = "text-xs leading-4 font-medium text-muted-foreground"
/** The 48 px secondary button at a card's foot ("+ Add activity", "Behaviour insights", "Edit alarm"). */
export const CARD_BUTTON =
  "flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-[13px] leading-4 font-bold tracking-[0.1em] uppercase transition-[background-color,scale] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"

export type TagKind = keyof typeof TAG_COPY | "so_far" | "partial_week" | "partial_month" | "estimate"
const EXTRA_TAGS: Record<Exclude<TagKind, keyof typeof TAG_COPY>, string> = {
  so_far: "So far",
  partial_week: "Partial week",
  partial_month: "Partial month",
  estimate: "Estimate",
}
export const tagLabel = (kind: TagKind) =>
  kind in TAG_COPY ? TAG_COPY[kind as keyof typeof TAG_COPY].label : EXTRA_TAGS[kind as keyof typeof EXTRA_TAGS]

/** Status tag ("Provisional", "So far"…). Never coloured: colour is for data. */
export function Tag({ kind, className }: { kind: TagKind; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 rounded-full border-border px-2 text-[11px] font-bold tracking-[0.1em] text-foreground-secondary uppercase",
        className
      )}
    >
      {tagLabel(kind)}
    </Badge>
  )
}

/** The tags a metric carries: "Provisional" first, then "Baseline stale" / "Updated". */
export function MetricTags({
  provisional,
  tags,
  extra,
  className,
}: {
  provisional?: boolean
  tags?: MetricTag[]
  extra?: TagKind[]
  className?: string
}) {
  const all: TagKind[] = [...(provisional ? ["provisional" as const] : []), ...(tags ?? []), ...(extra ?? [])]
  if (!all.length) return null
  return (
    <span className={cn("inline-flex flex-wrap items-center justify-center gap-1", className)}>
      {all.map((k) => (
        <Tag key={k} kind={k} />
      ))}
    </span>
  )
}

const CHIP_ICON = { optimal: Check, warning: TriangleAlert, alert: CircleAlert, neutral: null } as const

/** Value plus tone, e.g. "✓ within 16.1 - 16.9". Icon follows the tone unless `delta` is given. */
export function StatusChip({
  tone,
  children,
  delta,
  className,
}: {
  tone: ChipTone
  children: React.ReactNode
  delta?: DeltaDir
  className?: string
}) {
  const Icon = CHIP_ICON[tone]
  return (
    <span
      className={cn(
        "inline-flex min-h-6 w-fit items-center gap-1 rounded-md px-2 py-1 text-xs leading-4 font-bold tabular-nums",
        CHIP_TONE_CLASS[tone],
        className
      )}
    >
      {delta ? (
        <DeltaMark dir={delta} tone="neutral" className="text-current" />
      ) : (
        Icon && <Icon aria-hidden className="size-3" strokeWidth={2.5} />
      )}
      {children}
    </span>
  )
}

const DELTA_TONE: Record<Tone, string> = {
  good: "text-optimal",
  bad: "text-warning",
  neutral: "text-foreground-secondary",
}

/** Filled 8 px triangle (up/down), or a 6 px dot when flat. */
export function DeltaMark({ dir, tone, className }: { dir: DeltaDir; tone: Tone; className?: string }) {
  if (dir === "flat")
    return <span aria-hidden data-dir="flat" data-tone={tone} className={cn("inline-block size-1.5 shrink-0 rounded-full bg-muted-foreground", className)} />
  return (
    <Triangle
      aria-hidden
      data-dir={dir}
      data-tone={tone}
      strokeWidth={0}
      className={cn("size-2 shrink-0 fill-current", dir === "down" && "rotate-180", DELTA_TONE[tone], className)}
    />
  )
}

/** A formatted value with its unit in the unit role ("124 ms", "72%"). */
export function ValueUnit({
  value,
  unit,
  className,
  unitClassName,
}: {
  value: string
  unit?: string
  className?: string
  unitClassName?: string
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {value}
      {unit && value !== "--" && (
        <span
          className={cn(
            "text-[13px] leading-4 font-semibold text-foreground-secondary",
            isSymbolUnit(unit) ? "ml-0.5" : "ml-1",
            unitClassName
          )}
        >
          {unit}
        </span>
      )}
    </span>
  )
}
