import Link from "next/link"
import { connection } from "next/server"
import { format, parseISO } from "date-fns"
import { Archive, BookOpen, CalendarDays, CalendarRange, ChartLine, ChevronRight, Database, ListChecks } from "lucide-react"
import { rangeLabel } from "@/lib/format"
import { currentSession } from "@/server/auth"
import { avatarSrc } from "@/server/avatar"
import { getDb } from "@/server/db"
import { getMore } from "@/server/queries/settings"
import { LinkList, LIST_GRID, type LinkListRow } from "@/components/shells/LinkList"
import { PageShell } from "@/components/shells/PageShell"
import { CARD_LINK } from "@/components/shells/SectionShell"
import { UserAvatar } from "@/components/shells/UserAvatar"
import { cn } from "@/lib/utils"
import { About } from "./About"
import { SCORE_DOCS } from "./how-it-works/content"

export const metadata = { title: "More" }

/**
 * Phones have no sidebar, so More is the way to Settings there: the signed-in account as the first row (below
 * 768 px only; the rail and sidebar carry Settings from there).
 */
async function AccountRow() {
  const session = await currentSession()
  const owner = session?.kind === "owner"
  return (
    <Link href="/settings" className={cn(CARD_LINK, "flex min-h-18 items-center gap-3 px-4 py-3 md:hidden")}>
      <span className="size-11 shrink-0">
        <UserAvatar src={avatarSrc(getDb())} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] leading-[22px] font-semibold">{owner ? session.email : "Demo"}</span>
        <span className="block text-[13px] leading-[18px] text-muted-foreground">Account, data source, profile</span>
      </span>
      <span className="sr-only">Settings</span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
    </Link>
  )
}

/** More `/more` (spec §7.14, U21): everything that isn't configuration. Settings stays Account, Data source, Profile. */
export default async function MorePage() {
  await connection()
  const vm = getMore()
  const reports: LinkListRow[] = [
    ...(vm.latestWeek
      ? [{ icon: CalendarRange, label: "Weekly report", aside: rangeLabel(vm.latestWeek.start, vm.latestWeek.end), href: `/reports/${vm.latestWeek.period}` }]
      : []),
    ...(vm.latestMonth
      ? [{ icon: CalendarDays, label: "Monthly report", aside: format(parseISO(vm.latestMonth.start), "MMMM"), href: `/reports/${vm.latestMonth.period}` }]
      : []),
    { icon: Archive, label: "All reports", aside: vm.reportCount ? String(vm.reportCount) : undefined, href: "/reports" },
  ]

  return (
    <PageShell title="More">
      <AccountRow />
      <div className={LIST_GRID}>
        <LinkList title="Reports" rows={reports} />
        <div className="flex min-w-0 flex-col gap-6">
          <LinkList title="Trends" rows={[{ icon: ChartLine, label: "Trends", aside: "Up to 1 year", href: "/trends" }]} />
          <LinkList
            title="Journal"
            rows={[{ icon: ListChecks, label: "Behaviours", aside: `${vm.behaviours.shown} of ${vm.behaviours.total} shown`, href: "/more/behaviours" }]}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <LinkList title="Help" rows={[{ icon: BookOpen, label: "How Pulse works", aside: `${SCORE_DOCS.length} scores`, href: "/more/how-it-works" }]} />
          <LinkList title="Your data" rows={[{ icon: Database, label: "Export and backup", aside: "CSV, JSON, SQLite", href: "/more/data" }]} />
        </div>
        <About version={vm.version} scoringVersion={vm.scoringVersion} />
      </div>
    </PageShell>
  )
}
