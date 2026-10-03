import { CircleUserRound } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The user's photo (uploaded, else Google's), else WHOOP's no-photo outline ([latest-home-collapsed-1]).
 */
export function UserAvatar({ src, className }: { src: string | null | undefined; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a user photo from Google or our own /avatar; nothing to optimise
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      className={cn("block size-full rounded-full object-cover outline-1 -outline-offset-1 outline-white/10", className)}
    />
  ) : (
    <CircleUserRound aria-hidden strokeWidth={1.5} className={cn("size-full text-foreground", className)} />
  )
}
