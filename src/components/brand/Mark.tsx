import { cn } from "@/lib/utils"

/**
 * The Pulse mark, option 4g "Cool pair" (docs/design/brand.md): two staggered beats, lub then dub.
 * brand: optimal teal, then strain blue, from the data tokens. mono: both beats in currentColor,
 * for muted in-app placements. The icon files repeat this geometry in hex: src/app/icon.svg and
 * public/icons/icon-maskable.svg (24-unit tile, beats at x 6.9 and 12.9).
 */
export function Mark({
  className,
  title,
  color = "brand",
  animated = false,
}: {
  className?: string
  title?: string
  color?: "brand" | "mono"
  /** The sign-in screen's heartbeat: the upper beat stretches up, then the lower one down (reduced motion: still). */
  animated?: boolean
}) {
  const mono = color === "mono"
  const beat = animated ? "motion-safe:animate-beat [transform-box:fill-box]" : undefined
  return (
    <svg viewBox="4.5 4.5 15 15" role="img" aria-label={title ?? "Pulse"} className={cn("size-6 shrink-0", className)}>
      {title && <title>{title}</title>}
      <rect x={6.9} y={4.5} width={4.2} height={11} rx={2.1} fill={mono ? "currentColor" : "var(--optimal)"} className={cn(beat, "origin-bottom")} />
      <rect
        x={12.9}
        y={8.5}
        width={4.2}
        height={11}
        rx={2.1}
        fill={mono ? "currentColor" : "var(--strain-text)"}
        className={cn(beat, "origin-top [animation-delay:180ms]")}
      />
    </svg>
  )
}
