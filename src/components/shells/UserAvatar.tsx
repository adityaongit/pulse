import { Blobatar } from "blobatar/react"
import { cn } from "@/lib/utils"

/**
 * The user's photo (uploaded, else Google's), or a blobatar seeded by the account so it stays the same across
 * visits. The blobatar is pinned to its roundest body and zoomed past the circle, so its colour fills the whole
 * disc and the eyes sit centred: a round avatar like a photo, not a small creature on a backdrop.
 */
export function UserAvatar({ src, seed, className }: { src: string | null | undefined; seed: string; className?: string }) {
  const disc = cn("block size-full overflow-hidden rounded-full outline-1 -outline-offset-1 outline-white/10", className)
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- a user photo from Google or our own /avatar; nothing to optimise
    <img src={src} alt="" referrerPolicy="no-referrer" className={cn(disc, "object-cover")} />
  ) : (
    <span className={disc}>
      <Blobatar name={seed} alt="" background={false} traits={{ shape: 0 }} className="size-full scale-[1.6]" />
    </span>
  )
}
