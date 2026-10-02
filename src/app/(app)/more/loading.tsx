import { PageShell } from "@/components/shells/PageShell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <PageShell title="More">
      <Skeleton aria-hidden className="h-36 rounded-xl xl:max-w-[720px]" />
      <Skeleton aria-hidden className="h-36 rounded-xl xl:max-w-[720px]" />
    </PageShell>
  )
}
