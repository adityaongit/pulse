import { CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { reasonCopy } from "@/lib/reasons"
import { dayHref, metricHref } from "@/lib/url"
import { getMonitor } from "@/server/queries/health"
import type { MonitorVM } from "@/server/queries/types"
import { StatusChip } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { Card } from "@/components/ui/card"
import { HeartRhythm } from "./HeartRhythm"
import { VitalTiles } from "./VitalTiles"
import { pageDay, type SearchParams } from "../../_lib/day"
import { LEGEND, STAT_ICON } from "../../_lib/view"

export const metadata = { title: "Health Monitor" }

const INFO = {
  title: "About Health Monitor",
  body: (
    <p>
      Health Monitor compares last night’s vitals with your personal normal range: Google’s own range where it gives one, else your baseline plus or minus two standard deviations. Blood
      oxygen also flags anything below 95%. A change in several vitals at once can be an early sign of illness. Pulse is not a medical device; if you
      feel unwell, talk to a doctor.
    </p>
  ),
}

const CHIP = {
  within: { tone: "optimal", text: () => "Within range" },
  out: { tone: "warning", text: () => "Out of range" },
  illness: { tone: "alert", text: () => "Out of range" },
} as const

function Measurements({ rows, at }: { rows: MonitorVM["measurements"]; at: (href: string) => string }) {
  return (
    <Card className="gap-0 px-4 py-1 ring-0">
      <div className="divide-y divide-border">
        {rows.map((m) => (
          <KeyStatRow
            key={m.key}
            variant="row"
            icon={STAT_ICON[m.key]}
            label={m.label}
            caption={m.caption}
            metric={m.metric}
            unit={m.unit}
            format={m.format}
            average={m.average}
            averageLabel="prior 30-day average"
            sd={m.sd}
            direction="neutral"
            href={at(metricHref(m.key))}
          />
        ))}
      </div>
      <p className={LEGEND}>Latest reading vs. the 30 days before it</p>
    </Card>
  )
}

function Count({ count }: { count: MonitorVM["count"] }) {
  const v = count.value
  const reason = v ? null : reasonCopy(count.reason)
  const chip = v ? CHIP[v.status] : null
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      {/* aria-label on a <p> (generic role) is ignored by many screen readers: the sentence is sr-only text instead. */}
      <p className="sr-only">{v ? `${v.inRange} of ${v.total} metrics within range` : `Metrics within range unavailable: ${reason!.long}`}</p>
      <p
        aria-hidden
        className={cn("font-numeric text-[64px] leading-none font-bold tracking-[-0.01em] tabular-nums md:text-[72px]", !v && "text-muted-foreground")}
      >
        {v ? v.inRange : "--"}
        <span className="text-[0.55em] text-foreground-secondary">/{v?.total ?? 5}</span>
      </p>
      <p aria-hidden className="text-xs leading-4 font-bold tracking-[0.1em] uppercase">
        Metrics within range
      </p>
      {chip && <StatusChip tone={chip.tone}>{chip.text()}</StatusChip>}
      {reason && <p className="max-w-[36ch] text-xs leading-4 font-medium text-muted-foreground">{reason.long}</p>}
    </div>
  )
}

export default async function MonitorPage({ searchParams }: PageProps<"/health/monitor">) {
  const { d, today, ctx } = await pageDay(searchParams as SearchParams, "/health/monitor")
  const vm = await getMonitor(d, ctx)

  return (
    <DetailShell
      title="Health Monitor"
      dateSwitcher={{ mode: "day" }}
      info={INFO}
      hero={<Count count={vm.count} />}
      summary={
        vm.illness && (
          <Alert role="alert" className="rounded-2xl border-0 bg-linear-to-b from-card-top to-card px-4 py-3 shadow-card ring-1 ring-recovery-red/60 *:[svg]:size-5! *:[svg]:translate-y-px">
            <CircleAlert aria-hidden className="text-recovery-red-text" strokeWidth={1.75} />
            <AlertTitle className="text-base leading-[22px] font-semibold">Possible illness signal</AlertTitle>
            <AlertDescription className="text-[15px] leading-[22px] text-pretty text-foreground-secondary">
              Several vitals moved away from your normal range together, a pattern that often comes before feeling unwell. Consider an easier day and
              extra sleep.
            </AlertDescription>
          </Alert>
        )
      }
      primary={
        <SectionShell variant="section" title="Last night’s readings">
          <VitalTiles vitals={vm.vitals} day={d} today={today} />
        </SectionShell>
      }
      footer={
        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-2 xl:gap-6">
          <SectionShell variant="section" title="Heart rhythm">
            <HeartRhythm rhythm={vm.heartRhythm} />
          </SectionShell>
          <SectionShell variant="section" title="Measurements">
            <Measurements rows={vm.measurements} at={(href) => dayHref(href, d, today)} />
          </SectionShell>
        </div>
      }
    />
  )
}
