import Link from "next/link"
import { connection } from "next/server"
import { format, parseISO } from "date-fns"
import { CalendarDays, CalendarRange, ChevronRight, FlaskConical, Plug, Settings, type LucideIcon } from "lucide-react"
import { rangeLabel } from "@/lib/format"
import { getMore } from "@/server/queries/settings"
import { PageShell } from "@/components/shells/PageShell"
import { CARD_LINK } from "@/components/shells/SectionShell"
import { cn } from "@/lib/utils"

export const metadata = { title: "More" }

type Row = { icon: LucideIcon; label: string; caption?: string; href: string }

/** WHOOP's settings rows [latest-more-1], [latest-settings-1]: one 56 px card per item, caps label, chevron. */
function Rows({ title, rows }: { title: string; rows: Row[] }) {
  const id = `more-${title.toLowerCase()}`
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="px-1 text-xs leading-4 font-bold tracking-[0.08em] text-muted-foreground uppercase">
        {title}
      </h2>
      <ul className="space-y-2">
        {rows.map(({ icon: Icon, label, caption, href }) => (
          <li key={label}>
            <Link href={href} className={cn(CARD_LINK, "flex min-h-14 items-center gap-3 px-4")}>
              <Icon aria-hidden className="size-[22px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate text-[13px] leading-4 font-bold tracking-[0.08em] uppercase">{label}</span>
              {caption && <span className="shrink-0 font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">{caption}</span>}
              <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
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
      <div className="flex flex-col gap-6 xl:max-w-[720px] xl:gap-8">
        {reports.length > 0 && <Rows title="Reports" rows={reports} />}
        <Rows
          title="App"
          rows={[
            { icon: Settings, label: "Settings", href: "/settings" },
            { icon: demo ? FlaskConical : Plug, label: "Data source", caption: demo ? "Demo data" : "Google Health", href: "/settings#source" },
          ]}
        />
        <p className="text-center text-xs leading-4 font-medium text-muted-foreground tabular-nums">
          Pulse {vm.version} · scoring v{vm.scoringVersion}
        </p>
      </div>
    </PageShell>
  )
}
