import { cn } from "@/lib/utils"

/**
 * The Fitbit Air in WHOOP's battery slot: the band in three-quarter view, leaning right, with its opening and
 * clasp, as WHOOP draws its strap. Lucide-weight outline (1.6) in currentColor.
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
      {/* Leans right like WHOOP's strap: the outer band (with the clasp's notch on the left), the opening that shows
          the far side's thickness, and the clasp line on the front. */}
      <g transform="rotate(6 12 12)">
        <path d="M9.6 3.3C11.6 2.7 15.4 2.6 16.9 3.4c1.7.9 2 4.4 1.8 8.6-.2 4.6-1 7.7-2.6 8.6-1.6.8-5.4.8-7 .1-1.1-.5-1.6-1.6-1.6-3.1v-1l-.7-.7V9.6c0-3.3 1-5.6 2.8-6.3z" />
        <ellipse cx="14.4" cy="12" rx="2.3" ry="7.5" transform="rotate(6 14.4 12)" />
        <path d="M8.3 14.6h2.7" />
      </g>
    </svg>
  )
}
