"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { clock, hmm } from "@/lib/format"
import type { Metric } from "@/lib/reasons"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { useOptionalShellCalendar } from "@/components/shells/ShellStatus"
import { ReasonPlaceholder } from "./ReasonPlaceholder"
import { CAPTION, LABEL } from "./primitives"

type Stage = "awake" | "rem" | "light" | "deep"
export type SleepStagesNight = {
  bed: number
  wake: number
  segments: { stage: Stage; start: number; end: number }[]
  rows: { stage: Stage; label: string; pct: number; minutes: number; typical: [number, number] }[]
}

// WHOOP's order, top to bottom [latest-sleep-stages-1].
const ORDER: Stage[] = ["awake", "light", "deep", "rem"]
const EMPTY = "No stage data for this night. Fitbit only stages sleeps longer than about 3 hours."

function Rows({ night }: { night: SleepStagesNight }) {
  const tz = useOptionalShellCalendar()?.timeZone
  const name = React.useId()
  const [selected, setSelected] = React.useState<Stage>("awake")
  const span = Math.max(1, night.wake - night.bed)
  const rows = ORDER.map((s) => night.rows.find((r) => r.stage === s)).filter((r) => !!r)

  return (
    <div className="space-y-4">
      <div className={cn(CAPTION, "flex items-baseline justify-between gap-3 tabular-nums")}>
        <span>
          {clock(night.bed, tz)} to {clock(night.wake, tz)}
        </span>
        <span className="flex items-baseline gap-2">
          <span className={cn(LABEL, "text-muted-foreground")}>Duration</span>
          <span className="font-numeric text-[17px] leading-5 font-bold text-foreground">{hmm(span / 60_000)}</span>
        </span>
      </div>
      <div role="radiogroup" aria-label="Highlight a sleep stage" className="space-y-4">
        {rows.map((r) => {
          const on = r.stage === selected
          const blocks = night.segments.filter((g) => g.stage === r.stage)
          return (
            <label key={r.stage} className="group block cursor-pointer space-y-2.5">
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name={name}
                  value={r.stage}
                  checked={on}
                  onChange={() => setSelected(r.stage)}
                  aria-label={`${r.label}, ${Math.round(r.pct)} percent, ${hmm(r.minutes)}. Typical ${r.typical[0]} to ${r.typical[1]} percent`}
                  className="peer sr-only"
                />
                {/* WHOOP's radio: a white ring, filled white with a dark centre when chosen. */}
                <span
                  aria-hidden
                  className={cn(
                    "grid size-[22px] shrink-0 place-items-center rounded-full ring-2 transition-[background-color,box-shadow] duration-150 ease-standard ring-inset peer-focus-visible:outline-3 peer-focus-visible:outline-ring/50",
                    on ? "bg-foreground ring-foreground" : "ring-foreground/80 group-hover:ring-foreground"
                  )}
                >
                  {on && <span className="size-2 rounded-full bg-background" />}
                </span>
                <span aria-hidden className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={LABEL}>{r.label}</span>
                  <span className="font-numeric text-[13px] leading-4 font-semibold text-foreground-secondary tabular-nums">{Math.round(r.pct)}%</span>
                  <span className={cn(CAPTION, "tabular-nums")}>
                    Typical {r.typical[0]}-{r.typical[1]}%
                  </span>
                </span>
                <span aria-hidden className="font-numeric text-xl leading-6 font-bold tabular-nums">
                  {hmm(r.minutes)}
                </span>
              </span>
              {/* The stage's time drawn as blocks on the hatched night track (spec §2.9, V8). */}
              <span aria-hidden className="relative block h-3 overflow-hidden rounded-full bg-(image:--pattern-hatch)">
                {blocks.map((g) => (
                  <span
                    key={g.start}
                    className={cn(
                      "absolute inset-y-0 min-w-0.5 rounded-[2px] bg-foreground/80 transition-opacity duration-150 ease-standard",
                      !on && "opacity-35"
                    )}
                    style={{ left: `${((g.start - night.bed) / span) * 100}%`, width: `${((g.end - g.start) / span) * 100}%` }}
                  />
                ))}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

/** Last night's stages as WHOOP's radio rows with hatched tracks (spec §7.5, §11 V8). Replaces the Recharts hypnogram. */
export function SleepStages({ data }: { data: Metric<SleepStagesNight> | null | undefined }) {
  return (
    <MetricState
      metric={data}
      skeleton={<SleepStagesSkeleton />}
      empty={<EmptyState body={EMPTY} />}
      renderReason={(r) => (
        <div className="grid min-h-40 place-items-center">
          <ReasonPlaceholder reason={r} size="md" />
        </div>
      )}
    >
      {(night) => (night.segments.length ? <Rows night={night} /> : <EmptyState body={EMPTY} />)}
    </MetricState>
  )
}

/** Loading shape: the same rows with real stage names, bars for the numbers and the tracks. */
export function SleepStagesSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="flex justify-between">
        <SkeletonText className={cn(CAPTION, "w-24")} />
        <SkeletonText className="w-24 text-[17px] leading-5" />
      </div>
      {["Awake", "Light", "Deep", "REM"].map((l) => (
        <div key={l} className="space-y-2.5">
          <div className="flex items-center gap-3">
            <span className="size-[22px] rounded-full ring-2 ring-foreground/30 ring-inset" />
            <span className={cn(LABEL, "flex-1")}>{l}</span>
            <SkeletonText className="w-[4ch] font-numeric text-xl leading-6" />
          </div>
          <Skeleton className="h-3 rounded-full bg-muted/60" />
        </div>
      ))}
    </div>
  )
}
SleepStages.Skeleton = SleepStagesSkeleton
