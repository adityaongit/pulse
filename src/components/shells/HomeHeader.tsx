"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { CircleUserRound, Flame } from "lucide-react"
import { cn } from "@/lib/utils"
import { BAND_WORD, recoveryBand } from "@/lib/bands"
import { formatValue } from "@/lib/format"
import { HEADER_SENTINEL, HIDE_AFTER_PX, nextHeaderState, type HeaderState } from "@/lib/header-state"
import { MiniRing, type MiniRingVariant } from "@/components/metrics/MiniRing"
import { DateSwitcher } from "./DateSwitcher"
import { useShellStatus } from "./ShellStatus"
import { HEADER_FADE, HEADER_FILL, SyncStatus } from "./TopBar"

export type HeaderRing = { value: number | null; href: string }
/** The day's three scores for the ring row (the dials' own view model), with their detail links. */
export type HeaderRings = Record<MiniRingVariant, HeaderRing>


const RING_ORDER: { key: MiniRingVariant; label: string }[] = [
  { key: "sleep", label: "Sleep" },
  { key: "recovery", label: "Recovery" },
  { key: "strain", label: "Strain" },
]

// Ring row and top row collapse with grid rows, so the header grows over the content, never pushing it.
const ROW_MOTION =
  "grid transition-[grid-template-rows,opacity,translate] duration-220 ease-out-expo motion-reduce:translate-y-0! motion-reduce:transition-[grid-template-rows,opacity] motion-reduce:duration-120"

function ringLabel(key: MiniRingVariant, label: string, value: number | null) {
  if (value === null) return `${label}: no score. Open ${label}`
  if (key === "recovery") return `Recovery ${formatValue("int", value)} percent, ${BAND_WORD[recoveryBand(value)].toLowerCase()}. Open Recovery`
  if (key === "sleep") return `Sleep performance ${formatValue("int", value)} percent. Open Sleep`
  return `Strain ${formatValue("decimal1", value)} of 21. Open Strain`
}

/** "{n}-day streak" pill, hidden on past days (WHOOP shows none there, [latest-home-pastday-1]). */
function Streak() {
  const { streak, today } = useShellStatus()
  const d = useSearchParams().get("d")
  if (!streak || (d && d !== today)) return null
  return (
    <span
      role="img"
      aria-label={`${streak.days}-day streak`}
      title="Days in a row with your band worn"
      className="-ml-1 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/[0.05] pr-3 pl-2.5"
    >
      <Flame aria-hidden className="size-4 fill-warning text-warning" strokeWidth={1.5} />
      <span className="font-numeric text-[17px] leading-5 font-bold tabular-nums">{streak.days}</span>
    </span>
  )
}

/**
 * Home's collapsing header (spec §4.3): `top` at rest; `rings` once the dials pass under it (mini
 * Sleep / Recovery / Strain rings fade and rise in); `rings-only` deep in the page while scrolling
 * down. One observer and one passive rAF-throttled scroll listener write `data-state`; CSS animates.
 */
export function HomeHeader({ rings }: { rings?: HeaderRings }) {
  const panel = React.useRef<HTMLDivElement>(null)
  const topRow = React.useRef<HTMLDivElement>(null)
  // The rings sweep in once per page view; afterwards they follow the dials (day changes) directly.
  const [revealed, setRevealed] = React.useState(false)

  React.useEffect(() => {
    const el = panel.current
    const top = topRow.current
    const sentinel = document.querySelector(`[${HEADER_SENTINEL}]`)
    if (!el || !top || !sentinel) return
    let state: HeaderState = "top"
    let dialsVisible = true
    let lastY = window.scrollY
    let anchor = lastY
    let dir = 0
    let frame = 0

    const update = () => {
      frame = 0
      const y = window.scrollY
      const d = Math.sign(y - lastY)
      if (d && d !== dir) {
        dir = d
        anchor = lastY
      }
      lastY = y
      const hideAfter = sentinel.getBoundingClientRect().top + y + HIDE_AFTER_PX
      let next = nextHeaderState({ prev: state, dialsVisible, y, dy: y - anchor, hideAfter })
      // Never hide a focused control.
      if (next === "rings-only" && top.contains(document.activeElement)) next = "rings"
      if (next === state) return
      state = next
      el.dataset.state = next
      if (next !== "top") setRevealed(true)
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const io = new IntersectionObserver(
      ([e]) => {
        dialsVisible = e.boundingClientRect.top > (e.rootBounds?.top ?? 0)
        schedule()
      },
      { rootMargin: `-${Math.round(top.getBoundingClientRect().bottom)}px 0px 0px 0px` }
    )
    io.observe(sentinel)
    window.addEventListener("scroll", schedule, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener("scroll", schedule)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    // In flow: the top row and its fade only. The panel over it grows into the content when the rings show.
    <header className="sticky top-0 z-20 h-[calc(env(safe-area-inset-top)+68px)] md:h-[calc(env(safe-area-inset-top)+76px)]">
      <h1 className="sr-only">Home</h1>
      <div
        ref={panel}
        data-state="top"
        className={cn("group/hdr pointer-events-none absolute inset-x-0 top-0 pt-[env(safe-area-inset-top)] *:pointer-events-auto", HEADER_FILL, HEADER_FADE)}
      >
        <div
          className={cn(
            ROW_MOTION,
            "grid-rows-[1fr] group-data-[state=rings-only]/hdr:-translate-y-full group-data-[state=rings-only]/hdr:grid-rows-[0fr] group-data-[state=rings-only]/hdr:opacity-0"
          )}
        >
          <div ref={topRow} className="min-h-0 overflow-hidden transition-[visibility] duration-220 group-data-[state=rings-only]/hdr:invisible">
            <div className="grid h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 md:h-13 md:px-6 xl:px-8">
              <div className="flex min-w-0 items-center">
                <Link
                  href="/more"
                  aria-label="More and settings"
                  className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full bg-background-top transition-[scale,color] duration-150 ease-standard outline-none after:absolute after:-inset-1.5 hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
                >
                  <CircleUserRound aria-hidden className="size-7" strokeWidth={1.5} />
                </Link>
                <React.Suspense>
                  <Streak />
                </React.Suspense>
              </div>
              <DateSwitcher mode="day" />
              <div className="-mr-0.5 flex min-w-0 justify-end">
                <SyncStatus />
              </div>
            </div>
          </div>
        </div>
        <div
          className={cn(
            ROW_MOTION,
            "grid-rows-[1fr] group-data-[state=top]/hdr:translate-y-1.5 group-data-[state=top]/hdr:grid-rows-[0fr] group-data-[state=top]/hdr:opacity-0"
          )}
        >
          <nav aria-label="Today's scores" className="min-h-0 overflow-hidden transition-[visibility] duration-220 group-data-[state=top]/hdr:invisible">
            <ul className="grid h-10 grid-cols-3 items-center px-4 md:px-6 xl:px-8">
              {RING_ORDER.map(({ key, label }) => {
                const ring = rings?.[key]
                const value = ring?.value ?? null
                return (
                  <li key={key} className="flex justify-center">
                    <Link
                      href={ring?.href ?? `/${key}`}
                      aria-label={ringLabel(key, label, value)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-2 transition-[scale,color] duration-150 ease-standard outline-none hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
                    >
                      <MiniRing variant={key} value={value} fill={revealed} />
                      <span className="text-[13px] leading-4 font-bold tracking-[0.1em] uppercase">{label}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  )
}
