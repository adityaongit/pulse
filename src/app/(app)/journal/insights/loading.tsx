import { DriverListSkeleton } from "@/components/metrics/DriverList"
import { DetailShell } from "@/components/shells/DetailShell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <DetailShell title="Behaviour insights" hero={<Skeleton className="h-36 w-full rounded-2xl" />} summary={<DriverListSkeleton />} />
}
