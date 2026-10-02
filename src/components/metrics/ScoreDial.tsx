"use client"

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
import { Skeleton } from "@/components/ui/skeleton"
import { MetricTags, type TagKind } from "./primitives"

export type DialSize = "sm" | "md" | "md-hero" | "lg"
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
  /** Overrides the default label ("Recovery", "Day strain"…). Required for `stat`. */
  label?: string
  /** `stat` only: colour token, domain max, value format and unit. */
  color?: DataColor
  max?: number
  format?: FormatKey
  unit?: string
  /** `gauge`: "Last updated 15:05" or "Day average". */
  caption?: string
  /** Home: the dial and label become one link. */
  href?: string
}

const SIZE = {
  sm: { box: "size-14", d: 56, ring: 5, value: "text-base leading-none" },
  md: { box: "size-24 md:size-30", d: 96, ring: 6, value: "text-[26px] leading-none tracking-[-0.01em] md:text-[30px]" },
  "md-hero": { box: "size-29 md:size-36", d: 116, ring: 7, value: "text-[30px] leading-none tracking-[-0.01em] md:text-[36px]" },
  lg: { box: "size-60 md:size-70", d: 240, ring: 11, value: "text-[64px] leading-none tracking-[-0.01em] md:text-[72px]" },
} as const

const DIAL_LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase"
const TRACK = "var(--dial-track)"
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
        word: band ? { text: BAND_WORD[band], className: c.text } : undefined,
      }
    }
    case "strain":
      return { label: p.label ?? (lg ? "Day strain" : "Strain"), max: 21, color: DATA_COLORS[dialColor("strain", p.value ?? 0)].css, text: formatValue("decimal1", p.value) }
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

/** The WHOOP ring (spec §5.1): Recharts radial bar over a pie track, centre text in HTML. */
export function ScoreDial(props: ScoreDialProps) {
  const { variant, size, value, href } = props
  const reduced = useReducedMotion()
  const r = resolve(props)
  const s = SIZE[size]
  const lg = size === "lg"
  const radii = ringRadii(s.d, s.ring)
  const empty = value === null
  const reason = empty ? reasonCopy(props.reason, props.nightsLeft) : null
  const gauge = variant === "gauge"
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
    bandWord: r.word?.text,
    target,
    soFar: props.extraTags?.includes("so_far"),
  })

  const anim = { isAnimationActive: !reduced, animationDuration: 700, animationEasing: "ease-out" as const }
  const pieBase = { dataKey: "v", stroke: "none", isAnimationActive: false, cx: "50%", cy: "50%" } as const

  const ring = (
    <div className={cn("relative shrink-0", s.box)} role="img" aria-label={aria} aria-hidden={href ? true : undefined}>
      {/* Track layer: plain track, Strain Target band and tick, or the stress gauge arc. */}
      <ChartContainer config={{}} className={CHART_RESET} initialDimension={{ width: s.d, height: s.d }}>
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          {gauge ? (
            <>
              <Pie
                {...pieBase}
                data={empty ? [{ v: 1, fill: TRACK }] : (["low", "medium", "high"] as const).map((l) => ({ v: 1, fill: DATA_COLORS[STRESS_COLOR[l]].css }))}
                startAngle={210}
                endAngle={-30}
                paddingAngle={empty ? 0 : 2}
                innerRadius={radii.inner}
                outerRadius={radii.outer}
              />
              {!empty && (
                <Pie
                  {...pieBase}
                  data={markerSlices(value, 3, 0.06).map((v, i) => ({ v, fill: i === 1 ? "var(--foreground)" : "transparent" }))}
                  startAngle={210}
                  endAngle={-30}
                  innerRadius={radii.tickInner}
                  outerRadius={radii.tickOuter}
                />
              )}
            </>
          ) : (
            <>
              <Pie
                {...pieBase}
                data={(target ? targetSlices(target[0], target[1]) : [1]).map((v, i) => ({ v, fill: i === 1 ? "var(--dial-target)" : TRACK }))}
                startAngle={90}
                endAngle={-270}
                innerRadius={radii.inner}
                outerRadius={radii.outer}
              />
              {target && (
                <Pie
                  {...pieBase}
                  data={markerSlices((target[0] + target[1]) / 2, 21, 0.2).map((v, i) => ({ v, fill: i === 1 ? "var(--foreground)" : "transparent" }))}
                  startAngle={90}
                  endAngle={-270}
                  innerRadius={radii.tickInner}
                  outerRadius={radii.tickOuter}
                />
              )}
            </>
          )}
        </PieChart>
      </ChartContainer>

      {/* Fill layer: draws above the target band, so the band is covered once strain passes it. */}
      {!gauge && (
        <ChartContainer config={{}} className={CHART_RESET} initialDimension={{ width: s.d, height: s.d }}>
          <RadialBarChart
            data={[{ value: empty ? 0 : Math.min(value, r.max) }]}
            startAngle={90}
            endAngle={-270}
            innerRadius={radii.inner}
            outerRadius={radii.outer}
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <PolarAngleAxis type="number" domain={[0, r.max]} tick={false} axisLine={false} />
            <RadialBar dataKey="value" fill={r.color} cornerRadius={0} background={false} {...anim} />
          </RadialBarChart>
        </ChartContainer>
      )}

      <div className="absolute inset-0 grid place-content-center justify-items-center px-[12%] text-center">
        {lg && !empty && !gauge && (
          <span aria-hidden className="mb-1 text-xs leading-4 font-medium tracking-[0.35em] text-foreground-secondary uppercase">
            Pulse
          </span>
        )}
        {lg && empty && reason?.code !== "no_data" ? (
          <ReasonCentre icon={reason!.icon} text={reason!.short} />
        ) : (
          <span className={cn("font-numeric font-bold tabular-nums", s.value, empty && "text-muted-foreground")}>
            {r.text}
            {r.unit && !empty && <span className="text-[0.55em]">{r.unit}</span>}
          </span>
        )}
        {gauge && r.word && <span className={cn(DIAL_LABEL, "mt-1", r.word.className)}>{r.word.text}</span>}
        {gauge && props.caption && <span className="mt-1 text-xs leading-4 font-medium text-foreground-secondary">{props.caption}</span>}
        {lg && !gauge && (
          <>
            <span className={cn(DIAL_LABEL, "mt-2 max-w-36 text-balance")}>{r.label}</span>
            {r.word && <span className={cn(DIAL_LABEL, "mt-1", r.word.className)}>{r.word.text}</span>}
            <span className="mt-2 empty:hidden">{tagNode}</span>
          </>
        )}
      </div>
      {gauge && lg && (
        <div aria-hidden className="absolute inset-x-[3%] top-[79%] flex justify-between font-numeric text-xs font-medium text-muted-foreground tabular-nums">
          <span>0.0</span>
          <span>3.0</span>
        </div>
      )}
    </div>
  )

  const below = !lg && (
    <span className="flex flex-col items-center gap-1.5">
      <span className={cn(size === "sm" ? "text-xs leading-4 font-medium text-foreground-secondary" : DIAL_LABEL, "inline-flex items-center gap-0.5")}>
        {r.label}
        {href && <ChevronRight aria-hidden className="size-3" strokeWidth={2.5} />}
      </span>
      {tagNode}
    </span>
  )

  const longReason = lg && empty && reason && (
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
        aria-label={`${aria}. Open ${r.label} details`}
        className="flex min-w-24 flex-col items-center gap-2 rounded-xl p-1 transition-transform duration-150 ease-standard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
      >
        {content}
      </Link>
    )
  return <div className={cn("flex flex-col items-center", lg ? "gap-3" : "gap-2")}>{content}</div>
}

function ReasonCentre({ icon: Icon, text }: { icon: ReturnType<typeof reasonCopy>["icon"]; text: string }) {
  return (
    <span className="flex flex-col items-center gap-2">
      {Icon && <Icon aria-hidden className="size-6 text-foreground-secondary" strokeWidth={1.75} />}
      <span className="line-clamp-2 max-w-40 text-base leading-[22px] font-semibold text-balance text-foreground-secondary">{text}</span>
    </span>
  )
}

/**
 * Loading shape: the ring at its diameter plus the label bar (spec §5.1). Server components import
 * the named export: they cannot dot into a client module.
 */
export function ScoreDialSkeleton({ size }: { size: DialSize }) {
  const s = SIZE[size]
  return (
    <div aria-hidden className="flex flex-col items-center gap-2">
      <div
        className={cn(
          "grid shrink-0 place-content-center justify-items-center gap-2 rounded-full border-muted animate-pulse motion-reduce:animate-none",
          size === "lg" ? "border-[11px] md:border-[13px]" : size === "sm" ? "border-[5px]" : "border-[6px]",
          s.box
        )}
      >
        {size === "lg" && (
          <>
            <Skeleton className="h-12 w-28 rounded-md" />
            <Skeleton className="h-3 w-20" />
          </>
        )}
      </div>
      {size !== "lg" && <Skeleton className="h-3 w-14" />}
    </div>
  )
}

ScoreDial.Skeleton = ScoreDialSkeleton
