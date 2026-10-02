import { Progress } from "@/components/ui/progress"
import { getJournalInsights } from "@/server/queries/journal"
import type { ImpactMetricKey } from "@/server/queries/types"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { ImpactList, MetricToggle } from "./Impacts"

export const metadata = { title: "Journal insights" }

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
              <SectionShell key="more" variant="card" title="Needs more data">
                <ul className="divide-y divide-border">
                  {vm.needsMore.map((n) => (
                    <li key={n.key} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="truncate text-xs leading-4 font-bold tracking-[0.08em] uppercase">{n.label}</p>
                        <p className="text-xs leading-4 font-medium text-muted-foreground tabular-nums">
                          {n.yes} of 5 days with, {n.no} of 5 without
                        </p>
                      </div>
                      <Progress
                        value={(Math.min(5, n.yes, n.no) / 5) * 100}
                        aria-label={`${n.label}: ${Math.min(5, n.yes, n.no)} of 5 days needed`}
                        className="h-1.5 w-24 shrink-0 bg-muted"
                      />
                    </li>
                  ))}
                </ul>
              </SectionShell>,
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
