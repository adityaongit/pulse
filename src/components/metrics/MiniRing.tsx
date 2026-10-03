"use client"

import { PolarAngleAxis, RadialBar, RadialBarChart } from "recharts"
import { DATA_COLORS, dialColor } from "@/lib/bands"
import { useReducedMotion } from "@/hooks/use-reduced-motion"

export type MiniRingVariant = "sleep" | "recovery" | "strain"

const MAX: Record<MiniRingVariant, number> = { sleep: 100, recovery: 100, strain: 21 }
const D = 22

/**
 * The header's 22 px ring (ScoreDial `mini`, spec §5.1 v2): 3 px stroke, no centre text, the 4° gap
 * at 12 o'clock. `fill` false draws the track only, so the first reveal can sweep the fill in (500 ms).
 * Decorative: the link around it carries the label.
 */
export function MiniRing({ variant, value, fill = true }: { variant: MiniRingVariant; value: number | null; fill?: boolean }) {
  const reduced = useReducedMotion()
  const max = MAX[variant]
  const shown = fill && value !== null ? Math.min(value, max) : 0
  const color = value === null ? "transparent" : DATA_COLORS[dialColor(variant, value)].css
  return (
    <span aria-hidden className="block size-[22px] shrink-0">
      <RadialBarChart
        accessibilityLayer={false}
        width={D}
        height={D}
        data={[{ v: shown }]}
        startAngle={86}
        endAngle={-266}
        innerRadius={D / 2 - 3}
        outerRadius={D / 2}
        barSize={3}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      >
        <PolarAngleAxis type="number" domain={[0, max]} tick={false} axisLine={false} />
        <RadialBar
          dataKey="v"
          fill={color}
          cornerRadius={0}
          background={{ fill: "var(--dial-track)" }}
          isAnimationActive={!reduced}
          animationDuration={500}
          animationEasing="ease-out"
        />
      </RadialBarChart>
    </span>
  )
}
