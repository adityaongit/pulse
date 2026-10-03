import { cn } from "@/lib/utils"

/**
 * The Fitbit Air in WHOOP's battery slot: the band seen from the side, its pill-shaped pebble on the front.
 * Lucide-weight outline (1.6) in currentColor, sized like the icons around it.
 */
export function BandIcon({ className, strokeWidth = 1.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-6 shrink-0", className)}
    >
      <path d="M13.5 4.4C8 3.8 4.6 6.8 4.6 12s3.4 8.2 8.9 7.6" />
      <rect x="12.4" y="5.6" width="6.8" height="12.8" rx="3.4" />
    </svg>
  )
}
