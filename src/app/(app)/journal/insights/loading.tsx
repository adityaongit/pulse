import { DriverListSkeleton } from "@/components/metrics/DriverList"
import { DetailShell } from "@/components/shells/DetailShell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return <DetailShell title="Journal insights" hero={<Skeleton className="h-36 w-full rounded-xl" />} summary={<DriverListSkeleton />} />
}
