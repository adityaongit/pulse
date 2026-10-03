"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { COLLAPSE_HERO } from "@/lib/collapse"
import { useHeroCollapse } from "@/hooks/use-hero-collapse"
import { DetailHeaderRow, type DetailHeaderProps } from "./DetailHeader"
import { HEADER_FILL } from "./TopBar"

export type HeaderStat = {
  /** Formatted already: "3.4", "-0.8x". */
  value: React.ReactNode
  /** Caps label, written in sentence case: "Years younger". */
  label: string
  /** Value colour; default foreground. */
  tone?: "optimal" | "warning"
}
export type HeaderStats = { left?: HeaderStat; right?: HeaderStat }

// Row 2 is 62 px ([latest-healthspan-collapsed-2]); the band grows by it with a transform reveal, so nothing reflows.
const BAND_MOTION =
  "transition-[translate] duration-200 ease-in-quick group-data-[state=collapsed]/ch:duration-220 group-data-[state=collapsed]/ch:ease-out-expo motion-reduce:transition-none"
const CENTER_MOTION =
  "transition-opacity duration-220 ease-out-expo group-data-[state=collapsed]/ch:pointer-events-none group-data-[state=collapsed]/ch:opacity-0 group-data-[state=collapsed]/ch:duration-150 group-data-[state=collapsed]/ch:ease-in-quick"
const HERO_MOTION =
  "scale-85 opacity-0 transition-[opacity,scale] duration-150 ease-in-quick group-data-[state=collapsed]/ch:scale-100 group-data-[state=collapsed]/ch:opacity-100 group-data-[state=collapsed]/ch:duration-220 group-data-[state=collapsed]/ch:ease-out-expo motion-reduce:scale-100"
const STAT_MOTION =
  "translate-y-1 opacity-0 transition-[opacity,translate] duration-150 ease-in-quick group-data-[state=collapsed]/ch:translate-y-0 group-data-[state=collapsed]/ch:opacity-100 group-data-[state=collapsed]/ch:delay-40 group-data-[state=collapsed]/ch:duration-220 group-data-[state=collapsed]/ch:ease-out-expo motion-reduce:translate-y-0"

function Stat({ stat }: { stat?: HeaderStat }) {
  if (!stat) return <span />
  return (
    <p className={cn("flex min-w-0 flex-col items-center gap-0.5 text-center", STAT_MOTION)}>
      <span className={cn("font-numeric text-xl leading-6 font-bold tabular-nums", stat.tone === "optimal" ? "text-optimal" : stat.tone === "warning" ? "text-warning" : "text-foreground")}>
        {stat.value}
      </span>
      <span className="text-xs leading-4 font-bold tracking-[0.08em] text-balance text-muted-foreground uppercase">{stat.label}</span>
    </p>
  )
}

/**
 * DetailShell's collapsing header (spec §4.3a, docs/design/sticky.md B3-B5). At rest it is the plain detail bar.
 * Once the hero has scrolled under it, the title fades, back and info stay, and a 62 px row grows over the
 * content with the left stat, the hero's compact form and the right stat. The in-flow height never changes.
 */
export function CollapsingHeader({ compact, stats, ...row }: DetailHeaderProps & { compact: React.ReactNode; stats?: HeaderStats }) {
  const headerRef = React.useRef<HTMLElement>(null)
  const heroRef = React.useRef<HTMLElement | null>(null)
  // The hero renders in DetailShell's server body, not inside this island; find it before the observer starts.
  React.useLayoutEffect(() => {
    heroRef.current = document.querySelector<HTMLElement>(`[${COLLAPSE_HERO}]`)
  }, [])
  useHeroCollapse(headerRef, heroRef)

  return (
    <header ref={headerRef} data-state="top" className="group/ch pointer-events-none sticky top-0 z-20 pt-[env(safe-area-inset-top)] pb-6">
      {/* The page ground with the 24 px fade: row 1 at rest, rows 1 and 2 once collapsed. */}
      <div
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-[calc(100%+62px)] overflow-hidden mask-b-from-[calc(100%-24px)]", "-translate-y-[62px] group-data-[state=collapsed]/ch:translate-y-0", BAND_MOTION)}
      >
        <div className={cn("absolute inset-0", HEADER_FILL, "translate-y-[62px] group-data-[state=collapsed]/ch:translate-y-0", BAND_MOTION)} />
      </div>
      <div data-collapse-row className="relative">
        <DetailHeaderRow {...row} className="pointer-events-auto" centerClassName={CENTER_MOTION} />
        <div
          aria-hidden
          className="absolute inset-x-0 top-full grid h-[62px] grid-cols-[1fr_auto_1fr] grid-rows-[62px] items-center gap-2 px-4 group-data-[state=collapsed]/ch:pointer-events-auto md:mx-auto md:max-w-[720px] md:px-6"
        >
          <Stat stat={stats?.left} />
          <div className={cn("relative z-10 flex justify-center", HERO_MOTION)}>{compact}</div>
          <Stat stat={stats?.right} />
        </div>
      </div>
    </header>
  )
}
