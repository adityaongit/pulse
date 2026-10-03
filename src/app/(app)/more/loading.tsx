import { PageShell } from "@/components/shells/PageShell"
import { CARD_MATERIAL } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"

/** More: the two row groups in their own boxes (spec §7.14, §5.19). */
export default function Loading() {
  return (
    <PageShell title="More">
      <div aria-hidden className="flex w-full flex-col gap-6 xl:mx-auto xl:max-w-[720px] xl:gap-8">
        {[2, 2].map((n, g) => (
          <div key={g} className="space-y-2">
            <SkeletonText className="w-16 px-1 text-xs leading-4" />
            {Array.from({ length: n }, (_, i) => (
              <div key={i} className={`${CARD_MATERIAL} flex min-h-14 items-center gap-3 px-4`}>
                <SkeletonText className="w-36 text-xs leading-4" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageShell>
  )
}
