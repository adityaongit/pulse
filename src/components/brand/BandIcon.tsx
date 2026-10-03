import { cn } from "@/lib/utils"

/**
 * The Fitbit Air in WHOOP's battery slot: its woven strap in three-quarter view, as WHOOP draws its own band. Lucide-weight outline (1.6) in currentColor.
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
      {/* The Fitbit Air strap, leaning right: the wide band, the loop's opening, and the buckle bar on top. */}
      <g transform="rotate(8 12 12)">
        <rect x="6.4" y="3.4" width="12.4" height="17.6" rx="5.2" />
        <ellipse cx="15.4" cy="12.2" rx="1.9" ry="6.6" />
        <path d="M8.6 3.4h4" strokeWidth={strokeWidth * 1.5} />
      </g>
    </svg>
  )
}
