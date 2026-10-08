"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { DATA_COLORS, deltaTone, GOOD_DIRECTION } from "@/lib/bands"
import { durationWords, hmm, statSentence } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { HypnogramChart } from "@/components/charts/Hypnogram"
import { SleepHrChart, SleepHrChartSkeleton, type SleepHr } from "@/components/charts/SleepHrChart"
import { ReasonPlaceholder } from "./ReasonPlaceholder"
import { DeltaMark, LABEL } from "./primitives"

type Stage = "awake" | "rem" | "light" | "deep"
export type SleepStagesNight = {
  bed: number
  wake: number
  segments: { stage: Stage; start: number; end: number }[]
  rows: { stage: Stage; label: string; pct: number; minutes: number; typical: [number, number] }[]
}
/** Time asleep in the main sleep and the prior 30 nights' mean, minutes. */
export type SleepHours = { asleepMin: number; average: number | null; sd?: number }

export type SleepStagesProps = {
  /** The hero: no value means no night, and the whole card shows the reason. */
  hours: Metric<SleepHours> | undefined
  /** Deep + REM against the prior 30 nights: the row that closes the breakdown (spec §11 R33). */
  restorative?: Metric<{ minutes: number; average: number | null; sd?: number }>
  hr: Metric<SleepHr> | undefined
  /** null: a night Fitbit did not stage. */
  data: Metric<SleepStagesNight> | null | undefined
}

// the reference app's order, top to bottom [latest-sleep-stages-1].
const ORDER: Stage[] = ["awake", "light", "deep", "rem"]
const EMPTY = "No stage data for this night. Fitbit only stages sleeps longer than about 3 hours."
const HERO = "font-numeric text-[32px] leading-9 font-bold tracking-[-0.01em]"

/** the reference app's "Hours of sleep" [latest-sleep-stages-1]: time asleep, the arrow against the prior 30 nights and their mean under it. */
function HoursHero({ h }: { h: SleepHours }) {
  const t = h.average === null ? undefined : deltaTone(GOOD_DIRECTION.hours, h.asleepMin, h.average, h.sd)
  const sentence = statSentence({
    label: "Hours of sleep",
    valueText: durationWords(h.asleepMin),
    averageText: h.average === null ? undefined : durationWords(h.average),
    dir: t?.dir,
    tone: t?.tone,
  })
  return (
    <div>
      <p className={cn(LABEL, "text-foreground-secondary")}>Hours of sleep</p>
      <p className="sr-only">{sentence}</p>
      <div aria-hidden className="mt-1.5 grid w-fit grid-cols-[auto_8px] items-center gap-x-2">
        <span className={cn(HERO, "tabular-nums")}>{hmm(h.asleepMin)}</span>
        {t ? <DeltaMark dir={t.dir} tone={t.tone} /> : <span />}
        {h.average !== null && <span className="font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums">{hmm(h.average)}</span>}
      </div>
    </div>
  )
}

/** WHOOP's stage names; Fitbit's "Deep" is slow-wave sleep. */
const ROW_LABEL: Record<Stage, string> = { awake: "Awake", light: "Light", deep: "SWS (Deep)", rem: "REM" }
const TABS = [
  ["breakdown", "Breakdown"],
  ["timeline", "Timeline"],
] as const
type Tab = (typeof TABS)[number][0]

/** The typical-range mark: a dashed box over the track (the legend's swatch and each row's range). */
const RANGE_BOX = "border-x-[1.5px] border-dashed border-foreground/75 bg-foreground/12"

/** The reference app's closing row: a deep-to-REM swatch, "Restorative sleep", the minutes with an arrow and the prior mean. */
function RestorativeRow({ r }: { r: { minutes: number; average: number | null; sd?: number } }) {
  const t = r.average === null ? undefined : deltaTone("up", r.minutes, r.average, r.sd)
  return (
    <div className="flex items-center gap-3 border-t border-border pt-4">
      <span aria-hidden className="size-4 shrink-0 rounded-[3px] bg-linear-135 from-stage-deep to-stage-rem" />
      <span className={cn(LABEL, "min-w-0 flex-1 text-[13px]")}>Restorative sleep</span>
      <span className="sr-only">
        {statSentence({ label: "Restorative sleep", valueText: durationWords(r.minutes), averageText: r.average === null ? undefined : durationWords(r.average), dir: t?.dir, tone: t?.tone })}
      </span>
      <span aria-hidden className="grid grid-cols-[auto_8px] items-center gap-x-2 text-right">
        <span className="font-numeric text-[22px] leading-7 font-bold tabular-nums">{hmm(r.minutes)}</span>
        {t ? <DeltaMark dir={t.dir} tone={t.tone} /> : <span />}
        {r.average !== null && <span className="font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums">{hmm(r.average)}</span>}
      </span>
    </div>
  )
}

function Rows({ night, selected, onSelect, restorative }: { night: SleepStagesNight; selected: Stage; onSelect: (s: Stage) => void; restorative?: SleepStagesProps["restorative"] }) {
  const name = React.useId()
  const [tab, setTab] = React.useState<Tab>("breakdown")
  const span = Math.max(1, night.wake - night.bed)
  const rows = ORDER.map((s) => night.rows.find((r) => r.stage === s)).filter((r) => !!r)

  return (
    <div className="space-y-4">
      {/* One view at a time: the stage breakdown (WHOOP's rows) or the night's timeline (the hypnogram). */}
      <div role="tablist" aria-label="Stages view" className="flex gap-0.5 rounded-lg bg-muted p-0.5">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "grid h-10 flex-1 place-items-center rounded-md text-[13px] font-bold tracking-[0.1em] uppercase outline-none transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50",
              tab === id ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {tab === "breakdown" ? (
          <span className={cn(LABEL, "flex items-center gap-2 text-foreground-secondary")}>
            <span aria-hidden className={cn("h-4 w-3.5", RANGE_BOX)} />
            Typical range
          </span>
        ) : (
          <h3 className={cn(LABEL, "text-foreground-secondary")}>Stages</h3>
        )}
        <span className="flex items-baseline gap-2">
          <span className={cn(LABEL, "text-muted-foreground")}>Duration</span>
          <span className="font-numeric text-[17px] leading-5 font-bold text-foreground tabular-nums">{hmm(span / 60_000)}</span>
        </span>
      </div>
      {tab === "timeline" ? (
        <HypnogramChart night={night} />
      ) : (
        // Choosing a stage lights its stretches on the heart-rate line above.
        <div role="radiogroup" aria-label="Highlight a sleep stage" className="space-y-5 pt-1">
          {rows.map((r) => {
            const on = r.stage === selected
            const color = DATA_COLORS[`stage-${r.stage}`]
            return (
              <label key={r.stage} className="group block cursor-pointer space-y-3">
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name={name}
                    value={r.stage}
                    checked={on}
                    onChange={() => onSelect(r.stage)}
                    aria-label={`${ROW_LABEL[r.stage]}, ${Math.round(r.pct)} percent, ${hmm(r.minutes)}. Typical ${r.typical[0]} to ${r.typical[1]} percent`}
                    className="peer sr-only"
                  />
                  {/* the reference app's radio: a white ring, filled white with a dark centre when chosen. */}
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-[26px] shrink-0 place-items-center rounded-full ring-2 transition-[background-color,box-shadow] duration-150 ease-standard ring-inset peer-focus-visible:outline-3 peer-focus-visible:outline-ring/50",
                      on ? "bg-foreground ring-foreground" : "ring-foreground/90 group-hover:ring-foreground"
                    )}
                  >
                    {on && <span className="size-2.5 rounded-full bg-background" />}
                  </span>
                  <span aria-hidden className="flex min-w-0 flex-1 items-baseline gap-2.5">
                    <span className={cn(LABEL, "text-[13px]")}>{ROW_LABEL[r.stage]}</span>
                    <span className={cn("font-numeric text-[15px] leading-5 font-bold tabular-nums", color.text)}>{Math.round(r.pct)}%</span>
                  </span>
                  <span aria-hidden className="font-numeric text-[22px] leading-7 font-bold tabular-nums">
                    {hmm(r.minutes)}
                  </span>
                </span>
                {/* WHOOP's row: the stage's share of the night filled over the hatched track, the typical range boxed. */}
                <span aria-hidden className="relative block h-3.5 rounded-[4px] bg-(image:--pattern-hatch)">
                  <span className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: `${Math.min(100, r.pct)}%`, background: color.css }} />
                  <span className={cn("absolute -inset-y-1.5", RANGE_BOX)} style={{ left: `${r.typical[0]}%`, width: `${r.typical[1] - r.typical[0]}%` }} />
                </span>
              </label>
            )
          })}
        </div>
      )}
      {tab === "breakdown" && restorative?.value && <RestorativeRow r={restorative.value} />}
    </div>
  )
}

/**
 * the reference app's "Last night's sleep" card (spec §7.5, §11 V8, R9): the hours hero, the overnight heart rate, then the
 * stages as a breakdown (rows) or a timeline (hypnogram). Choosing a stage row lights its stretches on the heart-rate line.
 */
export function SleepStages({ hours, hr, data, restorative }: SleepStagesProps) {
  const [selected, setSelected] = React.useState<Stage>("awake")
  const segments = data?.value?.segments
  const highlight = React.useMemo(() => (segments?.length ? segments.filter((g) => g.stage === selected) : undefined), [segments, selected])
  return (
    <MetricState
      metric={hours}
      skeleton={<SleepStagesSkeleton />}
      renderReason={(r, meta) => (
        <div className="grid place-items-center">
          <ReasonPlaceholder reason={r} nightsLeft={meta.nightsLeft} size="md" />
        </div>
      )}
    >
      {(h) => (
        <div className="space-y-4">
          <HoursHero h={h} />
          <SleepHrChart data={hr} highlight={highlight} />
          <div className="border-t border-border pt-4">
            <MetricState
              metric={data}
              skeleton={<StageRowsSkeleton />}
              empty={<EmptyState body={EMPTY} />}
              renderReason={(r) => <ReasonPlaceholder reason={r} size="md" />}
            >
              {(night) => (night.segments.length ? <Rows night={night} selected={selected} onSelect={setSelected} restorative={restorative} /> : <EmptyState body={EMPTY} />)}
            </MetricState>
          </div>
        </div>
      )}
    </MetricState>
  )
}

function StageRowsSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <Skeleton className="h-11 rounded-lg" />
      <div className="flex items-baseline justify-between">
        <span className={cn(LABEL, "text-foreground-secondary")}>Typical range</span>
        <SkeletonText className="w-24 text-[17px] leading-5" />
      </div>
      {["Awake", "Light", "SWS (Deep)", "REM"].map((l) => (
        <div key={l} className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="size-[26px] rounded-full ring-2 ring-foreground/30 ring-inset" />
            <span className={cn(LABEL, "flex-1")}>{l}</span>
            <SkeletonText className="w-[4ch] font-numeric text-xl leading-6" />
          </div>
          <Skeleton className="h-3.5 rounded-[4px] bg-muted/60" />
        </div>
      ))}
    </div>
  )
}

/** Loading shape: the hero's label and number, the chart box, then the rows with real stage names and their tracks. */
export function SleepStagesSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div>
        <p className={cn(LABEL, "text-foreground-secondary")}>Hours of sleep</p>
        <SkeletonText className={cn(HERO, "mt-1.5 w-[4ch]")} />
        <SkeletonText className="w-[4ch] text-[13px] leading-4" />
      </div>
      <SleepHrChartSkeleton />
      <div className="border-t border-border pt-4">
        <StageRowsSkeleton />
      </div>
    </div>
  )
}
SleepStages.Skeleton = SleepStagesSkeleton
