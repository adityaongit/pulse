import { DetailShell } from "@/components/shells/DetailShell"
import { SHEET_SECTION } from "@/components/shells/ResponsiveSheet"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

/** Behaviours: the intro, the search field, the category tabs and the nine default rows under "Selected" (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell loading
      title="Behaviours"
      primary={
        <div aria-hidden className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
          <p className="max-w-[65ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">
            Choose what your journal asks. A behaviour you leave out keeps its past answers, and they still count in your insights.
          </p>
          <div>
            <Skeleton className="h-12 rounded-xl" />
            <div className="mt-3 flex h-11 items-center gap-6 overflow-hidden px-2.5">
              {["w-6", "w-36", "w-36", "w-28"].map((w, i) => (
                <SkeletonText key={i} className={`${w} shrink-0 text-xs leading-4`} />
              ))}
            </div>
            <p className={`${SHEET_SECTION} mt-4`}>Selected</p>
            <ul className="mt-1">
              {Array.from({ length: 9 }, (_, i) => (
                <li key={i} className="flex min-h-16 items-center gap-4 py-2">
                  <span className="min-w-0 flex-1">
                    <SkeletonText className="w-32 text-[17px] leading-6" />
                    <SkeletonText className="w-48 text-[15px] leading-[22px]" />
                  </span>
                  <Skeleton className="size-7 rounded-lg" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
    />
  )
}
