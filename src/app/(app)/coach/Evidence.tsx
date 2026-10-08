import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowUpRight } from "lucide-react"
import type { CoachOutputs } from "@/server/coach/tools"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { Sparkline } from "@/components/metrics/Sparkline"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { MetricState } from "@/components/shells/MetricState"
import { CARD_MATERIAL } from "@/components/ui/card"
import type { Metric } from "@/lib/reasons"
import { normalizeReason } from "@/lib/reasons"
import { cn } from "@/lib/utils"

function metric(m: { value: number | null; reason?: string | null; provisional?: boolean }): Metric<number> {
  return { ...m, reason: m.value === null ? normalizeReason(m.reason) : null, provisional: m.provisional ?? false }
}

function BasedOn({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-coach-text hover:underline underline-offset-4">Based on {children}<ArrowUpRight aria-hidden className="size-3.5" /></Link>
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <div className={cn(CARD_MATERIAL, "min-w-0 px-4 py-3")}><p className="mb-1 text-[12px] font-semibold text-foreground-secondary">{title}</p>{children}</div>
}

export function Evidence({ name, output }: { name: string; output: unknown }) {
  if (!output || typeof output !== "object") return null
  if (name === "get_day") {
    const d = output as CoachOutputs["get_day"]
    return <BasedOn href={`/recovery?d=${d.day}`}>Recovery, Sleep and Strain · {d.day}</BasedOn>
  }
  if (name === "get_trend") {
    const d = output as CoachOutputs["get_trend"]
    if (!d.points || !d.previous) return <BasedOn href="/trends">Trends</BasedOn>
    return <div className="space-y-2"><Card title={`${d.metric} · ${d.start} to ${d.end}`}>
      <KeyStatRow variant="row" label="Period average" metric={metric(d.average)} unit={d.unit ?? undefined} format="decimal1" direction="none" average={d.previous.average.value} averageLabel="Previous period" caption={`${d.observedDays} of ${d.calendarDays} days measured`} />
      <Sparkline values={d.points.map((p) => p.value)} className="mt-2 h-14" />
    </Card><BasedOn href={`/trends?metric=${encodeURIComponent(d.key)}`}>{d.metric} · {d.start} to {d.end}</BasedOn></div>
  }
  if (name === "get_sleep") {
    const d = output as CoachOutputs["get_sleep"]
    const debt = d.details.find((v) => v.key === "debt")
    const time = (ms: number) => new Intl.DateTimeFormat("en", { timeZone: d.timeZone, hour: "numeric", minute: "2-digit" }).format(ms)
    return <div className="space-y-2"><Card title={`Sleep · ${d.day}`}>
      <KeyStatRow variant="row" label="Time asleep" metric={metric(d.asleepMinutes)} unit="min" format="int" direction="none" />
      {d.summary.filter((v) => v.key === "efficiency" || v.key === "consistency").map((v) => <KeyStatRow key={v.key} variant="row" label={v.label} metric={metric(v)} unit={v.unit ?? undefined} format="int" average={v.baseline} direction="up" />)}
      {debt && <KeyStatRow variant="row" label="Sleep debt" metric={metric(debt)} unit="min" format="int" direction="down" />}
      <MetricState metric={d.planner} skeleton={null} reasonSize="sm">
        {(p) => <p className="mt-2 text-[13px] leading-5 text-foreground-secondary">For {time(p.wakeAt)} wake-up, {p.plans.map((v) => `${v.label.toLowerCase()}: ${time(v.bedtimeAt)}`).join("; ")}. These are planned bedtimes.</p>}
      </MetricState>
    </Card><BasedOn href={`/sleep?d=${d.day}`}>Sleep and bedtime planner · {d.day}</BasedOn></div>
  }
  if (name === "get_activities") {
    const d = output as CoachOutputs["get_activities"]
    if (!d.workouts) return <BasedOn href="/activities">Workouts</BasedOn>
    return <div className="space-y-2"><Card title={`Workouts · ${d.start} to ${d.end}`}>
      {d.workouts.length ? d.workouts.slice(0, 5).map((v) => <KeyStatRow key={v.id} variant="row" label={v.name} metric={metric(v.strain)} format="decimal1" direction="none" caption={`${v.day} · ${v.minutes} min · Strain`} href={`/activity/${encodeURIComponent(v.id)}`} />) : <p className="text-[13px] text-muted-foreground">No workouts recorded in this period.</p>}
      {d.total > 5 && <p className="mt-2 text-[12px] text-muted-foreground">Showing 5 of {d.total} recorded workouts.</p>}
    </Card><BasedOn href="/activities">Recorded workouts · {d.start} to {d.end}</BasedOn></div>
  }
  if (name === "get_activity") {
    const d = output as CoachOutputs["get_activity"]
    const a = d.workout
    if (!a) return <p className="text-[13px] text-muted-foreground">That workout is unavailable.</p>
    return <div className="space-y-2"><Card title={`${a.name} · ${a.day}`}>
      <KeyStatRow variant="row" label="Activity strain" metric={metric(a.strain)} format="decimal1" direction="none" />
      {a.stats.slice(0, 3).map((v) => <KeyStatRow key={v.label} variant="row" label={v.label} metric={metric(v)} unit={v.unit ?? undefined} format="decimal1" average={v.baseline} direction="none" />)}
      <ZoneBars variant="rows" data={a.zones} note={a.zoneNote} />
    </Card><BasedOn href={`/activity/${encodeURIComponent(a.id)}`}>{a.name} · {a.day}</BasedOn></div>
  }
  if (name === "get_journal_impacts") {
    const d = output as CoachOutputs["get_journal_impacts"]
    return <div className="space-y-2"><Card title={`Habit associations · ${d.outcome}`}>
      <p className="text-[12px] leading-4 text-muted-foreground">Differences in next-day averages, not proof of cause.</p>
      {d.effects.slice(0, 3).map((v) => <div key={v.behaviour}>
        <KeyStatRow variant="row" label={v.behaviour} metric={metric({ value: v.delta })} unit={d.unit} format="signed1" direction="none" caption={`${v.yesDays} days with, ${v.noDays} without`} />
        {v.confidenceInterval && <p className="pb-2 text-[12px] leading-4 text-muted-foreground">90% interval: {v.confidenceInterval.map((n) => n.toFixed(1)).join(" to ")} {d.unit}{v.effect === "none" ? ". No clear association." : "."}</p>}
      </div>)}
      {!d.effects.length && <p className="mt-2 text-[13px] text-muted-foreground">Not enough check-ins to compare habits yet.</p>}
    </Card><BasedOn href="/journal/insights">Behaviour insights</BasedOn></div>
  }
  if (name === "get_health") {
    const d = output as CoachOutputs["get_health"]
    return <div className="space-y-2"><Card title={`Health Monitor · ${d.day}`}>
      {d.vitals.map((v) => <KeyStatRow key={v.vital} variant="row" label={v.vital} metric={metric(v)} unit={v.unit} format="decimal1" direction="none" caption={v.status.replaceAll("_", " ")} />)}
    </Card><BasedOn href={`/health/monitor?d=${d.day}`}>Health Monitor · {d.day}</BasedOn></div>
  }
  if (name === "get_report") {
    const d = output as CoachOutputs["get_report"]
    if (!("scores" in d) || !d.scores) return <p className="text-[13px] text-muted-foreground">No report available yet.</p>
    return <div className="space-y-2"><Card title={`Report · ${d.start} to ${d.end}${d.partial ? " · Partial" : ""}`}>
      {d.scores.map((v) => <KeyStatRow key={v.score} variant="row" label={v.score} metric={metric(v)} format="decimal1" direction="none" />)}
    </Card><BasedOn href={d.period ? `/reports/${encodeURIComponent(d.period)}` : "/reports"}>Report · {d.start} to {d.end}</BasedOn></div>
  }
  if (name === "get_profile") return <BasedOn href="/settings?s=account">Your profile</BasedOn>
  return null
}
