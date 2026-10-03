import { PageShell } from "@/components/shells/PageShell"
import { SectionShell } from "@/components/shells/SectionShell"
import { Skeleton, SkeletonText } from "@/components/ui/skeleton"
import { LABEL } from "@/components/metrics/primitives"

/** Health hub loading (spec §7.6, §5.19): the real ground, card titles and boxes; the orb as its rim track. */
export default function Loading() {
  return (
    <PageShell title="Health" ground="health">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 xl:gap-4">
      <SectionShell variant="card" level={2} title="Healthspan" className="xl:col-span-2">
        <div aria-busy className="flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-center xl:gap-8">
          <div className="flex justify-center">
            <div aria-hidden className="grid size-[200px] place-items-center rounded-full ring-2 ring-dial-track">
              <SkeletonText className="w-[4ch] font-numeric text-[40px] leading-none font-bold" />
            </div>
          </div>
          <div aria-hidden className="space-y-3">
            <p className={LABEL}>Pace of Aging</p>
            <Skeleton className="h-16 rounded-lg bg-muted/60" />
            <SkeletonText className="w-24 text-xs leading-4" />
          </div>
        </div>
      </SectionShell>
        {["Health Monitor", "Stress Monitor", "Fitness"].map((t) => (
          <SectionShell key={t} variant="card" level={2} title={t} className={t === "Fitness" ? "xl:col-span-2" : undefined}>
            <Skeleton aria-hidden className="h-24 rounded-lg bg-muted/60" />
          </SectionShell>
        ))}
      </div>
    </PageShell>
  )
}
