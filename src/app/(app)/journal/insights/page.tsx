import { cn } from "@/lib/utils"
import { CARD_MATERIAL } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { getJournalInsights } from "@/server/queries/journal"
import type { ImpactMetricKey } from "@/server/queries/types"
import { DetailShell } from "@/components/shells/DetailShell"
import { ImpactList, MetricToggle } from "./Impacts"

export const metadata = { title: "Behaviour insights" }

const WORD: Record<ImpactMetricKey, string> = { recovery: "Recovery", hrv: "HRV", sleep: "sleep performance" }
const parseMetric = (raw: string | string[] | undefined): ImpactMetricKey => {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === "hrv" || v === "sleep" ? v : "recovery"
}

/** Journal Insights `/journal/insights?m=` (spec §7.12, journey 7). */
export default async function JournalInsightsPage({ searchParams }: PageProps<"/journal/insights">) {
  const metric = parseMetric((await searchParams).m)
  const vm = getJournalInsights(metric)

  return (
    <DetailShell
      title="Behaviour insights"
      hero={
        // Top-aligned beside the list on laptop (spec §7.12 wireframe), and no wider than the hero column.
        <div data-hero-align="start" className="w-full space-y-4 xl:w-[360px]">
          <div className="space-y-2">
            <h2 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-balance xl:text-2xl">Recovery impact analysis</h2>
            <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              How each behaviour changed your next-day {WORD[metric]} over the last 90 days. Tap a behaviour for details.
            </p>
            <p className="text-xs leading-4 font-medium text-muted-foreground">Updated daily</p>
          </div>
          <MetricToggle metric={metric} />
        </div>
      }
      summary={<ImpactList vm={vm} />}
      secondary={
        vm.needsMore.length
          ? [
              // WHOOP's "Keep logging to unlock" group [latest-journal-insights-1]: one card row per behaviour.
              <section key="more" aria-labelledby="unlock-title" className="space-y-3">
                <div className="space-y-1">
                  <h2 id="unlock-title" className="text-[13px] leading-4 font-bold tracking-[0.08em] uppercase">
                    Keep logging to unlock
                  </h2>
                  <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-muted-foreground">
                    Log a behaviour as Yes on at least 5 days and No on at least 5 to see how it changes your next-day {WORD[metric]}.
                  </p>
                </div>
                <ul className="space-y-2">
                  {vm.needsMore.map((n) => {
                    const have = Math.min(5, n.yes) + Math.min(5, n.no)
                    return (
                      <li key={n.key} className={cn(CARD_MATERIAL, "space-y-2.5 p-4")}>
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="min-w-0 truncate text-xs leading-4 font-bold tracking-[0.08em] uppercase">{n.label}</p>
                          <p className="shrink-0 font-numeric text-[13px] leading-4 font-semibold text-foreground-secondary tabular-nums">{have}/10</p>
                        </div>
                        <Progress value={(have / 10) * 100} aria-label={`${n.label}: ${have} of 10 days logged`} className="h-1.5 bg-muted" />
                        <p className="text-xs leading-4 font-medium text-muted-foreground tabular-nums">
                          {Math.min(5, n.yes)} of 5 days with, {Math.min(5, n.no)} of 5 without
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </section>,
            ]
          : undefined
      }
      footer={
        <p className="text-xs leading-4 font-medium text-pretty text-muted-foreground">
          Effects are differences in averages, not proof of cause. Change one habit at a time to see what it really does.
        </p>
      }
    />
  )
}
