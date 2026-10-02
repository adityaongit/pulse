import { connection } from "next/server"
import { Activity, Check, Droplet, Heart, Thermometer, TriangleAlert, Wind } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatValue, hmm } from "@/lib/format"
import type { ChipTone } from "@/lib/bands"
import { getHealthHub } from "@/server/queries/health"
import type { HealthHubVM, VitalKey } from "@/server/queries/types"
import { StressChart } from "@/components/charts/StressChart"
import { StatusChip, ValueUnit } from "@/components/metrics/primitives"
import { WhoopAgeOrb } from "@/components/metrics/WhoopAgeOrb"
import { MetricState } from "@/components/shells/MetricState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton } from "@/components/ui/skeleton"
import { categoryTone, categoryWord, ordinal } from "./format"

export const metadata = { title: "Health" }

const LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase"
const CAPTION = "text-xs leading-4 font-medium text-muted-foreground"
const TILE = "font-numeric text-4xl leading-10 font-bold tracking-[-0.01em]"
const EMPTY = "text-[15px] leading-[22px] text-pretty text-foreground-secondary"

const VITAL_ICON: Record<VitalKey, typeof Wind> = { resp: Wind, spo2: Droplet, restingHr: Heart, hrv: Activity, skinTempDev: Thermometer }
const VITAL_ORDER: { key: VitalKey; short: string }[] = [
  { key: "resp", short: "Resp" },
  { key: "spo2", short: "SpO2" },
  { key: "restingHr", short: "RHR" },
  { key: "hrv", short: "HRV" },
  { key: "skinTempDev", short: "Temp" },
]
const ACWR_WORD: Record<ChipTone, string> = { optimal: "Optimal", warning: "Pushing", alert: "High risk", neutral: "Detraining" }

const skeleton = <Skeleton className="h-16 w-full" />

function Healthspan({ m }: { m: HealthHubVM["healthspan"] }) {
  return (
    <MetricState metric={m} skeleton={skeleton} renderReason={() => <p className={EMPTY}>Healthspan needs 20 days of data.</p>}>
      {(v, meta) => (
        <div className="flex flex-col items-center gap-4">
          <WhoopAgeOrb age={v.whoopAge} deltaYears={v.deltaYears} provisional={meta.provisional} size={200} />
          <div className="flex w-full items-end justify-between gap-4">
            <div>
              <p className={LABEL}>Pace of Aging</p>
              <ValueUnit value={formatValue("decimal1", v.pace)} unit="x" className="mt-1 block font-numeric text-xl leading-6 font-bold" />
            </div>
            <p className={CAPTION}>Updated weekly</p>
          </div>
        </div>
      )}
    </MetricState>
  )
}

function Monitor({ m }: { m: HealthHubVM["monitor"] }) {
  const readings = (v?: NonNullable<HealthHubVM["monitor"]["value"]>) => (
    <ul className="grid grid-cols-5 divide-x divide-border">
      {VITAL_ORDER.map(({ key, short }) => {
        const Icon = VITAL_ICON[key]
        const status = v?.vitals.find((x) => x.key === key)?.status ?? "no_data"
        const ok = status === "in_range"
        const label = `${short}: ${status === "no_data" ? "no reading" : ok ? "within range" : "out of range"}`
        return (
          <li key={key} className="flex min-w-0 flex-col items-center gap-2 px-1">
            <span className="sr-only">{label}</span>
            <Icon aria-hidden className="size-6 text-muted-foreground" strokeWidth={1.75} />
            <span aria-hidden className={cn(LABEL, "truncate")}>
              {short}
            </span>
            <span
              aria-hidden
              className={cn(
                "grid size-5 place-items-center rounded-sm",
                status === "no_data" ? "bg-secondary text-muted-foreground" : ok ? "bg-optimal/15 text-optimal" : "bg-warning/15 text-warning"
              )}
            >
              {status === "no_data" ? (
                <span className="font-numeric text-[10px] font-bold">--</span>
              ) : ok ? (
                <Check className="size-3.5" strokeWidth={2.5} />
              ) : (
                <TriangleAlert className="size-3" strokeWidth={2.5} />
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
  return (
    <MetricState
      metric={m}
      skeleton={skeleton}
      renderReason={() => (
        <div className="space-y-3">
          {readings()}
          <p className={EMPTY}>No readings from last night</p>
        </div>
      )}
    >
      {(v) => {
        const all = v.inRange === v.total
        return (
          <div className="space-y-4">
            {readings(v)}
            <div className="flex items-center gap-3 rounded-lg bg-inset px-3 py-2.5">
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-sm", all ? "bg-optimal text-primary-foreground" : "bg-warning text-primary-foreground")}>
                {all ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <TriangleAlert aria-hidden className="size-3" strokeWidth={2.5} />}
              </span>
              <span className="text-[15px] leading-[22px] tabular-nums">
                {v.inRange}/{v.total} metrics within range
              </span>
            </div>
          </div>
        )
      }}
    </MetricState>
  )
}

function Stress({ m }: { m: HealthHubVM["stress"] }) {
  return (
    <MetricState metric={m} skeleton={skeleton} renderReason={() => <p className={EMPTY}>No still minutes yet today</p>}>
      {(v, meta) => {
        const typical = v.typicalHighMin
        const dir = typical === null ? null : v.highMin < typical - 1 ? "down" : v.highMin > typical + 1 ? "up" : "flat"
        const tone: ChipTone = dir === "down" ? "optimal" : dir === "up" ? "warning" : "neutral"
        const spark = { value: { points: v.spark.map((p) => ({ t: p.t, value: p.v })) }, reason: null, provisional: meta.provisional }
        return (
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4">
            <div className="space-y-2">
              <p className={LABEL}>Today&apos;s high stress</p>
              <ValueUnit value={hmm(v.highMin)} unit="hrs" className={cn(TILE, "block")} />
              {dir && (
                <StatusChip tone={tone} delta={dir}>
                  vs. typical {v.weekday.slice(0, 3)}
                </StatusChip>
              )}
            </div>
            <StressChart variant="spark" data={spark} />
          </div>
        )
      }}
    </MetricState>
  )
}

function Fitness({ m }: { m: HealthHubVM["fitness"] }) {
  return (
    <MetricState
      metric={m}
      skeleton={skeleton}
      renderReason={() => <p className={EMPTY}>No VO2 max yet. Fitbit estimates it from runs and resting heart rate.</p>}
    >
      {(v) => (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <ValueUnit value={formatValue("decimal1", v.vo2max)} unit="ml/kg/min" className={cn(TILE, "block")} />
            <p className={cn(LABEL, categoryTone(v.category))}>{categoryWord(v.category)}</p>
            <p className={CAPTION}>{ordinal(v.percentile)} percentile for your age</p>
          </div>
          {v.acwr !== null && v.acwrTone && (
            <div className="flex shrink-0 flex-col items-end gap-1">
              <p className={LABEL}>Training load</p>
              <span className="font-numeric text-xl leading-6 font-bold tabular-nums">{formatValue("decimal2", v.acwr)}</span>
              <StatusChip tone={v.acwrTone}>{ACWR_WORD[v.acwrTone]}</StatusChip>
            </div>
          )}
        </div>
      )}
    </MetricState>
  )
}

/** Health hub `/health` (spec §7.6): today's values, each card links to its detail screen. */
export default async function HealthPage() {
  await connection()
  const vm = getHealthHub()
  return (
    <PageShell title="Health" layout="grid-2">
      <SectionShell variant="card" level={2} title="Healthspan" href="/health/healthspan">
        <Healthspan m={vm.healthspan} />
      </SectionShell>
      <SectionShell variant="card" level={2} title="Health Monitor" href="/health/monitor">
        <Monitor m={vm.monitor} />
      </SectionShell>
      <SectionShell variant="card" level={2} title="Stress Monitor" href="/health/stress">
        <Stress m={vm.stress} />
      </SectionShell>
      <SectionShell variant="card" level={2} title="Fitness" href="/health/fitness">
        <Fitness m={vm.fitness} />
      </SectionShell>
      <p className={cn(CAPTION, "pt-3 text-center md:col-span-2")}>Estimates for personal insight, not medical advice.</p>
    </PageShell>
  )
}
