import { Archive, BookOpen, CalendarDays, CalendarRange, ChartLine, Database, ListChecks } from "lucide-react"
import { SCORING_VERSION } from "@/server/pipeline"
import { APP_VERSION } from "@/server/queries/settings"
import { LinkListSkeleton, LIST_GRID } from "@/components/shells/LinkList"
import { PageShell } from "@/components/shells/PageShell"
import { CARD_MATERIAL } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { About } from "./About"

/** More: the same rows and About card in their final boxes; only the account and the captions are bars (spec §5.19). */
export default function Loading() {
  return (
    <PageShell title="More">
      <div aria-hidden className={`${CARD_MATERIAL} flex min-h-18 items-center gap-3 px-4 py-3 md:hidden`}>
        <Skeleton className="size-11 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <SkeletonText className="w-24 text-[15px] leading-[22px]" />
          <span className="block text-[13px] leading-[18px] text-muted-foreground">Account, data source, profile</span>
        </span>
      </div>
      <div className={LIST_GRID}>
        <LinkListSkeleton
          title="Reports"
          rows={[
            { icon: CalendarRange, label: "Weekly report" },
            { icon: CalendarDays, label: "Monthly report" },
            { icon: Archive, label: "All reports" },
          ]}
        />
        <div className="flex min-w-0 flex-col gap-6">
          <LinkListSkeleton title="Trends" rows={[{ icon: ChartLine, label: "Trends" }]} />
          <LinkListSkeleton title="Journal" rows={[{ icon: ListChecks, label: "Behaviours" }]} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <LinkListSkeleton title="Help" rows={[{ icon: BookOpen, label: "How Pulse works" }]} />
          <LinkListSkeleton title="Your data" rows={[{ icon: Database, label: "Export and backup" }]} />
        </div>
        <div aria-hidden className="contents">
          <About version={APP_VERSION} scoringVersion={SCORING_VERSION} />
        </div>
      </div>
    </PageShell>
  )
}
