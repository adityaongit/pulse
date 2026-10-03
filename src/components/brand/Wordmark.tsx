import { cn } from "@/lib/utils"

/**
 * The Pulse wordmark (docs/design/brand.md). The glyphs are monoline strokes on a 20-unit cap
 * height. The L's foot runs on as a heartbeat (one spike up, one dip below the baseline) and
 * becomes the S's bottom bar, so L, beat and S are a single stroke.
 * bold: for the in-app header, about 14 to 18 px cap height. black: for a splash, 32 px and up.
 */
const CAP = 20
const STROKE = { bold: 3.2, black: 4.4 } as const

function build(s: number) {
  const h = s / 2
  const r = 5 // corner radius on the centreline (P bowl, U)
  const gap = 5.5
  const base = CAP - h // centreline of strokes that sit on the baseline
  const d: string[] = []

  // P: square top-left corner; the bowl closes at 60% of the cap height.
  const yb = 11.5 + h
  d.push(`M${h} ${CAP}V${h}H${19 - h - r}A${r} ${r} 0 0 1 ${19 - h} ${h + r}V${yb - r}A${r} ${r} 0 0 1 ${19 - h - r} ${yb}H${h}`)
  let x = 19 + gap

  // U
  d.push(`M${x + h} 0V${base - r}A${r} ${r} 0 0 0 ${x + h + r} ${base}H${x + 20 - h - r}A${r} ${r} 0 0 0 ${x + 20 - h} ${base - r}V0`)
  x += 20 + gap

  // L, beat and S as one stroke. The beat scales with the weight so its counter stays open.
  const k = 0.8 * s + 1.3 // half-width of the spike
  const rise = 7.5 // spike height above the baseline
  const dip = 2.5 // dip below the baseline
  const b = x + 12 // the beat starts where a plain L's foot would end
  const sx = b + 2.5 * k - 1 // the S's left edge
  const sw = 21
  const rs = Math.min(r, (CAP / 2 - h) / 2) // the S needs two radii in each half
  const ym = CAP / 2
  d.push(
    `M${x + h} 0V${base}H${b}L${b + k} ${base - rise}L${b + 2 * k} ${base + dip}L${b + 2.5 * k} ${base}` +
      `H${sx + sw - h - rs}A${rs} ${rs} 0 0 0 ${sx + sw - h} ${base - rs}V${ym + rs}A${rs} ${rs} 0 0 0 ${sx + sw - h - rs} ${ym}` +
      `H${sx + h + rs}A${rs} ${rs} 0 0 1 ${sx + h} ${ym - rs}V${h + rs}A${rs} ${rs} 0 0 1 ${sx + h + rs} ${h}H${sx + sw}`,
  )
  x = sx + sw + gap

  // E: the middle arm is 2 units short.
  d.push(`M${x + 17} ${h}H${x + h}V${base}H${x + 17}M${x + h} ${ym}H${x + 15}`)
  const width = x + 17

  // The dip's miter tip hangs below the baseline: tip = vertex + h / sin(half the join angle).
  const ux = -k, uy = -(rise + dip), vx = 0.5 * k, vy = -dip
  const angle = Math.acos((ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)))
  const bottom = base + dip + h / Math.sin(angle / 2)

  return { d: d.join(""), viewBox: `0 0 ${+width.toFixed(2)} ${+bottom.toFixed(2)}` }
}

const GLYPHS = { bold: build(STROKE.bold), black: build(STROKE.black) }

export function Wordmark({
  className,
  title,
  weight = "bold",
}: {
  className?: string
  title?: string
  weight?: keyof typeof STROKE
}) {
  const { d, viewBox } = GLYPHS[weight]
  return (
    <svg viewBox={viewBox} role="img" aria-label={title ?? "Pulse"} className={cn("h-4 w-auto shrink-0", className)}>
      {title && <title>{title}</title>}
      <path d={d} fill="none" stroke="currentColor" strokeWidth={STROKE[weight]} strokeMiterlimit={8} />
    </svg>
  )
}
