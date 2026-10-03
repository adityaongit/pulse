import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { VitalTilesSkeleton } from "./VitalTiles"

/** Health Monitor loading (spec §7.8, §5.19): the date row, the count hero, and the five vital tiles with the note. */
export default function Loading() {
  return (
    <DetailShell
      title="Health Monitor"
      dateSwitcher={{ mode: "day" }}
      hero={
        <div aria-hidden className="flex flex-col items-center gap-3 py-4 text-center">
          <SkeletonText className="w-[2.5ch] font-numeric text-[64px] leading-none font-bold md:text-[72px]" />
          <p className="text-xs leading-4 font-bold tracking-[0.08em] uppercase">Metrics within range</p>
          <Skeleton className="h-6 w-28 rounded-md" />
        </div>
      }
      primary={
        <SectionShell variant="section" title="Last night's readings">
          <VitalTilesSkeleton />
        </SectionShell>
      }
    />
  )
}
