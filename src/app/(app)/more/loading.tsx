import { CalendarDays, CalendarRange, ChevronRight, Settings, type LucideIcon } from "lucide-react"
import { Mark } from "@/components/brand/Mark"
import { PageShell } from "@/components/shells/PageShell"
import { CARD_MATERIAL } from "@/components/ui/card"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

type Row = [icon: LucideIcon | null, label: string, caption: boolean]
const GROUPS: [string, Row[]][] = [
  [
    "Reports",
    [
      [CalendarRange, "Weekly report", true],
      [CalendarDays, "Monthly report", true],
    ],
  ],
  [
    "App",
    [
      [Settings, "Settings", false],
      [null, "Data source", true],
    ],
  ],
]

/** More: the page's two row groups and footer, with static labels; captions and the source icon are bars (spec §7.14, §5.19). */
export default function Loading() {
  return (
    <PageShell title="More">
      <div aria-hidden className="flex w-full flex-col gap-6 xl:mx-auto xl:max-w-[720px] xl:gap-8">
        {GROUPS.map(([title, rows]) => (
          <section key={title} className="space-y-2">
            <h2 className="px-1 text-[13px] leading-4 font-bold tracking-[0.1em] text-foreground/85 uppercase">{title}</h2>
            <ul className="space-y-2">
              {rows.map(([Icon, label, caption]) => (
                <li key={label} className={`${CARD_MATERIAL} flex min-h-14 items-center gap-3 px-4`}>
                  {Icon ? <Icon className="size-[22px] shrink-0 text-foreground-secondary" strokeWidth={1.5} /> : <Skeleton className="size-[22px] shrink-0 rounded-md" />}
                  <span className="min-w-0 flex-1 truncate text-xs leading-4 font-bold tracking-[0.08em] uppercase">{label}</span>
                  {caption && <SkeletonText className="w-20 text-xs leading-4" />}
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <div className="flex flex-col items-center gap-2">
          <Mark color="mono" className="size-8 text-muted-foreground" />
          <SkeletonText className="w-32 text-xs leading-4" />
        </div>
      </div>
    </PageShell>
  )
}
