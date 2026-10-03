import { DetailShell } from "@/components/shells/DetailShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

const BODY = "text-[15px] leading-[22px]"
const SECTIONS = ["What goes in", "How it is weighted", "What the bands mean", "Limits"]

/** One explainer: the summary line, the four section cards with their real titles, text as bars (spec §5.19). */
export default function Loading() {
  return (
    <DetailShell
      title={"\u00a0"}
      subtitle="How it works"
      primary={
        <div aria-hidden className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <SkeletonText className="w-full max-w-[44ch] text-[17px] leading-6" />
          <Skeleton className="h-11 w-full shrink-0 rounded-xl md:w-40" />
        </div>
      }
      secondary={SECTIONS.map((t) => (
        <SectionShell key={t} variant="card" level={2} title={t}>
          <div aria-hidden className="space-y-1">
            <SkeletonText className={`${BODY} w-full`} />
            <SkeletonText className={`${BODY} w-full`} />
            <SkeletonText className={`${BODY} w-2/3`} />
          </div>
        </SectionShell>
      ))}
    />
  )
}
