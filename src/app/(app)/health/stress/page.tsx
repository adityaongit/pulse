import { redirect } from "next/navigation"
import { cn } from "@/lib/utils"
import { clock, dayLabel, durationWords } from "@/lib/format"
import { parseDay, todayIn } from "@/lib/url"
import { getConfig } from "@/server/config"
import { getStress } from "@/server/queries/health"
import type { StressVM } from "@/server/queries/types"
import { StressChart } from "@/components/charts/StressChart"
import { TrendChart } from "@/components/charts/TrendChart"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { InsightCard } from "@/components/metrics/InsightCard"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { MetricState } from "@/components/shells/MetricState"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton } from "@/components/ui/skeleton"

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

function typicalLine(l: NonNullable<StressVM["levels"]["value"]>) {
  if (l.typicalDeltaMin === null) return null
  const m = Math.round(l.typicalDeltaMin)
  const delta = Math.abs(m) < 1 ? "about the same high stress" : `${durationWords(Math.abs(m))} ${m > 0 ? "more" : "less"} high stress`
  return `vs. your typical ${l.weekday}: ${delta}`
}

/** Stress Monitor `/health/stress?d=` (spec §7.9). */
export default async function StressPage({ searchParams }: PageProps<"/health/stress">) {
  const { timeZone } = getConfig()
  const today = todayIn(timeZone)
  const { d, rejected } = parseDay((await searchParams).d, today)
  if (rejected) redirect("/health/stress")
  const vm = getStress(d)
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
        <SectionShell variant="card" title={vm.isToday ? "Today" : dayLabel(d, today)}>
          <StressChart
            variant="full"
            data={
              vm.chart.value
                ? {
                    ...vm.chart,
                    value: {
                      points: vm.chart.value.points.map((p) => ({ t: p.t, value: p.v })),
                      spans: vm.chart.value.spans.map((s) => ({ ...s, kind: s.kind === "nap" ? "sleep" : s.kind })),
                      now: vm.chart.value.now ?? undefined,
                    },
                  }
                : { ...vm.chart, value: null }
            }
          />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="levels" variant="card" title="Time in each level">
          <MetricState metric={vm.levels} skeleton={<Skeleton className="h-24 w-full" />} renderReason={() => <EmptyState body={EMPTY} />}>
            {(l) => (
              <>
                <ZoneBars
                  variant="stacked"
                  unit="minutes"
                  emptyCopy={EMPTY}
                  data={{
                    value: [
                      { key: "low", label: "Low (0.0-0.9)", count: l.lowMin, color: "stress-low" },
                      { key: "medium", label: "Medium (1.0-1.9)", count: l.mediumMin, color: "stress-medium" },
                      { key: "high", label: "High (2.0-3.0)", count: l.highMin, color: "stress-high" },
                    ],
                    reason: null,
                    provisional: vm.levels.provisional,
                  }}
                />
                {typicalLine(l) && <p className="mt-3 text-xs leading-4 font-medium text-muted-foreground">{typicalLine(l)}</p>}
              </>
            )}
          </MetricState>
        </SectionShell>,
        <SectionShell key="trend" variant="card" title="30-day trend">
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
