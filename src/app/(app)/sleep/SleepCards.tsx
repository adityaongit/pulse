// Sleep's measure cards drawn the way WHOOP draws them: hours against need as two bars, the last five nights' bed and
// wake times against your usual ones, efficiency as asleep and awake bars marked where you woke, and sleep stress by
// level. Plain DOM meters, except the stress line.
import { cn } from "@/lib/utils"
import { hmm } from "@/lib/format"
import { DATA_COLORS, STRESS_COLOR, STRESS_WORD, deltaTone, type StressLevel } from "@/lib/bands"
import { StressChart } from "@/components/charts/StressChart"
import { ReasonPlaceholder } from "@/components/metrics/ReasonPlaceholder"
import { CAPTION, DeltaMark, LABEL } from "@/components/metrics/primitives"
import type { KeyStat, SleepVM } from "@/server/queries/types"

const BAR = "h-3.5 rounded-[3px]"
const signed = (min: number, sign: "+" | "−") => `${sign}${hmm(Math.abs(min))}`

/** WHOOP's card headline: the percentage large with its arrow against the prior 30 nights, and their mean under it. */
function Headline({ value, stat, down = false }: { value: number; stat?: Pick<KeyStat, "average" | "sd">; down?: boolean }) {
  const avg = stat?.average ?? null
  const t = avg === null ? null : deltaTone(down ? "down" : "up", value, avg, stat?.sd)
  return (
    <div>
      <p className="flex items-center gap-1.5">
        <span className="font-numeric text-4xl leading-10 font-bold tracking-[-0.01em] tabular-nums">{Math.round(value)}%</span>
        {t && <DeltaMark dir={t.dir} tone={t.tone} />}
      </p>
      {avg !== null && (
        <p className="font-numeric text-[13px] leading-4 font-medium text-muted-foreground tabular-nums">
          <span className="sr-only">Prior 30-night average </span>
          {Math.round(avg)}%
        </p>
      )}
    </div>
  )
}

/** A swatch, a name and a right-aligned value: the legend under a bar. */
function Legend({ rows }: { rows: { swatch: string; label: string; value: string }[] }) {
  return (
    <dl className="mt-4 space-y-2 rounded-lg bg-inset px-3 py-3">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-[13px] leading-4 font-medium">
          <span aria-hidden className={cn("size-3 shrink-0 rounded-[3px]", r.swatch)} />
          <dt className="flex-1 text-foreground-secondary">{r.label}</dt>
          <dd className="font-numeric font-semibold tabular-nums">{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function HoursVsNeed({ vm }: { vm: SleepVM }) {
  const m = vm.hoursVsNeed
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const h = m.value
  const stat = vm.summary.find((k) => k.key === "hours")
  const scale = Math.max(h.asleepMin, h.needMin, 1)
  const pct = (min: number) => `${Math.min(100, (min / scale) * 100)}%`
  const { baselineMin, strainMin, debtMin, napMin } = h.parts
  return (
    <div>
      <Headline value={(h.asleepMin / h.needMin) * 100} stat={stat} />
      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className={cn(LABEL, "text-muted-foreground")}>Hours of sleep</span>
            <span className="font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(h.asleepMin)}</span>
          </p>
          {/* The reference app's bar fades in from the track to sleep blue at the night's length. */}
          <div aria-hidden className={cn("bg-linear-to-r from-sleep/0 to-sleep", BAR)} style={{ width: pct(h.asleepMin) }} />
        </div>
        <div>
          {h.calibrating ? (
            <p className={CAPTION}>Your need settles after 7 nights. Using {hmm(h.needMin)} until then.</p>
          ) : (
            // The need builds left to right: the healthy minimum fading in, then recent strain, then sleep debt.
            <div aria-hidden className="flex gap-0.5" style={{ width: pct(h.needMin) }}>
              {[
                [baselineMin, "bg-linear-to-r from-foreground/0 to-foreground/35"],
                [strainMin, "bg-strain"],
                [debtMin, "bg-foreground/80"],
              ].map(([min, color], i) => (
                <span key={i} className={cn(BAR, "first:rounded-r-none", color as string)} style={{ flexGrow: Math.max(0, min as number), flexBasis: 0 }} />
              ))}
            </div>
          )}
          <p className="mt-1.5 flex items-baseline justify-between gap-3">
            <span className={cn(LABEL, "text-muted-foreground")}>Sleep needed</span>
            <span className="font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(h.needMin)}</span>
          </p>
        </div>
      </div>
      {!h.calibrating && (
        <Legend
          rows={[
            { swatch: "bg-foreground/35", label: "Healthy Minimum", value: hmm(baselineMin) },
            { swatch: "bg-strain", label: "Recent Strain", value: signed(strainMin, "+") },
            { swatch: "bg-foreground/80", label: "Sleep Debt", value: signed(debtMin, "+") },
            ...(napMin > 0 ? [{ swatch: "bg-sleep", label: "Naps", value: signed(napMin, "−") }] : []),
          ]}
        />
      )}
    </div>
  )
}

const pad = (n: number) => String(n).padStart(2, "0")
/** Minutes from local midnight (negative = before it) as 24-hour clock text. */
const at = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

/**
 * A path through the nights' optimal times (x and y in 0-100): level across each night's column, easing to the next
 * night's height between columns, from the first column's left edge to the last one's right. A missing night breaks it.
 */
function optimalPath(points: ({ x: number; y: number } | null)[]) {
  let d = ""
  let prev: { x: number; y: number } | null = null
  for (const p of points) {
    if (!p) {
      prev = null
      continue
    }
    if (!prev) d += `M${p.x - 9} ${p.y} L${p.x + 4} ${p.y}`
    else {
      const mid = (prev.x + p.x) / 2
      d += ` C${mid} ${prev.y} ${mid} ${p.y} ${p.x - 4} ${p.y} L${p.x + 4} ${p.y}`
    }
    prev = p
  }
  return prev ? `${d} L${prev.x + 9} ${prev.y}` : d
}

export function SleepConsistency({ vm }: { vm: SleepVM }) {
  const m = vm.consistency
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const c = m.value
  const nights = c.nights.flatMap((n) => (n ? [n] : []))
  const beds = nights.flatMap((n) => [n.bed, ...(n.typicalBed != null ? [n.typicalBed] : [])])
  const wakes = nights.flatMap((n) => [n.wake, ...(n.typicalWake != null ? [n.typicalWake] : [])])
  // The reference app's fixed axis, 21:00 to 13:00 in 4-hour steps, stretched by whole steps only when a night falls
  // outside it.
  const lo = Math.min(-180, Math.floor((Math.min(...beds) - 60 + 180) / 240) * 240 - 180)
  const hi = Math.max(780, Math.ceil((Math.max(...wakes) + 60 - 780) / 240) * 240 + 780)
  const pctOf = (min: number) => ((min - lo) / (hi - lo)) * 100
  const ticks = Array.from({ length: Math.floor((hi - lo) / 240) + 1 }, (_, i) => lo + i * 240)
  const last = c.nights.at(-1)
  const optimal = (pick: (n: (typeof nights)[number]) => number | null) =>
    optimalPath(c.nights.map((n, i) => (n && pick(n) != null ? { x: i * 20 + 10, y: pctOf(pick(n)!) } : null)))
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <Headline value={c.pct} stat={vm.summary.find((k) => k.key === "consistency")} />
        <p className="flex items-center gap-2 pb-px text-[13px] leading-4 font-medium text-foreground-secondary">
          <span aria-hidden className="w-5 border-t-[1.5px] border-dashed border-foreground/55" />
          Optimal bed/wake time
        </p>
      </div>
      <div role="img" aria-label={`Bed and wake times for the last five nights${last ? `, last night ${at(last.bed)} to ${at(last.wake)}` : ""}`} className="mt-4 flex gap-3">
        <div aria-hidden className="relative h-52 w-10 shrink-0 font-numeric text-[12px] leading-3 font-semibold text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${pctOf(t)}%` }}>
              {at(t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div aria-hidden className="relative h-52">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-x-0 border-t border-border" style={{ top: `${pctOf(t)}%` }} />
            ))}
            {/* Each night's optimal bed and wake time, joined into one dashed line that eases from night to night. */}
            <svg className="absolute inset-0 z-10 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              {[optimal((n) => n.typicalBed), optimal((n) => n.typicalWake)].map((d, i) => (
                <path key={i} d={d} fill="none" stroke="var(--foreground)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            <div className="absolute inset-0 grid grid-cols-5">
              {c.nights.map((n, i) =>
                n ? (
                  <div key={i} className="relative">
                    <div
                      className={cn("absolute left-1/2 w-[18px] -translate-x-1/2 rounded-[3px]", i === 4 ? "bg-sleep" : "bg-foreground/30")}
                      style={{ top: `${pctOf(n.bed)}%`, bottom: `${100 - pctOf(n.wake)}%` }}
                    />
                    {/* Last night's times beside its bar, as WHOOP labels them: bed above, wake below, clear of the dashed lines. */}
                    {i === 4 && (
                      <>
                        <span className="absolute left-1/2 z-20 -translate-x-1/2 -translate-y-[calc(100%+4px)] font-numeric text-[13px] leading-4 font-bold whitespace-nowrap text-sleep tabular-nums" style={{ top: `${pctOf(Math.min(n.bed, n.typicalBed ?? n.bed))}%` }}>
                          {at(n.bed)}
                        </span>
                        <span className="absolute left-1/2 z-20 -translate-x-1/2 translate-y-1 font-numeric text-[13px] leading-4 font-bold whitespace-nowrap text-sleep tabular-nums" style={{ top: `${pctOf(Math.max(n.wake, n.typicalWake ?? n.wake))}%` }}>
                          {at(n.wake)}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div key={i} />
                ),
              )}
            </div>
          </div>
          <div aria-hidden className="mt-2 grid grid-cols-5 text-center text-[13px] leading-4 font-medium text-muted-foreground">
            {c.nights.map((n, i) => (
              <span key={i} className={cn(i === 4 && "font-bold text-foreground")}>
                {n?.label ?? "·"}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Tick marks where you woke: thin card-coloured cuts through a bar, at least 2 px wide. */
function Wakes({ wakes, className }: { wakes: { at: number; width: number }[]; className: string }) {
  return wakes.map((w, i) => (
    <span key={i} className={cn("absolute inset-y-0 min-w-0.5", className)} style={{ left: `${w.at * 100}%`, width: `${w.width * 100}%` }} />
  ))
}

/**
 * The reference app's Sleep Efficiency card (sleep-24, sleep-25): the share with its arrow and prior mean, an asleep bar
 * cut where each spell awake fell, an awake bar on the hatched track marked at the same places, then the wake events.
 */
export function SleepEfficiency({ vm }: { vm: SleepVM }) {
  const m = vm.efficiency
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const e = m.value
  return (
    <div>
      <Headline value={e.pct} stat={e} />
      <div className="mt-4 space-y-2">
        <p className="flex items-baseline justify-between gap-3">
          <span className={cn(LABEL, "text-muted-foreground")}>Asleep</span>
          <span className="font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(e.asleepMin)}</span>
        </p>
        <div aria-hidden className={cn("relative overflow-hidden bg-sleep", BAR)}>
          <Wakes wakes={e.wakes} className="bg-card" />
        </div>
        <div aria-hidden className={cn("relative overflow-hidden bg-(image:--pattern-hatch)", BAR)}>
          <Wakes wakes={e.wakes} className="bg-foreground" />
        </div>
        <p className="flex items-baseline justify-between gap-3">
          <span className={cn(LABEL, "text-muted-foreground")}>Awake</span>
          <span className="font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(e.awakeMin)}</span>
        </p>
      </div>
      <p className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <span aria-hidden className="size-3.5 shrink-0 rounded-[3px] bg-foreground/80" />
        <span className={cn(LABEL, "flex-1")}>Wake events</span>
        <span className="font-numeric text-xl leading-6 font-bold tabular-nums">{e.wakeEvents ?? "--"}</span>
      </p>
    </div>
  )
}

const LEVELS: StressLevel[] = ["high", "medium", "low"]

/**
 * The reference app's Sleep Stress card (sleep-26, sleep-27): the share of the night in high stress against the prior
 * 30 nights, the night's 0-3 line, then a row per level with its share, time and a filled hatched track. Built and off
 * (`FEATURES.sleepStress`) until Pulse scores stress during sleep.
 */
export function SleepStress({ vm }: { vm: SleepVM }) {
  const m = vm.sleepStress
  if (m.value === null) return <ReasonPlaceholder reason={m.reason} nightsLeft={m.nightsLeft} size="md" />
  const s = m.value
  const total = Math.max(1, s.minutes.high + s.minutes.medium + s.minutes.low)
  return (
    <div>
      <Headline value={s.pct} stat={s} down />
      <div className="mt-4">
        <StressChart variant="full" data={{ value: { points: s.points.map((p) => ({ t: p.t, value: p.v })), spans: [{ kind: "sleep", label: "Sleep", start: s.bed, end: s.wake }] }, reason: null, provisional: false }} />
      </div>
      <div className="mt-4 space-y-4">
        {LEVELS.map((l) => {
          const share = (s.minutes[l] / total) * 100
          const color = DATA_COLORS[STRESS_COLOR[l]]
          return (
            <div key={l} className="space-y-2">
              <p className="flex items-baseline gap-2.5">
                <span className={LABEL}>{STRESS_WORD[l]}</span>
                <span className={cn("font-numeric text-[13px] font-bold tabular-nums", color.text)}>{Math.round(share)}%</span>
                <span className="ml-auto font-numeric text-lg leading-6 font-bold tabular-nums">{hmm(s.minutes[l])}</span>
              </p>
              <div aria-hidden className={cn("relative bg-(image:--pattern-hatch)", BAR)}>
                <div className={cn("absolute inset-y-0 left-0", BAR, color.bg)} style={{ width: `${share}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
