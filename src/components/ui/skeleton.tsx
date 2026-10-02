import { cn } from "cn"

// Skeletons reuse the component's own box (spec §5.19); these are only the bars inside it.
const BAR = "animate-pulse rounded-md bg-muted motion-reduce:animate-none"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn(BAR, className)} {...props} />
}

/**
 * A text bar for one line of a type role: give it the role's classes (size and line height) and a
 * width. It is one line tall and fills the cap height, so swapping in the real text moves nothing.
 */
function SkeletonText({ className }: { className?: string }) {
  return (
    <span aria-hidden data-slot="skeleton" className={cn("flex h-[1lh] items-center", className)}>
      <span className={cn(BAR, "h-[0.72em] w-full rounded-sm")} />
    </span>
  )
}

export { Skeleton, SkeletonText }
