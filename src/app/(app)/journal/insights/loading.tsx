import { DriverListSkeleton } from "@/components/metrics/DriverList"
import { DetailShell } from "@/components/shells/DetailShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"

const BODY = "text-[15px] leading-[22px]"

/**
 * Behaviour insights loading (spec §7.12, §5.19): the top-aligned 360 px hero (heading, explainer, metric toggle) beside
 * the behaviour list on laptop, above it on phone, then the footnote. The metric comes from `?m=`, which loading UI
 * cannot read, so the heading is a bar.
 */
export default function Loading() {
  return (
    <DetailShell
      title="Behaviour insights"
      hero={
        <div aria-hidden data-hero-align="start" className="w-full space-y-4 xl:w-[360px]">
          <div className="space-y-2">
            <SkeletonText className="w-56 text-[22px] leading-7 xl:text-2xl" />
            <div>
              <SkeletonText className={`${BODY} w-full`} />
              <SkeletonText className={`${BODY} w-full`} />
              <SkeletonText className={`${BODY} w-1/3`} />
            </div>
            <p className="text-xs leading-4 font-medium text-muted-foreground">Updated daily</p>
          </div>
          <Skeleton className="h-11 w-[140px] rounded-lg" />
        </div>
      }
      summary={<DriverListSkeleton rows={6} />}
      footer={
        <p className="text-xs leading-4 font-medium text-pretty text-muted-foreground">
          Effects are differences in averages, not proof of cause. Change one habit at a time to see what it really does.
        </p>
      }
    />
  )
}
