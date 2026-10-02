import Link from "next/link"
import { notFound } from "next/navigation"
import { format, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { DataColor } from "@/lib/bands"
import { formatValue, rangeLabel, type FormatKey } from "@/lib/format"
import { dayHref, todayIn } from "@/lib/url"
import { getConfig } from "@/server/config"
import { getReport } from "@/server/queries/reports"
import { latestReport } from "@/server/queries/home"
import { defaultCtx } from "@/server/queries/common"
import type { KeyStat, ReportVM } from "@/server/queries/types"
import { ZoneBars } from "@/components/charts/ZoneBars"
import { DriverList } from "@/components/metrics/DriverList"
import { InsightCard } from "@/components/metrics/InsightCard"
import { KeyStatRow } from "@/components/metrics/KeyStatRow"
import { MetricTags } from "@/components/metrics/primitives"
import { ScoreDial } from "@/components/metrics/ScoreDial"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { SectionShell } from "@/components/shells/SectionShell"

const WEEK = /^\d{4}-W\d{2}$/
const MONTH = /^\d{4}-\d{2}$/
const CAPTION = "text-xs leading-4 font-medium text-muted-foreground"
const STEP =
  "relative grid size-9 place-items-center rounded-full text-foreground transition-[background-color,scale] duration-150 ease-standard outline-none after:absolute after:-inset-1 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96] aria-disabled:pointer-events-none aria-disabled:opacity-40"
const SEGMENT =
  "inline-flex h-10 min-w-11 items-center justify-center rounded-md px-3 text-[13px] font-bold tracking-[0.06em] uppercase transition-[background-color,color] duration-150 ease-standard outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export async function generateMetadata({ params }: PageProps<"/reports/[period]">) {
  const { period } = await params
  return { title: `${WEEK.test(period) ? "Weekly" : "Monthly"} report` }
}

const FORMAT: Record<string, { format: FormatKey; unit?: string; scale?: number }> = {
  recovery: { format: "int", unit: "%" },
  strain: { format: "decimal1" },
  sleepPerf: { format: "int", unit: "%" },
  sleepHours: { format: "duration", scale: 60 },
  consistency: { format: "int", unit: "%" },
  hrv: { format: "int", unit: "ms" },
  rhr: { format: "int", unit: "bpm" },
}
const DIAL_FORMAT = { sleep: "int", recovery: "int", strain: "decimal1" } as const
const BALANCE_TONE = { balanced: "text-optimal", overreaching: "text-warning", undertrained: "text-muted-foreground" }

function periodLabel(kind: "week" | "month", start: string, end: string) {
  return kind === "week" ? rangeLabel(start, end) : format(parseISO(start), "MMMM yyyy")
}

/** Previous / next period as links; the next arrow is disabled at the latest period (spec §7.13). */
function PeriodSwitcher({ vm }: { vm: ReportVM }) {
  const unit = vm.kind
  const step = (to: string | null, dir: "prev" | "next") => {
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight
    const label = `${dir === "prev" ? "Previous" : "Next"} ${unit}`
    return to ? (
      <Link href={`/reports/${to}`} replace className={STEP} aria-label={label}>
        <Icon aria-hidden className="size-[18px]" strokeWidth={2} />
      </Link>
    ) : (
      <span role="link" aria-disabled="true" aria-label={label} className={STEP}>
        <Icon aria-hidden className="size-[18px]" strokeWidth={2} />
      </span>
    )
  }
  return (
    <div className="inline-flex h-9 items-center rounded-full bg-secondary">
      {step(vm.prev, "prev")}
      <span className="min-w-24 px-3 text-center text-[13px] leading-4 font-bold tracking-[0.1em] whitespace-nowrap uppercase tabular-nums">
        {periodLabel(vm.kind, vm.start, vm.end)}
      </span>
      {step(vm.next, "next")}
    </div>
  )
}

function KindToggle({ kind, week, month }: { kind: "week" | "month"; week: string | null; month: string | null }) {
  const item = (k: "week" | "month", label: string, to: string | null) =>
    to ? (
      <Link
        href={`/reports/${to}`}
        aria-current={kind === k ? "page" : undefined}
        className={cn(SEGMENT, kind === k ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
      >
        {label}
      </Link>
    ) : (
      <span className={cn(SEGMENT, "text-muted-foreground opacity-40")}>{label}</span>
    )
  return (
    <nav aria-label="Report period" className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {item("week", "Week", week)}
      {item("month", "Month", month)}
    </nav>
  )
}

function Dials({ vm }: { vm: ReportVM }) {
  const word = vm.kind === "week" ? "last week" : "last month"
  return (
    <div className="-mx-2 flex w-[calc(100%+1rem)] items-start justify-center">
      {vm.dials.map((dl) => {
        const f = DIAL_FORMAT[dl.key]
        const tone = dl.delta === null || dl.key === "strain" || Math.round(dl.delta * 10) === 0 ? "text-muted-foreground" : dl.delta > 0 ? "text-optimal" : "text-warning"
        return (
          <div key={dl.key} className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5">
            <ScoreDial variant={dl.key} size="md" value={dl.metric.value} reason={dl.metric.reason} label={dl.label} />
            {dl.delta !== null && (
              <p className={cn(CAPTION, "text-center tabular-nums", tone)}>
                {formatValue(f === "int" ? "signedInt" : "signed1", dl.delta)} vs. {word}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Averages({ stats, word }: { stats: KeyStat[]; word: string }) {
  return (
    <div className="divide-y divide-border">
      {stats.map((s) => {
        const f = FORMAT[s.key] ?? { format: "decimal1" as const }
        const k = f.scale ?? 1
        return (
          <KeyStatRow
            key={s.key}
            variant="row"
            label={s.label}
            metric={s.metric.value === null ? s.metric : { ...s.metric, value: s.metric.value * k }}
            unit={f.unit}
            format={f.format}
            average={s.average === null ? null : s.average * k}
            averageLabel={`${word}'s average`}
            direction={s.direction}
          />
        )
      })}
    </div>
  )
}

/** Reports `/reports/[period]` (spec §7.13, journey 8): `YYYY-Www` or `YYYY-MM`. */
export default async function ReportPage({ params }: PageProps<"/reports/[period]">) {
  const { period } = await params
  const isWeek = WEEK.test(period)
  if (!isWeek && !MONTH.test(period)) notFound()
  const today = todayIn(getConfig().timeZone)
  const vm = getReport(period)
  const title = isWeek ? "Weekly report" : "Monthly report"

  if (!vm) {
    const ctx = defaultCtx()
    const latest = latestReport(ctx, isWeek ? "week" : "month")
    return (
      <DetailShell
        title={title}
        hero={
          <EmptyState
            body={`No data for this ${isWeek ? "week" : "month"}.`}
            action={latest ? { label: `Latest ${isWeek ? "week" : "month"}`, href: `/reports/${latest.period}` } : undefined}
          />
        }
      />
    )
  }

  const word = vm.kind === "week" ? "last week" : "last month"
  return (
    <DetailShell
      title={title}
      hero={
        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-3">
            <PeriodSwitcher vm={vm} />
            <KindToggle kind={vm.kind} week={vm.latestWeek} month={vm.latestMonth} />
            {vm.partial && <MetricTags extra={[vm.kind === "week" ? "partial_week" : "partial_month"]} />}
          </div>
          <Dials vm={vm} />
        </div>
      }
      insight={vm.insight && <InsightCard body={vm.insight} />}
      primary={
        <SectionShell variant="card" title="Recovery breakdown" aside={<span className={CAPTION}>Days</span>}>
          <ZoneBars
            variant="stacked"
            unit="days"
            emptyCopy="No days with Recovery in this period."
            data={vm.bands.value ? { ...vm.bands, value: vm.bands.value.map((b) => ({ ...b, color: b.color as DataColor })) } : null}
          />
        </SectionShell>
      }
      secondary={[
        <SectionShell key="avg" variant="card" title="Averages" aside={<span className={CAPTION}>vs. {word}</span>}>
          <Averages stats={vm.averages} word={word} />
        </SectionShell>,
        <SectionShell key="balance" variant="card" title="Training balance">
          {vm.trainingBalance.value ? (
            <div className="space-y-1">
              <p className={cn("font-numeric text-xl leading-6 font-bold", BALANCE_TONE[vm.trainingBalance.value.status])}>{vm.trainingBalance.value.word}</p>
              <p className={cn(CAPTION, "tabular-nums")}>Training load (ACWR) {formatValue("decimal2", vm.trainingBalance.value.acwr)}</p>
              <p className="pt-2 text-[15px] leading-[22px] text-pretty text-foreground-secondary">{vm.trainingBalance.value.line}</p>
            </div>
          ) : (
            <EmptyState body="Not enough data for a training balance." className="py-4" />
          )}
        </SectionShell>,
        <SectionShell key="journal" variant="card" title="Top journal effects" action={{ label: "View all", href: "/journal/insights" }}>
          {vm.topImpacts.length ? (
            <DriverList variant="impact" unit="%" data={{ value: vm.topImpacts.slice(0, 3), reason: null, provisional: false }} />
          ) : (
            <EmptyState body="No journal effects yet." className="py-4" />
          )}
        </SectionShell>,
        ...(vm.bestWorst
          ? [
              <SectionShell key="best" variant="card" title="Best and worst day">
                <ul className="divide-y divide-border">
                  {vm.bestWorst.map((b) => (
                    <li key={b.label}>
                      <Link
                        href={dayHref("/", b.day, today)}
                        aria-label={`${b.label}: ${format(parseISO(b.day), "EEEE d MMMM")}, Recovery ${Math.round(b.recovery)} percent${b.strain === null ? "" : `, strain ${formatValue("decimal1", b.strain)}`}`}
                        className="-mx-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-2 transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
                      >
                        <span aria-hidden className="min-w-0 flex-1">
                          <span className="block text-xs leading-4 font-bold tracking-[0.08em] uppercase">{b.label}</span>
                          <span className={cn(CAPTION, "mt-1 block tabular-nums")}>{format(parseISO(b.day), "EEE, MMM d")}</span>
                        </span>
                        <span aria-hidden className="flex items-center gap-4">
                          <ScoreDial variant="recovery" size="sm" value={b.recovery} />
                          <span className="w-12 text-right">
                            <span className="block font-numeric text-xl leading-6 font-bold text-strain-text tabular-nums">{formatValue("decimal1", b.strain)}</span>
                            <span className={CAPTION}>Strain</span>
                          </span>
                        </span>
                        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionShell>,
            ]
          : []),
      ]}
    />
  )
}
