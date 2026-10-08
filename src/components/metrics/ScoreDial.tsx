"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Pie, PieChart, PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"
import { cn } from "@/lib/utils"
import { BAND_WORD, DATA_COLORS, dialColor, recoveryBand, STRESS_COLOR, STRESS_WORD, stressLevel, type DataColor } from "@/lib/bands"
import { markerSlices, ringRadii, targetSlices } from "@/lib/charts"
import { dialAriaLabel, formatValue, type FormatKey } from "@/lib/format"
import { reasonCopy, type MetricTag, type ReasonCode } from "@/lib/reasons"
import { useReducedMotion } from "@/hooks/use-reduced-motion"
import { ChartContainer } from "@/components/ui/chart"
import { SkeletonText } from "@/components/ui/skeleton"
import { Wordmark } from "@/components/brand/Wordmark"
import { MetricTags, type TagKind, CAP_TRIM } from "./primitives"

export type DialSize = "sm" | "md" | "lg"
export type DialVariant = "recovery" | "strain" | "sleep" | "stat" | "gauge"

export type ScoreDialProps = {
  variant: DialVariant
  size: DialSize
  /** null with a `reason` renders the reason state. */
  value: number | null
  reason?: ReasonCode | null
  nightsLeft?: number
  provisional?: boolean
  tags?: MetricTag[]
  /** Extra tags such as "so_far" (today's strain) or "estimate" (forecast). */
  extraTags?: TagKind[]
  /** Strain Target range on the 0-21 track. */
  target?: readonly [number, number] | null
  /** Overrides the default label ("Recovery", "Strain"…). Required for `stat`. */
  label?: string
  /** `stat` only: colour token, domain max, value format and unit. */
  color?: DataColor
  max?: number
  format?: FormatKey
  unit?: string
  /** `gauge`: "Last updated 15:05" or "Day average". */
  caption?: string
  /** `sleep lg`: the reference app's three-segment status bar under the label, the matching segment lit [latest-sleep-1]. */
  status?: "poor" | "sufficient" | "optimal"
  /** Home: the dial and label become one link. */
  href?: string
  /** Loading (spec §5.19): the real track and label, bars where the numbers go. */
  loading?: boolean
  /**
   * The sticky header's form (docs/design/sticky.md B2): a 64 px ring with the value inside, no label or
   * tags, `aria-hidden` and `inert` (the full dial stays in the page). `size` is ignored.
   */
  compact?: boolean
}

// Centre type is sized in cqi of the ring's hole (the square inside the stroke, `ringRadii().hole`), so every
// size and the 768 px step keep the same proportions and clearance (spec §11 F23). 1cqi = 1% of the inner diameter.
const SIZE = {
  sm: { box: "size-14", d: 56, ring: 5, value: "text-[38cqi]" },
  // Home row: an 88 px ring 6 px thick inside the 92 px box, the reference app's size at 390 [latest-home-top-2], [latest-home-top-3] (spec §11 F2).
  md: { box: "size-23 md:size-30", d: 92, ring: 6, value: "text-[34cqi] tracking-[-0.01em]" },
  // v2 hero ring: a 252 px ring 17 px thick at 390, measured on [latest-recovery-1], [latest-strain-1] (spec §11 F11).
  lg: { box: "size-64 md:size-70", d: 256, ring: 17, value: "text-[31cqi] tracking-[-0.01em]" },
} as const
const COMPACT = { box: "size-16", d: 64, ring: 5, value: "text-[40cqi]" } as const
// Each text box is trimmed to cap height and baseline, so the cqi gaps between rows are the visible gaps.
const TRIM = CAP_TRIM

const DIAL_LABEL = "text-xs leading-4 font-bold tracking-[0.1em] uppercase"
const STATUS_LIT = { poor: "bg-warning", sufficient: "bg-foreground-secondary", optimal: "bg-optimal" } as const
const TRACK = "var(--dial-track)"
// Every current ring opens with a 4° gap each side of 12 o'clock ([latest-recovery-1], [latest-home-top-1]).
const ARC = { startAngle: 86, endAngle: -266 } as const
const CHART_RESET = "absolute inset-0 aspect-auto size-full [&_.recharts-radial-bar-background-sector]:fill-dial-track"

type Resolved = { label: string; max: number; color: string; text: string; unit?: string; word?: { text: string; className: string } }

function resolve(p: ScoreDialProps): Resolved {
  const lg = p.size === "lg"
  switch (p.variant) {
    case "recovery": {
      const band = p.value === null ? null : recoveryBand(p.value)
      const c = p.value === null ? DATA_COLORS.muted : DATA_COLORS[dialColor("recovery", p.value)]
      return {
        label: p.label ?? "Recovery",
        max: 100,
        color: c.css,
        unit: "%",
        text: formatValue("int", p.value),
        // The ring carries the colour; the word stays secondary so it reads as a label (spec §5.1 v2).
        word: band ? { text: BAND_WORD[band], className: lg ? "text-foreground-secondary" : c.text } : undefined,
      }
    }
    case "strain":
      return { label: p.label ?? "Strain", max: 21, color: DATA_COLORS[dialColor("strain", p.value ?? 0)].css, text: formatValue("decimal1", p.value) }
    case "sleep":
      return { label: p.label ?? (lg ? "Sleep performance" : "Sleep"), max: 100, color: DATA_COLORS[dialColor("sleep", p.value ?? 0)].css, unit: "%", text: formatValue("int", p.value) }
    case "gauge": {
      const level = p.value === null ? null : stressLevel(p.value)
      return {
        label: p.label ?? "Stress",
        max: 3,
        color: "transparent",
        text: formatValue("decimal1", p.value),
        word: level ? { text: STRESS_WORD[level], className: DATA_COLORS[STRESS_COLOR[level]].text } : undefined,
      }
    }
    default:
      return {
        label: p.label ?? "",
        max: p.max ?? 100,
        color: DATA_COLORS[p.color ?? "chart-5"].css,
        unit: p.unit,
        text: formatValue(p.format ?? "int", p.value),
      }
  }
}

/** The the reference app ring (spec §5.1): Recharts radial bar over a pie track, centre text in HTML. */
export function ScoreDial(props: ScoreDialProps) {
  const { variant, size, value, href, loading, compact } = props
  const reduced = useReducedMotion()
  const r = resolve(props)
  const s = compact ? COMPACT : SIZE[size]
  const lg = !compact && size === "lg"
  const radii = ringRadii(s.d, s.ring)
  // The track sits 0.25 px inside each edge of the arc, so no dark fringe shows along the fill.
  const track = ringRadii(s.d, s.ring - 0.5, 2.25)
  const empty = value === null
  const reason = empty ? reasonCopy(props.reason, props.nightsLeft) : null
  const gauge = variant === "gauge"
  const gid = React.useId().replace(/:/g, "")
  // Gauge geometry as fractions of the radius, so the 768 px size step needs no JS: a thin arc inset 4 px
  // (room for the needle's overhang) and a needle reaching 22 px inside it, fading out toward the centre.
  const gauge_ = (() => {
    const r = s.d / 2
    const ring = compact ? 4 : lg ? 7 : 4
    const pct = (px: number) => `${Math.round((px / r) * 1000) / 10}%`
    const inner = r - 4 - ring
    // Where the arc's ends (215° and −35°, on the stroke's centre line) fall across the dial, for the 0.0 and 3.0 labels.
    const end = 50 * (1 - Math.cos((35 * Math.PI) / 180) * ((inner + ring / 2) / r))
    return { ring, outer: pct(r - 4), inner: pct(inner), needleInner: pct(inner - 22), tailStart: (inner - 22) / r, headStart: (inner - 2) / r, end }
  })()
  const target = variant === "strain" ? props.target : null
  const tagNode = (
    <MetricTags provisional={!empty && props.provisional} tags={empty ? undefined : props.tags} extra={props.extraTags} />
  )

  const aria = dialAriaLabel({
    variant,
    label: r.label,
    value,
    valueText: r.text,
    unit: r.unit,
    provisional: props.provisional,
    reasonText: reason?.long,
    bandWord: r.word?.text ?? (props.status && value !== null ? props.status[0].toUpperCase() + props.status.slice(1) : undefined),
    target,
    soFar: props.extraTags?.includes("so_far"),
  })

  const anim = { isAnimationActive: !reduced, animationDuration: 700, animationEasing: "ease-out" as const }
  // Decorative layers: the ring's role="img" (or the link around it) carries the label. Recharts' keyboard layer and
  // the Pie's own tab stop would add three invisible stops per dial (U18 K-01).
  const pieBase = { dataKey: "v", stroke: "none", isAnimationActive: false, cx: "50%", cy: "50%", rootTabIndex: -1 } as const

  const ring = (
    <div data-dial-part="ring" className={cn("relative shrink-0", s.box)} role="img" aria-label={aria} aria-hidden={href ? true : undefined}>
      {/* Track layer: plain track, Strain Target band and tick, or the stress gauge arc. */}
      <ChartContainer config={{}} className={CHART_RESET} initialDimension={{ width: s.d, height: s.d }}>
        <PieChart accessibilityLayer={false} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {gauge ? (
            <>
              {/* One continuous arc, blue → teal → green → yellow → orange, thin with round ends, and a white
                  needle that fades in from the centre [latest-stress-monitor-1] (spec §5.1 v2, C14). */}
              <defs>
                <linearGradient id={`${gid}-arc`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="var(--stress-low)" />
                  <stop offset="0.5" stopColor="var(--stress-medium)" />
                  <stop offset="0.78" stopColor="var(--recovery-yellow)" />
                  <stop offset="1" stopColor="var(--stress-high)" />
                </linearGradient>
                <radialGradient id={`${gid}-needle`} gradientUnits="userSpaceOnUse" cx="50%" cy="50%" r="50%">
                  <stop offset={gauge_.tailStart} stopColor="var(--foreground)" stopOpacity={0} />
                  <stop offset={gauge_.headStart} stopColor="var(--foreground)" stopOpacity={1} />
                  <stop offset="1" stopColor="var(--foreground)" stopOpacity={1} />
                </radialGradient>
              </defs>
              <Pie
                {...pieBase}
                data={[{ v: 1, fill: empty ? TRACK : `url(#${gid}-arc)` }]}
                startAngle={215}
                endAngle={-35}
                cornerRadius={gauge_.ring / 2}
                innerRadius={gauge_.inner}
                outerRadius={gauge_.outer}
              />
              {!empty && (
                <Pie
                  {...pieBase}
                  data={markerSlices(value, 3, 0.04).map((v, i) => ({ v, fill: i === 1 ? `url(#${gid}-needle)` : "transparent" }))}
                  startAngle={215}
                  endAngle={-35}
                  cornerRadius={1.5}
                  innerRadius={gauge_.needleInner}
                  outerRadius="100%"
                />
              )}
            </>
          ) : (
            <>
              <Pie
                {...pieBase}
                data={(target ? targetSlices(target[0], target[1]) : [1]).map((v, i) => ({ v, fill: i === 1 ? "var(--dial-target)" : TRACK }))}
                {...ARC}
                innerRadius={track.inner}
                outerRadius={track.outer}
              />
            </>
          )}
        </PieChart>
      </ChartContainer>

      {/* Fill layer: draws above the target band, so the band is covered once strain passes it. */}
      {!gauge && !loading && (
        <ChartContainer config={{}} className={CHART_RESET} initialDimension={{ width: s.d, height: s.d }}>
          <RadialBarChart
            accessibilityLayer={false}
            data={[{ value: empty ? 0 : Math.min(value, r.max) }]}
            {...ARC}
            innerRadius={radii.inner}
            outerRadius={radii.outer}
            // Recharts' default 10% category gap insets the arc ~1.3 px from each ring edge, which left a dark track fringe.
            barCategoryGap={0}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <PolarAngleAxis type="number" domain={[0, r.max]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" fill={r.color} cornerRadius={0} background={false} {...anim} />
          </RadialBarChart>
        </ChartContainer>
      )}

      {/* Strain Target tick: one white tick across the ring, above the fill (the reference app, [latest-strain-1]). */}
      {target && (
        <ChartContainer config={{}} className={CHART_RESET} initialDimension={{ width: s.d, height: s.d }}>
          <PieChart accessibilityLayer={false} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              {...pieBase}
              data={markerSlices((target[0] + target[1]) / 2, 21, 0.2).map((v, i) => ({ v, fill: i === 1 ? "var(--foreground)" : "transparent" }))}
              {...ARC}
              innerRadius={radii.inner}
              outerRadius={radii.outer}
            />
          </PieChart>
        </ChartContainer>
      )}

      {/* The hole: the square inside the stroke. One centred column whose type and gaps scale with the inner
          diameter, so wordmark, value, label and tags keep the same clearance from the ring at every size (spec §11 F23).
          Gaps follow the reference app's dials (recovery-01, sleep-01): about 8.5% of the ring's width over the value
          and 8% under it, 10 and 9 cqi of the hole. */}
      <div className="absolute @container grid place-content-center justify-items-center text-center" style={{ inset: radii.hole }}>
        {lg && (!empty || loading) && !gauge && (
          // The wordmark over the value, as the reference app's ring carries its own (spec §11 F11; brand.md: never "PULSE" in a font).
          // Never under the brand minimum (h 15 px); `block` drops the inline line box that pushed it into the stroke.
          <Wordmark className="mb-[10cqi] block h-[max(15px,6.8cqi)] text-foreground-secondary" />
        )}
        {loading ? (
          size !== "sm" && <SkeletonText className={cn("font-numeric font-bold", TRIM, s.value, lg ? "w-[2.4ch]" : "w-[2.2ch]")} />
        ) : lg && empty && reason?.code !== "no_data" ? (
          <ReasonCentre icon={reason!.icon} text={reason!.short} />
        ) : (
          <span
            data-dial-part="value"
            className={cn(
              "font-numeric font-bold tabular-nums",
              TRIM,
              s.value,
              empty && "text-muted-foreground",
              compact && gauge && r.word?.className,
            )}
          >
            {r.text}
            {r.unit && !empty && <span className="text-[0.55em]">{r.unit}</span>}
          </span>
        )}
        {gauge && !compact && r.word && <span className={cn(DIAL_LABEL, TRIM, "mt-[8cqi]", r.word.className)}>{r.word.text}</span>}
        {gauge && !compact && props.caption && <span className={cn("mt-[5cqi] text-xs font-medium text-foreground-secondary", TRIM)}>{props.caption}</span>}
        {lg && !gauge && (
          <>
            <span className={cn(DIAL_LABEL, TRIM, "mt-[9cqi] max-w-36 text-balance")}>{r.label}</span>
            {/* No band word under the large ring: the colour carries it on screen, as in the reference app, and the
                dial's accessible name still says it (spec §11 R34). */}
            {props.status && !empty && !loading && (
              <span aria-hidden className="mt-[8cqi] flex gap-1">
                {(["poor", "sufficient", "optimal"] as const).map((k) => (
                  <span key={k} className={cn("h-1 w-5 rounded-full", props.status === k ? STATUS_LIT[k] : "bg-dial-track")} />
                ))}
              </span>
            )}
            {!loading && <span className="mt-[6cqi] flex max-w-[70cqi] justify-center empty:hidden">{tagNode}</span>}
          </>
        )}
      </div>
      {gauge && lg && (
        <div aria-hidden className="absolute inset-x-0 top-[79%] font-numeric text-xs font-medium text-muted-foreground tabular-nums">
          {/* Each label centred under its end of the arc. */}
          <span className="absolute -translate-x-1/2" style={{ left: `${gauge_.end}%` }}>
            0.0
          </span>
          <span className="absolute translate-x-1/2" style={{ right: `${gauge_.end}%` }}>
            3.0
          </span>
        </div>
      )}
    </div>
  )

  if (compact)
    return (
      <div aria-hidden inert className="flex">
        {ring}
      </div>
    )

  // data-dial-part marks what Home's header morph moves (HomeHeader): the label row, its text, and the extras that fade.
  const below = !lg && (
    <span data-dial-part="below" className="flex flex-col items-center gap-1.5">
      <span className={cn(size === "sm" ? "text-xs leading-4 font-medium text-foreground-secondary" : DIAL_LABEL, "inline-flex items-center gap-0.5 text-center")}>
        <span data-dial-part="label">{r.label}</span>
        {href && <ChevronRight data-dial-part="extra" aria-hidden className="size-3" strokeWidth={2.5} />}
      </span>
      {!loading && (
        <span data-dial-part="extra" className="empty:hidden">
          {tagNode}
        </span>
      )}
    </span>
  )

  const longReason = lg && empty && !loading && reason && (
    <p className="max-w-[36ch] text-center text-xs leading-4 font-medium text-muted-foreground">{reason.long}</p>
  )

  const content = (
    <>
      {ring}
      {below}
      {longReason}
    </>
  )

  if (href)
    return (
      <Link
        href={href}
        data-dial={variant}
        aria-label={`${aria}. Open ${r.label} details`}
        className="flex min-w-24 flex-col items-center gap-1 rounded-xl p-1 transition-[scale,color] duration-150 ease-standard outline-none hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
      >
        {content}
      </Link>
    )
  // A loading md dial keeps the Home link's 4 px padding, so the swap to the linked dial moves nothing.
  return <div data-dial={variant} className={cn("flex flex-col items-center", lg ? "gap-3" : size === "md" ? "gap-1" : "gap-2", loading && size === "md" && "min-w-24 p-1")}>{content}</div>
}

function ReasonCentre({ icon: Icon, text }: { icon: ReturnType<typeof reasonCopy>["icon"]; text: string }) {
  return (
    <span className="flex flex-col items-center gap-2">
      {Icon && <Icon aria-hidden className="size-6 text-foreground-secondary" strokeWidth={1.75} />}
      <span className="line-clamp-2 max-w-[72cqi] text-base leading-[22px] font-semibold text-balance text-foreground-secondary">{text}</span>
    </span>
  )
}

/**
 * Loading shape (spec §5.19): the dial itself with its real track and label, bars for the numbers,
 * so the swap moves nothing. Server components import the named export: they cannot dot into a client module.
 */
export function ScoreDialSkeleton({ size, variant = "stat", label }: { size: DialSize; variant?: DialVariant; label?: string }) {
  return (
    <div aria-hidden className="contents">
      <ScoreDial variant={variant} size={size} value={null} label={label} loading />
    </div>
  )
}

ScoreDial.Skeleton = ScoreDialSkeleton
