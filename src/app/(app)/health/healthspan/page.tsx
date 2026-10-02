import { redirect } from "next/navigation"
import { Rabbit, Turtle } from "lucide-react"
import { cn } from "@/lib/utils"
import { AGE_LABEL, formatValue, MISSING } from "@/lib/format"
import { parseDay, todayIn } from "@/lib/url"
import { getConfig } from "@/server/config"
import { getHealthspan } from "@/server/queries/health"
import type { HealthspanVM } from "@/server/queries/types"
import { TrendChart } from "@/components/charts/TrendChart"
import { InsightCard } from "@/components/metrics/InsightCard"
import { TickScale } from "@/components/metrics/TickScale"
import { WhoopAgeOrb } from "@/components/metrics/WhoopAgeOrb"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { SectionShell } from "@/components/shells/SectionShell"
import { ContributorCard } from "./ContributorCard"

export const metadata = { title: "Healthspan" }

const CAPTION = "text-xs leading-4 font-medium text-muted-foreground"

const INFO = {
  title: "About Healthspan",
  body: (
    <p>
      {AGE_LABEL} estimates how old your body behaves, from nine habits and vitals measured over the last 6 months. Pace of Aging compares your last 30
      days with those 6 months: 1.0x means aging at the normal rate, below 1.0x slower, above 1.0x faster. Both are estimates for personal insight, not a
      medical assessment.
    </p>
  ),
}

/** The one glow in the app (spec §2.6, docs/design/orb.md): the WHOOP Age orb. `compact`: the collapsed header's 108 px orb. */
function Orb({ vm, compact }: { vm: HealthspanVM; compact?: boolean }) {
  const r = vm.result.value
  if (compact)
    // Hangs 8 px below the stats' centre line, about 30 px past the band, as in [latest-healthspan-collapsed-2].
    return (
      <div className="translate-y-2">
        <WhoopAgeOrb compact age={r?.whoopAge ?? null} deltaYears={r?.deltaYears ?? null} reason={vm.result.reason} />
      </div>
    )
  return (
    <div className="flex flex-col items-center gap-3">
      <WhoopAgeOrb age={r?.whoopAge ?? null} deltaYears={r?.deltaYears ?? null} provisional={vm.result.provisional} reason={vm.result.reason} size={300} />
      <p className={cn(CAPTION, "text-center tabular-nums")}>
        {r ? `Your age: ${formatValue("decimal1", vm.age)}` : "Healthspan needs 20 days of data."}
      </p>
      {r && vm.result.provisional && <p className={cn(CAPTION, "text-center")}>Healthspan firms up after 20 days of data.</p>}
    </div>
  )
}

/** Healthspan `/health/healthspan?d=` (spec §7.7): the ISO week containing `d`. */
export default async function HealthspanPage({ searchParams }: PageProps<"/health/healthspan">) {
  const today = todayIn(getConfig().timeZone)
  const { d, rejected } = parseDay((await searchParams).d, today)
  if (rejected) redirect("/health/healthspan")
  const vm = getHealthspan(d)
  const r = vm.result.value
  const pace = r ? { value: r.pace, reason: null, provisional: r.paceProvisional } : { value: null, reason: vm.result.reason, provisional: false }
  const hasHistory = vm.history.some((p) => p.value !== null)
  const group = (g: "sleep" | "strain" | "fitness") => vm.contributors.filter((c) => c.group === g)
  const n = vm.nextUpdateInDays
  // Collapsed header stats ([latest-healthspan-collapsed-1..5]): years younger in green, older in amber; pace in white.
  const older = !!r && r.deltaYears > 0
  const stats = {
    left: {
      value: r ? formatValue("decimal1", Math.abs(r.deltaYears)) : MISSING,
      label: older ? "Years older" : "Years younger",
      tone: r ? (older ? "warning" : "optimal") : undefined,
    },
    right: { value: r ? `${formatValue("decimal1", r.pace)}x` : MISSING, label: "Pace of aging" },
  } as const

  return (
    <DetailShell
      title="Healthspan"
      subtitle={n > 0 ? `Next update in ${n} ${n === 1 ? "day" : "days"}` : undefined}
      dateSwitcher={{ mode: "week" }}
      info={INFO}
      hero={<Orb vm={vm} />}
      stats={stats}
      collapse
      summary={
        <SectionShell variant="card" title="Pace of Aging">
          <TickScale
            variant="marker"
            label="Pace of Aging"
            metric={pace}
            min={-1}
            max={3}
            format="decimal1"
            unit="x"
            describe={r ? (r.pace < 1 ? "aging slower than your 6-month average" : r.pace > 1 ? "aging faster than your 6-month average" : "aging at the normal rate") : undefined}
            ends={["−1.0x", "1.0x", "3.0x"]}
            leading={
              <>
                <Turtle aria-hidden strokeWidth={1.75} /> Slow
              </>
            }
            trailing={
              <>
                Fast <Rabbit aria-hidden strokeWidth={1.75} />
              </>
            }
          />
          <p className={cn(CAPTION, "mt-3")}>
            {r?.paceProvisional
              ? "Pace of Aging uses a 6-month window. It firms up as history builds."
              : "Compares your last 30 days with your 6-month WHOOP Age."}
          </p>
        </SectionShell>
      }
      insight={vm.insight && <InsightCard title={vm.insight.title} body={vm.insight.body} />}
      primary={
        <SectionShell variant="card" title={`${AGE_LABEL} history`}>
          {hasHistory ? (
            <TrendChart
              label={AGE_LABEL}
              data={{ value: vm.history.map((p) => ({ date: p.day, value: p.value })), reason: null, provisional: false }}
              format="decimal1"
              colorBy="single"
              fixedRange="6m"
              reference={{ y: vm.age, label: "Your age" }}
            />
          ) : (
            <EmptyState body="History builds one week at a time." />
          )}
        </SectionShell>
      }
      secondary={[
        <ContributorCard key="sleep" title="Sleep" items={group("sleep")} />,
        <ContributorCard key="strain" title="Strain" items={group("strain")} />,
        <ContributorCard key="fitness" title="Fitness" items={group("fitness")} />,
      ]}
    />
  )
}
