import Link from "next/link"
import { connection } from "next/server"
import { format, parseISO } from "date-fns"
import { CalendarDays, CalendarRange, ChevronRight, FlaskConical, Plug, Settings, type LucideIcon } from "lucide-react"
import { rangeLabel } from "@/lib/format"
import { getMore } from "@/server/queries/settings"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Card } from "@/components/ui/card"

export const metadata = { title: "More" }

type Row = { icon: LucideIcon; label: string; caption?: string; href: string }

function Rows({ rows }: { rows: Row[] }) {
  return (
    <Card className="gap-0 px-4 py-1 ring-0">
      <ul className="divide-y divide-border">
        {rows.map(({ icon: Icon, label, caption, href }) => (
          <li key={label}>
            <Link
              href={href}
              className="-mx-2 flex min-h-13 items-center gap-3 rounded-lg px-2 transition-[background-color] duration-150 ease-standard outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
            >
              <Icon aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-[15px] leading-[22px]">{label}</span>
              {caption && <span className="shrink-0 text-xs leading-4 font-medium text-muted-foreground tabular-nums">{caption}</span>}
              <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** More `/more` (spec §7.14): reports and app settings. */
export default async function MorePage() {
  await connection()
  const vm = getMore()
  const reports: Row[] = [
    ...(vm.latestWeek
      ? [{ icon: CalendarRange, label: "Weekly report", caption: rangeLabel(vm.latestWeek.start, vm.latestWeek.end), href: `/reports/${vm.latestWeek.period}` }]
      : []),
    ...(vm.latestMonth
      ? [{ icon: CalendarDays, label: "Monthly report", caption: format(parseISO(vm.latestMonth.start), "MMMM"), href: `/reports/${vm.latestMonth.period}` }]
      : []),
  ]
  const demo = vm.mode === "demo"

  return (
    <PageShell title="More">
      <div className="flex flex-col gap-8 xl:max-w-[720px] xl:gap-10">
        {reports.length > 0 && (
          <SectionShell variant="section" title="Reports">
            <Rows rows={reports} />
          </SectionShell>
        )}
        <SectionShell variant="section" title="App">
          <Rows
            rows={[
              { icon: Settings, label: "Settings", href: "/settings" },
              { icon: demo ? FlaskConical : Plug, label: "Data source", caption: demo ? "Demo data" : "Google Health", href: "/settings#source" },
            ]}
          />
        </SectionShell>
        <p className="text-center text-xs leading-4 font-medium text-muted-foreground tabular-nums">
          Pulse {vm.version} · scoring v{vm.scoringVersion}
        </p>
      </div>
    </PageShell>
  )
}
