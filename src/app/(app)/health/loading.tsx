import { StressChartSkeleton } from "@/components/charts/StressChart"
import { TickScaleSkeleton } from "@/components/metrics/TickScale"
import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { CAPTION, LABEL } from "@/components/metrics/primitives"

const TILE = "font-numeric text-4xl leading-10 font-bold"
const Chip = () => <Skeleton className="h-6 w-24 rounded-md" />

/**
 * Health hub loading (spec §7.6, §5.19): the page's four linked cards on its ground, one column on phone and two from
 * 1280 px, each body laid out as the real one with its static labels; then the footnote.
 */
export default function Loading() {
  return (
    <PageShell title="Health" ground="health">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
        <SectionShell variant="card" level={2} title="Healthspan" href="/health/healthspan" className="xl:col-span-2">
          <div aria-hidden className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-center xl:gap-8">
            <div className="flex justify-center">
              <div className="grid size-[200px] place-items-center rounded-full ring-2 ring-dial-track">
                <SkeletonText className="w-[4ch] font-numeric text-[40px] leading-none font-bold" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className={LABEL}>Pace of Aging</p>
                <Chip />
              </div>
              <TickScaleSkeleton variant="marker" />
              <p className={CAPTION}>Updated weekly</p>
            </div>
          </div>
        </SectionShell>
        <SectionShell variant="card" level={2} title="Health Monitor" href="/health/monitor">
          <div aria-hidden className="space-y-4">
            <ul className="grid grid-cols-5 divide-x divide-border">
              {Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex flex-col items-center gap-2 px-1">
                  <Skeleton className="size-6 rounded-md" />
                  <SkeletonText className={`${LABEL} w-[4ch]`} />
                  <Skeleton className="size-5 rounded-sm" />
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 rounded-lg bg-inset px-3 py-2.5">
              <Skeleton className="size-5 shrink-0 rounded-sm" />
              <SkeletonText className="w-32 text-[15px] leading-[22px]" />
            </div>
          </div>
        </SectionShell>
        <SectionShell variant="card" level={2} title="Stress Monitor" href="/health/stress">
          <div aria-hidden className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4">
            <div className="space-y-2">
              <p className={LABEL}>Today&apos;s high stress</p>
              <SkeletonText className={`${TILE} w-[4ch]`} />
              <Chip />
            </div>
            <StressChartSkeleton variant="spark" />
          </div>
        </SectionShell>
        <SectionShell variant="card" level={2} title="Fitness" href="/health/fitness" className="xl:col-span-2">
          <div aria-hidden className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <SkeletonText className={`${TILE} w-[4ch]`} />
              <SkeletonText className={`${LABEL} w-20`} />
              <SkeletonText className={`${CAPTION} w-40`} />
            </div>
            <div className="flex flex-col items-end gap-1">
              <p className={LABEL}>Training load</p>
              <SkeletonText className="w-[4ch] font-numeric text-xl leading-6 font-bold" />
              <Chip />
            </div>
          </div>
        </SectionShell>
      </div>
      <p className={`${CAPTION} text-center`}>Estimates for personal insight, not medical advice.</p>
    </PageShell>
  )
}
