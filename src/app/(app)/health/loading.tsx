import { PageShell } from "@/components/shells/PageShell"
import { Skeleton } from "@/components/ui/skeleton"

/** Health hub: the 2 × 2 card grid (spec §7.6). */
export default function Loading() {
  return (
    <PageShell title="Health" layout="grid-2">
      {["Healthspan", "Health Monitor", "Stress Monitor", "Fitness"].map((t) => (
        <Skeleton key={t} aria-hidden className="h-44 rounded-xl" />
      ))}
    </PageShell>
  )
}
