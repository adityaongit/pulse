import { cn } from "@/lib/utils"

/**
 * The Pulse mark: a flat trace beats once, then draws the P (docs/design/brand.md).
 * One centred stroke, 2.6 units wide, on a 24-unit square. The icon files repeat this path:
 * src/app/icon.svg and public/icons/icon-maskable.svg.
 */
export const MARK_PATH =
  "M0 15.5H1.8L3.9 8.5L6 18.5L7.26 15.5H10.5V1.3H16A4 4 0 0 1 20 5.3V5.6A4 4 0 0 1 16 9.6H10.5"
export const MARK_STROKE = 2.6
// The drawing spans 21.3 x 22.9 units with its spike tip; this viewBox centres it in 24 x 24.
export const MARK_VIEWBOX = "-1.35 -0.55 24 24"

export function Mark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      role="img"
      aria-label={title ?? "Pulse"}
      className={cn("size-6 shrink-0", className)}
    >
      {title && <title>{title}</title>}
      <path d={MARK_PATH} fill="none" stroke="currentColor" strokeWidth={MARK_STROKE} strokeMiterlimit={8} />
    </svg>
  )
}
