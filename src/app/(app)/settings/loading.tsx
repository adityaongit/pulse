import { DetailShell } from "@/components/shells/DetailShell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <DetailShell
      title="Settings"
      dismiss="close"
      primary={
        <div aria-hidden className="grid gap-3 xl:grid-cols-2 xl:gap-4">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      }
    />
  )
}
