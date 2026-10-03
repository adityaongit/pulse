import { connection } from "next/server"
import { format, parseISO } from "date-fns"
import { formatValue, rangeLabel } from "@/lib/format"
import { getReportArchive, type ReportListItem } from "@/server/queries/reports"
import { MiniRing } from "@/components/metrics/MiniRing"
import { DetailShell } from "@/components/shells/DetailShell"
import { EmptyState } from "@/components/shells/EmptyState"
import { LinkList, LIST_GRID } from "@/components/shells/LinkList"

export const metadata = { title: "Reports" }

/** The period's average Recovery as WHOOP's 22 px ring and its value. */
function Aside({ r }: { r: ReportListItem }) {
  return (
    <span className="flex shrink-0 items-center gap-2">
      <MiniRing variant="recovery" value={r.recovery} />
      <span className="w-[4ch] text-right font-numeric text-[15px] leading-5 font-bold tabular-nums">
        <span className="sr-only">, average Recovery </span>
        {formatValue("int", r.recovery)}
        {r.recovery !== null && "%"}
      </span>
    </span>
  )
}

/** Reports archive `/reports` (More, U21): every week and month with data, newest first, each opening its report. */
export default async function ReportsPage() {
  await connection()
  const vm = getReportArchive()
  const empty = !vm.weeks.length && !vm.months.length
  return (
    <DetailShell
      title="Reports"
      primary={
        empty ? (
          <EmptyState body="No reports yet. Your first weekly report appears once a week has data." />
        ) : (
          <div className={LIST_GRID}>
            {vm.weeks.length > 0 && (
              <LinkList
                title="Weeks"
                rows={vm.weeks.map((r) => ({ label: rangeLabel(r.start, r.end), href: `/reports/${r.period}`, aside: <Aside r={r} />, description: r.partial ? "Partial week" : undefined }))}
              />
            )}
            {vm.months.length > 0 && (
              <LinkList
                title="Months"
                rows={vm.months.map((r) => ({ label: format(parseISO(r.start), "MMMM yyyy"), href: `/reports/${r.period}`, aside: <Aside r={r} />, description: r.partial ? "Partial month" : undefined }))}
              />
            )}
          </div>
        )
      }
    />
  )
}
