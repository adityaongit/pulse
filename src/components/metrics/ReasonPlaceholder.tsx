import { cn } from "@/lib/utils"
import { reasonCopy } from "@/lib/reasons"

export type ReasonPlaceholderProps = {
  /** Any string; unknown codes fall back to `no_data`. */
  reason: string | null | undefined
  nightsLeft?: number
  size: "sm" | "md" | "lg"
  /** Replaces the long copy where a screen words it its own way ("Forecast starts after 14 nights."). */
  copy?: string
  className?: string
}

/** Copy and icon for a reason code (spec §5.14). Text is real text; the icon is decorative. */
export function ReasonPlaceholder({ reason, nightsLeft, size, copy, className }: ReasonPlaceholderProps) {
  const r = reasonCopy(reason, nightsLeft)
  const Icon = r.icon
  const long = copy ?? r.long

  if (size === "sm")
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs leading-4 font-medium text-muted-foreground", className)}>
        {Icon && <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.75} />}
        {long}
      </span>
    )

  if (size === "md")
    return (
      <div className={cn("flex flex-col items-center gap-2 py-6 text-center", className)}>
        {Icon && <Icon aria-hidden className="size-5 text-muted-foreground" strokeWidth={1.75} />}
        <p className="max-w-[36ch] text-[15px] leading-[22px] text-pretty text-foreground-secondary">{long}</p>
      </div>
    )

  return (
    <div className={cn("flex flex-col items-center gap-2 text-center", className)}>
      {Icon && <Icon aria-hidden className="size-6 text-foreground-secondary" strokeWidth={1.75} />}
      <p className="line-clamp-2 max-w-40 text-base leading-[22px] font-semibold text-balance text-foreground-secondary">
        {r.code === "no_data" ? "No data" : r.short}
      </p>
    </div>
  )
}
