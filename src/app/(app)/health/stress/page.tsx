import { cn } from "@/lib/utils"
import { clock, dayLabel, durationWords, hmm } from "@/lib/format"
import { getStress } from "@/server/queries/health"
import type { StressVM } from "@/server/queries/types"
import { StressChart } from "@/components/charts/StressChart"
import { TrendChart } from "@/components/charts/TrendChart"
import { InsightCard } from "@/components/metrics/InsightCard"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { SectionShell } from "@/components/shells/SectionShell"
import { stressSeries } from "../../_lib/view"
import { Skeleton } from "@/components/ui/skeleton"
import { pageDay, type SearchParams } from "../../_lib/day"

export const metadata = { title: "Stress Monitor" }

const EMPTY = "No still minutes to score yet today."
const LEVELS = [
  { swatch: "bg-stress-low", text: "Low, 0.0 - 0.9: you might be feeling calm, relaxed or sleepy." },
  { swatch: "bg-stress-medium", text: "Medium, 1.0 - 1.9: neutral, alert or mildly activated." },
  { swatch: "bg-stress-high", text: "High, 2.0 - 3.0: excited, stressed or highly activated." },
]

const INFO = {
  title: "About Stress Monitor",
  body: (
    <>
      <p>Stress Monitor scores how activated your body is, from 0 to 3, by comparing your heart rate with your daytime resting baseline.</p>
      <ul className="space-y-2">
        {LEVELS.map((l) => (
          <li key={l.swatch} className="flex items-start gap-3">
            <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-sm", l.swatch)} />
            {l.text}
          </li>
        ))}
      </ul>
      <p>Pulse only scores still minutes. Movement, workouts and sleep are left out, so a walk never counts as stress.</p>
    </>
  ),
}

const LEVEL_KEYS = [
  { key: "lowMin", word: "Low", bar: "bg-stress-low", text: "text-stress-low" },
  { key: "mediumMin", word: "Medium", bar: "bg-stress-medium", text: "text-stress-medium" },
  { key: "highMin", word: "High", bar: "bg-stress-high", text: "text-stress-high" },
] as const

function LevelBar({ m, className }: { m: { lowMin: number; mediumMin: number; highMin: number }; className: string }) {
  return (
    <div aria-hidden className={cn("flex gap-0.5 overflow-hidden rounded-sm", className)}>
      {LEVEL_KEYS.map((k) => m[k.key] > 0 && <span key={k.key} className={k.bar} style={{ flexGrow: m[k.key] }} />)}
    </div>
  )
}

function TotalDay({ l, day }: { l: NonNullable<StressVM["levels"]["value"]>; day: string }) {
  const total = l.lowMin + l.mediumMin + l.highMin
  if (!total) return <EmptyState body={EMPTY} />
  return (
    <div className="space-y-4">
      <p className="text-xs leading-4 font-bold tracking-[0.1em] uppercase">
        {day} stress{l.typical && <span className="text-muted-foreground"> vs. typical {l.weekday}</span>}
      </p>
      <div className="space-y-1.5">
        <LevelBar m={l} className="h-3" />
        {l.typical && <LevelBar m={l.typical} className="h-2 opacity-50" />}
      </div>
      <ul className="grid grid-cols-3 gap-3">
        {LEVEL_KEYS.map((k) => (
          <li key={k.key} aria-label={`${k.word}: ${durationWords(Math.round(l[k.key]))}${l.typical ? `, typical ${durationWords(Math.round(l.typical[k.key]))}` : ""}`}>
            <p aria-hidden className={cn("font-numeric text-xl leading-6 font-bold tabular-nums", k.text)}>
              {hmm(l[k.key])}
            </p>
            <p aria-hidden className="mt-1 text-xs leading-4 font-bold tracking-[0.1em] uppercase">
              {k.word}
            </p>
            {l.typical && (
              <p aria-hidden className="mt-0.5 font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">
                {hmm(l.typical[k.key])} typical
              </p>
            )}
          </li>
        ))}
      </ul>
      {typicalLine(l) && <p className="text-xs leading-4 font-medium text-muted-foreground">{typicalLine(l)}</p>}
    </div>
  )
}

function typicalLine(l: NonNullable<StressVM["levels"]["value"]>) {
  if (l.typicalDeltaMin === null) return null
  const m = Math.round(l.typicalDeltaMin)
  const delta = Math.abs(m) < 1 ? "about the same high stress" : `${durationWords(Math.abs(m))} ${m > 0 ? "more" : "less"} high stress`
  return `vs. your typical ${l.weekday}: ${delta}`
}

export default async function StressPage({ searchParams }: PageProps<"/health/stress">) {
  const { d, today, timeZone, ctx } = await pageDay(searchParams as SearchParams, "/health/stress")
  const vm = await getStress(d, ctx)
  const g = vm.gauge

  return (
    <DetailShell
      title="Stress Monitor"
      dateSwitcher={{ mode: "day" }}
      info={INFO}
      hero={
        <div className="flex flex-col items-center gap-2">
        <ScoreDial
          variant="gauge"
          size="lg"
          value={g.value?.value ?? null}
          reason={g.reason}
          provisional={g.provisional}
          caption={g.value ? (g.value.dayAverage || !vm.isToday ? "Day average" : g.value.at ? `Last updated ${clock(g.value.at, timeZone)}` : undefined) : undefined}
        />
        {g.reason === "no_data" && <p className="max-w-[36ch] text-center text-xs leading-4 font-medium text-muted-foreground">{EMPTY}</p>}
        </div>
      }
      insight={vm.insight && <InsightCard body={vm.insight} />}
      primary={
        <SectionShell variant="card" title={vm.isToday ? "Today" : dayLabel(d, today)} info={{ title: "Stress throughout the day", body: "Body activation during still minutes, from 0 to 3. Movement, workouts and sleep appear as excluded periods rather than stress scores." }}>
          <StressChart variant="full" data={stressSeries(vm.chart)} />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="levels" variant="card" title="Total day" info={{ title: "Time at each stress level", body: "Scored still minutes split into low, medium and high activation. When available, the faded bar compares the same weekday in your recent history." }}>
          <MetricState metric={vm.levels} skeleton={<Skeleton className="h-24 w-full" />} renderReason={() => <EmptyState body={EMPTY} />}>
            {(l) => <TotalDay l={l} day={vm.isToday ? "Today" : dayLabel(d, today)} />}
          </MetricState>
        </SectionShell>,
        <SectionShell key="trend" variant="card" title="30-day trend" info={{ title: "Daily stress trend", body: "Average activation across each day's scored still minutes over the last 30 days. Days without enough data remain gaps." }}>
          <TrendChart
            label="Stress"
            data={{ value: vm.trend.points.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
            format="decimal1"
            colorBy="stress"
            direction="down"
            fixedRange="m"
          />
        </SectionShell>,
      ]}
    />
  )
}
