import Link from "next/link"
import { connection } from "next/server"
import { Activity, Check, Droplet, Heart, Rabbit, Thermometer, TriangleAlert, Turtle, Wind } from "lucide-react"
import { FEATURES } from "@/lib/features"
import { cn } from "@/lib/utils"
import { formatValue, hmm } from "@/lib/format"
import type { ChipTone } from "@/lib/bands"
import { userCtx } from "@/server/queries/common"
import { getHealthHub } from "@/server/queries/health"
import type { HealthHubVM, VitalKey } from "@/server/queries/types"
import { StressChart } from "@/components/charts/StressChart"
import { CAPTION, CARD_BUTTON, LABEL, StatusChip, Tag, ValueUnit } from "@/components/metrics/primitives"
import { TickScale } from "@/components/metrics/TickScale"
import { AgeOrb } from "@/components/metrics/AgeOrb"
import { MetricState } from "@/components/shells/MetricState"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton } from "@/components/ui/skeleton"
import { categoryTone, categoryWord, ordinal } from "./format"
import { LastReading } from "./heart-rate/LiveHeartRate"

export const metadata = { title: "Health" }

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

/** "Slower vs. last week" / "Faster vs. last week" / "No change vs. last week" (spec §6), from the week-on-week pace change. */
function paceChip(delta: number | null) {
  if (delta === null) return null
  if (Math.abs(delta) < 0.05) return { tone: "neutral" as const, dir: "flat" as const, text: "No change vs. last week" }
  return delta < 0 ? { tone: "optimal" as const, dir: "down" as const, text: "Slower vs. last week" } : { tone: "warning" as const, dir: "up" as const, text: "Faster vs. last week" }
}

/**
 * The hub's age block (health-02, health-04): the orb on the page with no card around it, then the Pace of Aging card
 * (the ruler and its week-on-week chip) ending in GO TO HEALTHSPAN. On laptop the orb sits beside the card.
 */
function AgeBlock({ m }: { m: HealthHubVM["healthspan"] }) {
  return (
    <MetricState
      metric={m}
      skeleton={skeleton}
      renderReason={() => (
        <SectionShell variant="card" level={2} title="Healthspan" href="/health/healthspan">
          <p className={EMPTY}>Healthspan needs 20 days of data.</p>
        </SectionShell>
      )}
    >
      {(v, meta) => {
        const chip = paceChip(v.paceDelta)
        return (
          <div className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-center xl:gap-4">
            <div className="flex justify-center py-2">
              <AgeOrb age={v.pulseAge} deltaYears={v.deltaYears} provisional={meta.provisional} size={260} />
            </div>
            <SectionShell
              variant="card"
              level={2}
              title="Pace of Aging"
              action={
                chip && (
                  <StatusChip tone={chip.tone} delta={chip.dir}>
                    {chip.text}
                  </StatusChip>
                )
              }
            >
              <div className="space-y-5">
                <TickScale
                  variant="marker"
                  label="Pace of Aging"
                  metric={{ value: v.pace, reason: null, provisional: meta.provisional }}
                  min={-1}
                  max={3}
                  format="decimal1"
                  unit="x"
                  describe={v.pace < 1 ? "aging slower than your 6-month average" : v.pace > 1 ? "aging faster than your 6-month average" : "aging at the normal rate"}
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
                <Link href="/health/healthspan" className={CARD_BUTTON}>
                  Go to Healthspan
                </Link>
              </div>
            </SectionShell>
          </div>
        )
      }}
    </MetricState>
  )
}

/**
 * health-01's Blood Pressure Insights (Beta), built and off (FEATURES.bloodPressure): Pulse reads no blood pressure.
 * The card says what it would show; the page renders it only when the flag is on.
 */
function BloodPressure() {
  return (
    <SectionShell variant="card" level={2} title="Blood Pressure Insights" info={false} action={<Tag kind="beta" />}>
      <p className={EMPTY}>How your blood pressure trends against your sleep, strain and recovery, from the readings your cuff shares with Google Health.</p>
    </SectionShell>
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
                status === "no_data" ? "bg-secondary text-muted-foreground" : ok ? "bg-optimal/15 text-optimal-text" : "bg-warning/15 text-warning-text"
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
              <span className={cn("grid size-5 shrink-0 place-items-center rounded-sm", all ? "bg-optimal text-background" : "bg-warning text-primary-foreground")}>
                {all ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <TriangleAlert aria-hidden className="size-3" strokeWidth={2.5} />}
              </span>
              <span className="text-[15px] leading-[22px] tabular-nums">
                {v.inRange}/{v.total} within range
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
              <p className={LABEL}>Today’s high stress</p>
              <ValueUnit value={hmm(v.highMin)} unit="hrs" className={cn(TILE, "block")} />
              {dir && (
                <StatusChip tone={tone} delta={dir}>
                  vs. typical {v.weekday}
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

function HeartRate({ hr }: { hr: HealthHubVM["heartRate"] }) {
  if (!hr) return <p className={EMPTY}>No heart-rate readings yet. They show here once your band syncs.</p>
  return (
    <div className="space-y-1">
      <ValueUnit value={String(hr.bpm)} unit="bpm" className={cn(TILE, "block")} />
      <LastReading t={hr.t} />
    </div>
  )
}

/** Health hub `/health` (spec §7.6): today's values ; each card links to its detail screen. */
export default async function HealthPage() {
  await connection()
  const vm = await getHealthHub(await userCtx())
  return (
    <PageShell title="Health">
      {/* The reference app's order (health-01, 02, 04): Stress Monitor, the age block, then Health Monitor; Pulse's
          Fitness and Heart rate follow. */}
      <HealthCards>
        <SectionShell variant="card" level={2} title="Stress Monitor" info={false} href="/health/stress" className="xl:col-span-2">
          <Stress m={vm.stress} />
        </SectionShell>
        <div className="xl:col-span-2">
          <AgeBlock m={vm.healthspan} />
        </div>
        {FEATURES.bloodPressure && <BloodPressure />}
        <SectionShell variant="card" level={2} title="Health Monitor" info={false} href="/health/monitor">
          <Monitor m={vm.monitor} />
        </SectionShell>
        <SectionShell variant="card" level={2} title="Fitness" href="/health/fitness">
          <Fitness m={vm.fitness} />
        </SectionShell>
        <SectionShell variant="card" level={2} title="Heart rate" href="/health/heart-rate">
          <HeartRate hr={vm.heartRate} />
        </SectionShell>
      </HealthCards>
      <p className={cn(CAPTION, "text-center")}>Estimates for personal insight, not medical advice.</p>
    </PageShell>
  )
}

/** One column on phone and tablet, as the reference app stacks them; two on laptop (spec §7.6 v2). */
function HealthCards({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">{children}</div>
}
