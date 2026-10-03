import { cn } from "@/lib/utils"

/**
 * The Fitbit Air in WHOOP's battery slot: the band tilted in three-quarter view, its opening on the right and the
 * clasp line on the front, as WHOOP draws its strap. Lucide-weight outline (1.6) in currentColor.
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
      <g transform="rotate(-14 12 12)">
        <path d="M14.3 3.4H10C7.5 3.4 6 5.8 6 9.3v5.4c0 3.5 1.5 5.9 4 5.9h4.3" />
        <ellipse cx="14.3" cy="12" rx="3.6" ry="8.6" />
        <path d="M7.9 14.9h2.5" />
      </g>
    </svg>
  )
}
