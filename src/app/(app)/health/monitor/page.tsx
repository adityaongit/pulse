import { redirect } from "next/navigation"
import { CircleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { parseDay, todayIn } from "@/lib/url"
import { reasonCopy } from "@/lib/reasons"
import { getConfig } from "@/server/config"
import { getMonitor } from "@/server/queries/health"
import type { MonitorVM } from "@/server/queries/types"
import { StatusChip } from "@/components/metrics/primitives"
import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { VitalTiles } from "./VitalTiles"

export const metadata = { title: "Health Monitor" }

const INFO = {
  title: "About Health Monitor",
  body: (
    <p>
      Health Monitor compares last night&apos;s vitals with your personal normal range: your baseline plus or minus two standard deviations. Blood
      oxygen also flags anything below 95%. A change in several vitals at once can be an early sign of illness. Pulse is not a medical device; if you
      feel unwell, talk to a doctor.
    </p>
  ),
}

const CHIP = {
  within: { tone: "optimal", text: () => "Within range" },
  out: { tone: "warning", text: (n: number) => `${n} out of range` },
  illness: { tone: "alert", text: () => "Possible illness signal" },
} as const

function Count({ count }: { count: MonitorVM["count"] }) {
  const v = count.value
  const reason = v ? null : reasonCopy(count.reason)
  const chip = v ? CHIP[v.status] : null
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <p
        aria-label={v ? `${v.inRange} of ${v.total} metrics within range` : `Metrics within range unavailable: ${reason!.long}`}
        className={cn("font-numeric text-[64px] leading-none font-bold tracking-[-0.01em] tabular-nums md:text-[72px]", !v && "text-muted-foreground")}
      >
        {v ? v.inRange : "--"}
        <span className="text-[0.55em] text-foreground-secondary">/{v?.total ?? 5}</span>
      </p>
      <p aria-hidden className="text-xs leading-4 font-bold tracking-[0.08em] uppercase">
        Metrics within range
      </p>
      {chip && <StatusChip tone={chip.tone}>{chip.text(v!.outOfRange)}</StatusChip>}
      {reason && <p className="max-w-[36ch] text-xs leading-4 font-medium text-muted-foreground">{reason.long}</p>}
    </div>
  )
}

/** Health Monitor `/health/monitor?d=` (spec §7.8). */
export default async function MonitorPage({ searchParams }: PageProps<"/health/monitor">) {
  const today = todayIn(getConfig().timeZone)
  const { d, rejected } = parseDay((await searchParams).d, today)
  if (rejected) redirect("/health/monitor")
  const vm = getMonitor(d)

  return (
    <DetailShell
      title="Health Monitor"
      dateSwitcher={{ mode: "day" }}
      info={INFO}
      hero={<Count count={vm.count} />}
      summary={
        vm.illness && (
          <Alert role="alert" className="rounded-2xl border-0 bg-linear-to-b from-card-top to-card px-4 py-3 shadow-card ring-1 ring-recovery-red/60 *:[svg]:size-5 *:[svg]:translate-y-px">
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
        <SectionShell variant="section" title="Last night's readings">
          <VitalTiles vitals={vm.vitals} />
        </SectionShell>
      }
    />
  )
}
