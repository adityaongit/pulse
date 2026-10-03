import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

/** The default groups and their sizes (src/server/journalTags.ts); custom ones only add rows below. */
const GROUPS: [string, number][] = [
  ["Evening", 4],
  ["Recovery", 3],
  ["Context", 2],
]

/** Behaviours: the intro, each group's card with its rows' boxes, and Your behaviours with the add form (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      title="Behaviours"
      primary={
        <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
          <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            Choose what the check-in asks. A hidden behaviour leaves the check-in, but its past answers stay and still count in your insights.
          </p>
          {GROUPS.map(([title, n]) => (
            <SectionShell key={title} variant="card" level={2} title={title}>
              <ul className="divide-y divide-border">
                {Array.from({ length: n }, (_, i) => (
                  <li key={i} className="flex min-h-14 items-center gap-2 py-1.5">
                    <Skeleton className="size-5 shrink-0 rounded-md" />
                    <span className="ml-1 min-w-0 flex-1">
                      <SkeletonText className="w-28 text-[15px] leading-[22px]" />
                      <SkeletonText className="w-24 text-xs leading-4" />
                    </span>
                    <span className="size-11" />
                    <span className="size-11" />
                    <Skeleton className="mx-1 h-[18.4px] w-8 rounded-full" />
                  </li>
                ))}
              </ul>
            </SectionShell>
          ))}
          <SectionShell variant="card" level={2} title="Your behaviours">
            <SkeletonText className="w-44 text-[15px] leading-[22px]" />
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-[15px] leading-[22px] font-medium">Add a behaviour</p>
              <div className="flex gap-2">
                <Skeleton className="h-11 min-w-0 flex-1 rounded-lg" />
                <Skeleton className="h-11 w-[68px] rounded-xl" />
              </div>
            </div>
          </SectionShell>
        </div>
      }
    />
  )
}
