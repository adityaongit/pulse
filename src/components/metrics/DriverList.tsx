import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatValue } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { SkeletonText } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { MetricTags } from "./primitives"

export type DriverItem = {
  key: string
  label: string
  /** Signed effect, in `unit`. U10 sorts by |delta| descending. */
  delta: number
  /** "none": no clear effect (CI crosses zero). Defaults to the sign of `delta`. */
  effect?: "positive" | "negative" | "none"
  /** Impact variant: days with and without the behaviour, and the 90% CI. */
  yes?: number
  no?: number
  ci?: [number, number]
}

export type DriverListProps = {
  variant: "recovery" | "impact"
  unit: "pts" | "%" | "SD"
  data: Metric<DriverItem[]> | null | undefined
  selectedKey?: string
  /** Client parents only: impact rows open their detail. */
  onSelect?: (key: string) => void
  /** Impact variant: the next-day outcome in the spoken sentence ("Recovery", "HRV", "sleep performance"). */
  outcome?: string
}

const fmt = (v: number, unit: DriverListProps["unit"]) =>
  unit === "SD" ? `${formatValue("signed1", v)} SD` : `${formatValue("signedInt", v)}${unit === "%" ? "%" : ""}`
const effectOf = (i: DriverItem) => i.effect ?? (i.delta > 0 ? "positive" : i.delta < 0 ? "negative" : "none")
const unitWord = { pts: "points", "%": "percent", SD: "standard deviations" }

function sentence(i: DriverItem, variant: DriverListProps["variant"], unit: DriverListProps["unit"], outcome = "Recovery") {
  const e = effectOf(i)
  const size = `${formatValue(unit === "SD" ? "decimal1" : "int", Math.abs(i.delta))}\u00a0${unitWord[unit]}`
  if (variant === "recovery")
    return e === "none" ? `${i.label}: no clear effect` : `${i.label} ${e === "positive" ? "raised" : "lowered"} Recovery by ${size}`
  const k = unit === "SD" ? "decimal1" : "int"
  const ci = i.ci ? `, 90 percent confidence ${formatValue(k, Math.min(Math.abs(i.ci[0]), Math.abs(i.ci[1])))} to ${formatValue(k, Math.max(Math.abs(i.ci[0]), Math.abs(i.ci[1])))}` : ""
  const n = i.yes !== undefined && i.no !== undefined ? `, from ${i.yes} days with and ${i.no} without` : ""
  const verb = e === "none" ? `had no clear effect on next-day ${outcome}` : `${e === "positive" ? "raised" : "lowered"} next-day ${outcome} by ${size}`
  return `${i.label} ${verb}${ci}${n}`
}

function Header({ variant, unit, provisional }: { variant: DriverListProps["variant"]; unit: DriverListProps["unit"]; provisional: boolean }) {
  const [left, mid, right] = variant === "recovery" ? ["Lowered", "Points", "Raised"] : ["Hurts", unit === "SD" ? "Impact (SD)" : "% Impact", "Helps"]
  return (
    <div aria-hidden className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs leading-4 font-bold tracking-[0.1em] uppercase">
      <span className="flex items-center gap-2 text-warning-text">
        <span className="grid size-4 place-items-center rounded-sm bg-warning/20">
          <ChevronDown className="size-3" strokeWidth={2.5} />
        </span>
        {left}
      </span>
      <span className="flex items-center gap-2 text-muted-foreground">
        {mid}
        {provisional && <MetricTags provisional />}
      </span>
      <span className="flex items-center justify-end gap-2 text-optimal-text">
        {right}
        <span className="grid size-4 place-items-center rounded-sm bg-optimal/20">
          <ChevronUp className="size-3" strokeWidth={2.5} />
        </span>
      </span>
    </div>
  )
}

const ROW =
  "block w-full rounded-2xl bg-card bg-linear-to-b from-card-top to-card px-4 py-3 text-left shadow-card transition-[scale,--tw-gradient-from,background-color] duration-150 ease-standard in-data-[slot=card]:rounded-lg in-data-[slot=card]:bg-secondary in-data-[slot=card]:bg-none in-data-[slot=card]:shadow-none"

function Item({ i, max, p }: { i: DriverItem; max: number; p: DriverListProps }) {
  const e = effectOf(i)
  const width = `${(Math.abs(i.delta) / (max || 1)) * 50}%`
  const impact = p.variant === "impact"
  const value = (
    <span className={cn("shrink-0 font-numeric text-base font-bold tabular-nums", e === "positive" ? "text-optimal-text" : e === "negative" ? "text-warning-text" : "text-foreground-secondary")}>
      {fmt(i.delta, p.unit)}
    </span>
  )
  const content = (
    <>
      <span className="sr-only">{sentence(i, p.variant, p.unit, p.outcome)}</span>
      <span aria-hidden className="block space-y-2">
        {impact ? (
          // the reference app's behaviour rows: the name in sentence case with a chevron, the % at the track's end
          // [latest-journal-insights-1] (spec §11 F17).
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-[15px] leading-5 font-medium text-pretty">{i.label}</span>
            {p.onSelect && <ChevronRight className="-mr-1 size-5 shrink-0 text-foreground-secondary" strokeWidth={1.75} />}
          </span>
        ) : (
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-xs leading-4 font-bold tracking-[0.1em] text-pretty uppercase">{i.label}</span>
            {value}
          </span>
        )}
        <span className={cn(impact && "flex items-center gap-3")}>
        <span className={cn("relative block h-2 rounded-sm bg-(image:--pattern-hatch)", impact && "flex-1")}>
          {i.delta !== 0 && (
            <span
              className={cn(
                "absolute inset-y-0 rounded-sm",
                i.delta > 0 ? "left-1/2" : "right-1/2",
                e === "positive" ? "bg-optimal" : e === "negative" ? "bg-warning" : "bg-muted-foreground"
              )}
              style={{ width }}
            />
          )}
          <span className="absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full bg-foreground ring-2 ring-card in-data-[slot=card]:ring-secondary" />
        </span>
        {impact && value}
        </span>
        {p.variant === "impact" && i.yes !== undefined && i.no !== undefined && (
          <span className="block text-xs leading-4 font-medium text-muted-foreground tabular-nums">
            {i.yes} days with, {i.no} without.
            {i.ci && ` 90% CI ${fmt(i.ci[0], p.unit).replace(/^\+/, "")} to ${fmt(i.ci[1], p.unit).replace(/^\+/, "")}`}
          </span>
        )}
      </span>
    </>
  )
  // Each row is its own card ([latest-journal-insights-1]); inside a card it steps down to a 10 px
  // bg-secondary row (no card in a card). Rows that open a sheet press in.
  const cls = cn(
    ROW,
    p.onSelect && "outline-none hover:from-card-hover focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] in-data-[slot=card]:hover:bg-accent",
    p.selectedKey === i.key && "ring-1 ring-foreground/60"
  )
  return (
    <li>
      {p.onSelect ? (
        <button
          type="button"
          onClick={() => p.onSelect?.(i.key)}
          aria-pressed={p.selectedKey === i.key}
          className={cls}
        >
          {content}
        </button>
      ) : (
        <div className={cls}>{content}</div>
      )}
    </li>
  )
}

/** Ranked effects as diverging bars on the reference app's hatched track (spec §5.4). */
export function DriverList(p: DriverListProps) {
  const empty =
    p.variant === "recovery" ? (
      <EmptyState body="No drivers yet: Recovery needs 7 nights first." />
    ) : (
      <EmptyState
        body="Not enough check-ins yet. Insights need 5 days with and 5 without a behaviour in the last 90 days."
        action={{ label: "Check in", sheet: "checkin" }}
      />
    )
  return (
    <MetricState metric={p.data} skeleton={<DriverListSkeleton variant={p.variant} unit={p.unit} />} empty={empty} renderReason={() => null}>
      {(items, meta) => {
        const max = Math.max(...items.map((i) => Math.abs(i.delta)))
        return (
          <div>
            <Header variant={p.variant} unit={p.unit} provisional={meta.provisional} />
            <ul role="list" className="space-y-2">
              {items.map((i) => (
                <Item key={i.key} i={i} max={max} p={p} />
              ))}
            </ul>
          </div>
        )
      }}
    </MetricState>
  )
}

/** Loading shape (spec §5.19): the real header and each row's own box, with bars for the label, value and caption. */
export function DriverListSkeleton({ variant = "impact", unit = "%", rows = 3 }: { variant?: DriverListProps["variant"]; unit?: DriverListProps["unit"]; rows?: number }) {
  const impact = variant === "impact"
  const value = <SkeletonText className="w-[4ch] shrink-0 font-numeric text-base font-bold" />
  return (
    <div aria-hidden>
      <Header variant={variant} unit={unit} provisional={false} />
      <ul className="space-y-2">
        {Array.from({ length: rows }, (_, k) => (
          <li key={k} className={cn(ROW, "space-y-2")}>
            <span className="flex items-center justify-between gap-3">
              <SkeletonText className={cn("w-28", impact ? "text-[15px] leading-5" : "text-xs leading-4")} />
              {!impact && value}
            </span>
            <span className={cn("block", impact && "flex items-center gap-3")}>
              <span className={cn("block h-2 rounded-sm bg-(image:--pattern-hatch)", impact && "flex-1")} />
              {impact && value}
            </span>
            {impact && <SkeletonText className="w-56 text-xs leading-4" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
DriverList.Skeleton = DriverListSkeleton
