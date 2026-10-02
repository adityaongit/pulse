import { DetailShell } from "@/components/shells/DetailShell"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <DetailShell
      title="Settings"
      primary={
        <div aria-hidden className="grid gap-3 lg:grid-cols-2 xl:gap-4">
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      }
    />
  )
}
