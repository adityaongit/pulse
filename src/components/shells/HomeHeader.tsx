"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"
import { UserAvatar } from "./UserAvatar"
import { COLUMN_WIDTH } from "./column"
import { BAND_WORD, recoveryBand } from "@/lib/bands"
import { clamp01, collapseProgress, lerp, timelineOffset } from "@/lib/collapse"
import { formatValue } from "@/lib/format"
import { HEADER_SENTINEL, HOME_DIALS, nextHeaderState, type HeaderState } from "@/lib/header-state"
import { useMediaQuery, useReducedMotion } from "@/hooks/use-reduced-motion"
import { MiniRing, type MiniRingVariant } from "@/components/metrics/MiniRing"
import { DateSwitcher } from "./DateSwitcher"
import { useShellStatus } from "./ShellStatus"
import { HEADER_FILL, SyncStatus } from "./TopBar"

export type HeaderRing = { value: number | null; href: string }
/** The day's three scores for the ring row (the dials' own view model), with their detail links. */
export type HeaderRings = Record<MiniRingVariant, HeaderRing>

const RING_ORDER: { key: MiniRingVariant; label: string }[] = [
  { key: "sleep", label: "Sleep" },
  { key: "recovery", label: "Recovery" },
  { key: "strain", label: "Strain" },
]

/** How far the band can grow under the top row: more than the tallest dial row (120 px dials, labels, tags). */
const BAND_MAX = 320
/** Collapse progress samples: extras are gone by 0.35, values fade 0.35 → 0.7, the label path curves between. */
const STOPS = [0, 0.2, 0.35, 0.5, 0.7, 0.85, 1]
/** Content edges: the full width on phone and tablet, the 1120 px content column from 1280. */
const ROW_EDGES = cn("px-4 md:px-6 xl:px-8", COLUMN_WIDTH)

// Time-based fallback for the discrete state (laptop, reduced motion): the band snaps or eases, the ring row fades.
// While the scroll-linked morph runs (`data-morph`), Web Animations own these properties and transitions stay off.
const BAND_MOTION =
  "transition-[translate] duration-220 ease-out-expo motion-reduce:transition-none group-data-[morph]/hdr:transition-none"
const RING_ROW_MOTION =
  "translate-y-1.5 opacity-0 transition-[opacity,translate] duration-220 ease-out-expo group-data-[state=rings]/hdr:translate-y-0 group-data-[state=rings]/hdr:opacity-100 motion-reduce:translate-y-0 motion-reduce:duration-120 group-data-[morph]/hdr:translate-y-0 group-data-[morph]/hdr:transition-none"

function ringLabel(key: MiniRingVariant, label: string, value: number | null) {
  if (value === null) return `${label}: no score. Open ${label}`
  if (key === "recovery") return `Recovery ${formatValue("int", value)} percent, ${BAND_WORD[recoveryBand(value)].toLowerCase()}. Open Recovery`
  if (key === "sleep") return `Sleep performance ${formatValue("int", value)} percent. Open Sleep`
  return `Strain ${formatValue("decimal1", value)} of 21. Open Strain`
}

/**
 * WHOOP's streak flame: the emoji-like two-tone fire, a red-orange body lit toward its tip with an orange-yellow core
 * (sampled from the user's capture: tip #ff784c, body #ff6538, edge #ee4e33, core #ff9862). Sized by the row's --u.
 */
function StreakFlame() {
  const id = React.useId()
  return (
    <svg aria-hidden viewBox="0 0 20 24" className="h-[calc(var(--u)*20px)] w-auto shrink-0">
      <defs>
        <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff8a52" />
          <stop offset="0.45" stopColor="#ff6538" />
          <stop offset="1" stopColor="#ee4e33" />
        </linearGradient>
        <linearGradient id={`${id}-core`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffc56e" />
          <stop offset="1" stopColor="#ff9862" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id}-body)`}
        d="M10.4 0.6c.6 3.8 3.2 5.6 5.1 8.3 1.6 2.3 2.5 4.6 2.5 7.2 0 4.6-3.6 7.6-8 7.6s-8-3-8-7.4c0-3 1.4-5.2 3-7 .3 1.6 1 2.8 2.1 3.5-.3-3.6.9-6.6 3.3-12.2z"
      />
      <path fill={`url(#${id}-core)`} d="M10.2 11.4c.5 2 2 2.9 2.9 4.4.6 1 .9 1.9.9 2.9 0 2.3-1.8 3.9-4 3.9s-4-1.5-4-3.7c0-1.6.8-2.7 1.8-3.6.2.8.6 1.4 1.1 1.7-.1-2 .3-3.7 1.3-5.6z" />
    </svg>
  )
}

/** "{n}-day streak" pill, hidden on past days (WHOOP shows none there, [latest-home-pastday-1]). */
function Streak() {
  const { streak, today } = useShellStatus()
  const d = useSearchParams().get("d")
  if (!streak || (d && d !== today)) return null
  return (
    <span
      role="img"
      data-streak
      aria-label={`${streak.days}-day streak`}
      title="Days in a row with your band worn"
      // Starts under the avatar (its 3 px page-colour ring plus 16 of its 40 px), so the avatar sits on the pill's left
      // end (spec §11 M6). Every size is a multiple of --u, which the row steps down on narrow phones (M4, M6).
      className="-ml-[calc(var(--u)*19px)] inline-flex h-[calc(var(--u)*36px)] shrink-0 items-center gap-[calc(var(--u)*10px)] rounded-full bg-white/[0.045] pr-[calc(var(--u)*12px)] pl-[calc(var(--u)*32px)]"
    >
      <StreakFlame />
      <span className="font-numeric text-[length:calc(var(--u)*17px)] leading-none font-bold tabular-nums">{streak.days}</span>
    </span>
  )
}

/**
 * The avatar: the uploaded or Google photo, else the outline person icon (src/server/avatar.ts). Both sit on a disc ringed in the page colour, over the streak pill (M6).
 */
function Avatar() {
  const { avatar } = useShellStatus()
  return (
    // The 3 px ring is the page ground itself (the header's own fill), so it cuts the pill exactly where WHOOP's does.
    <Link
      href="/more"
      aria-label="More and settings"
      className={cn(
        HEADER_FILL,
        "relative z-10 -ml-[calc(var(--u)*3px)] grid size-[calc(var(--u)*46px)] shrink-0 place-items-center rounded-full p-[calc(var(--u)*3px)] after:absolute after:-inset-[max(0px,calc((44px-var(--u)*46px)/2))] transition-[scale,color] duration-150 ease-standard outline-none hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
      )}
    >
      <UserAvatar src={avatar} />
    </Link>
  )
}

type El = HTMLElement
const box = (el: Element) => el.getBoundingClientRect()
const cx = (r: DOMRect) => r.left + r.width / 2
const cy = (r: DOMRect) => r.top + r.height / 2
const px = (x: number, y: number) => `${x}px ${y}px`

declare const ScrollTimeline: { new (o: { source: Element; axis?: "block" }): AnimationTimeline } | undefined

/**
 * Builds the dial-to-ring morph as keyframes on the page's scroll range (WHOOP, [latest-home-collapsed-4], -5).
 * Over the collapse distance (the dials' top reaching the top row, then their labels passing under the ring
 * row) each ring and label stays pinned under the top row while it moves and scales onto its mini ring and
 * label; the chevrons and tags fade first, the values next, and at the end the header's ring row takes over in
 * place. The band's bottom edge moves 1:1 with the scroll, so the content stays right under it with no gap.
 * Every translate is linear in scroll, so the pin is exact; only translate, scale and opacity animate.
 */
function morphKeyframes(dials: El, header: El, ringRow: El, band: El, fill: El, g: { start: number; end: number; max: number }) {
  const { start, end, max } = g
  const D = end - start
  const y = window.scrollY
  const o = (p: number) => timelineOffset(p, start, end, max)
  const out: [El, Keyframe[]][] = []
  // Piecewise linear in p, sampled at STOPS; `after` is what holds once docked (the hand-off).
  const add = (el: El, at: (p: number) => Keyframe, after?: Keyframe) => {
    const kf: Keyframe[] = [{ ...at(0), offset: 0 }, ...STOPS.map((p) => ({ ...at(p), offset: o(p) }))]
    if (after) kf.push({ ...at(1), ...after, offset: o(1) })
    kf.push({ ...at(1), ...after, offset: 1 })
    out.push([el, kf])
  }

  for (const { key } of RING_ORDER) {
    const dial = dials.querySelector(`[data-dial="${key}"]`)
    const part = (name: string) => dial?.querySelector<El>(`[data-dial-part="${name}"]`) ?? null
    const [ring, value, below, label] = [part("ring"), part("value"), part("below"), part("label")]
    const toRing = header.querySelector(`[data-ring="${key}"]`)
    const toLabel = header.querySelector<El>(`[data-ring-label="${key}"]`)
    if (!ring || !below || !label || !toRing || !toLabel) continue

    // Pinned: the element's viewport position at `start` moves to the target as p goes 0 → 1, against the scroll.
    const s = box(ring)
    const t = box(toRing)
    const ringX = cx(t) - cx(s)
    const ringY = D + cy(t) - (cy(s) + y - start)
    const k = t.width / s.width
    add(ring, (p) => ({ translate: px(p * ringX, p * ringY), scale: `${lerp(1, k, p)}`, opacity: "1" }), { opacity: "0" })
    if (value) add(value, (p) => ({ opacity: `${clamp01((0.7 - p) / 0.35)}` }))

    // The label row scales about its text's left edge, so the text lands on the mini ring's label.
    const b = box(below)
    const l = box(label)
    const tl = box(toLabel)
    below.style.transformOrigin = px(l.left - b.left, cy(l) - b.top)
    const labelX = tl.left - l.left
    const labelY = cy(tl) - (cy(l) + y - start)
    const ks = parseFloat(getComputedStyle(toLabel).fontSize) / parseFloat(getComputedStyle(label).fontSize)
    // Sideways first, up late, so the label clears its shrinking ring ([latest-home-collapsed-4] 11.7 s); the pin stays linear.
    const side = (p: number) => 1 - (1 - p) ** 2
    add(below, (p) => ({ translate: px(side(p) * labelX, p * D + p * p * labelY), scale: `${lerp(1, ks, p)}`, opacity: "1" }), { opacity: "0" })
    for (const extra of dial!.querySelectorAll<El>(`[data-dial-part="extra"]`)) add(extra, (p) => ({ opacity: `${clamp01(1 - p / 0.35)}` }))
  }

  // The band (page ground + fade) grows from the top row to the dials' bottom at the start, then shrinks with them
  // to the ring row. A reveal: the clip moves, the fill inside counter-moves so the ground stays put.
  const rowH = box(ringRow).height
  const shift = (e: number) => Math.min(e, BAND_MAX) - BAND_MAX
  const bandKf = (sign: 1 | -1): Keyframe[] => [
    { translate: px(0, sign * shift(0)), offset: 0 },
    { translate: px(0, sign * shift(0)), offset: o(0) },
    { translate: px(0, sign * shift(D + rowH)), offset: o(0) },
    { translate: px(0, sign * shift(rowH)), offset: o(1) },
    { translate: px(0, sign * shift(rowH)), offset: 1 },
  ]
  out.push([band, bandKf(1)], [fill, bandKf(-1)])
  add(ringRow, () => ({ opacity: "0" }), { opacity: "1" })
  return out
}

/**
 * Home's collapsing header (spec §4.3). The top row always stays. Below 1280 px the dials shrink in place
 * into the mini Sleep / Recovery / Strain ring row as you scroll, tied to the scroll position (it holds
 * halfway and reverses). The animations run on a ScrollTimeline, off the main thread; without one, one
 * passive rAF-throttled scroll listener drives the same keyframes. Laptop and reduced motion keep the
 * discrete swap: the ring row fades in once the dials have passed under the top row.
 */
export function HomeHeader({ rings }: { rings?: HeaderRings }) {
  const panel = React.useRef<HTMLDivElement>(null)
  const topRow = React.useRef<HTMLDivElement>(null)
  const ringRow = React.useRef<HTMLElement>(null)
  const band = React.useRef<HTMLDivElement>(null)
  const fill = React.useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const wide = useMediaQuery("(min-width: 1280px)")

  React.useEffect(() => {
    const header = panel.current
    const top = topRow.current
    const row = ringRow.current
    const bandEl = band.current
    const fillEl = fill.current
    const dials = document.querySelector<HTMLElement>(`[${HOME_DIALS}]`)
    const sentinel = document.querySelector(`[${HEADER_SENTINEL}]`)
    if (!header || !top || !row || !bandEl || !fillEl || !dials || !sentinel) return

    const root = document.scrollingElement ?? document.documentElement
    const morph = !reduced && !wide
    const timeline = morph && typeof ScrollTimeline === "function" ? new ScrollTimeline({ source: root }) : null
    let g = { start: 0, end: 0, max: 0 }
    let anims: Animation[] = []
    let state: HeaderState | null = null
    let raf = 0
    let remeasure = 0
    let disposed = false

    const setState = (next: HeaderState) => {
      if (next === state) return
      state = next
      header.dataset.state = dials.dataset.state = next
      // Inert while hidden, unless focus is already inside (keyboard users scrolling back keep their place).
      row.inert = next === "top" && !row.contains(document.activeElement)
    }
    const update = () => {
      raf = 0
      const y = window.scrollY
      setState(nextHeaderState(collapseProgress(y, g.start, g.end)))
      if (!timeline && g.max > 0) for (const a of anims) a.currentTime = (clamp01(y / g.max) * 1000)
    }
    const onScroll = () => {
      raf ||= requestAnimationFrame(update)
    }
    const measure = () => {
      remeasure = 0
      for (const a of anims) a.cancel() // measure the untransformed layout
      anims = []
      const H = box(top).bottom
      const y = window.scrollY
      // Morph: the labels end under the ring row, where the band's edge meets them. Swap: under the top row.
      const dock = morph ? H + box(row).height : H
      g = { start: box(dials).top + y - H, end: box(sentinel).top + y - dock, max: root.scrollHeight - root.clientHeight }
      if (morph && g.end > g.start && g.max > 0)
        anims = morphKeyframes(dials, header, row, bandEl, fillEl, g).map(([el, kf]) => {
          const a = el.animate(kf, timeline ? { timeline, fill: "both" } : { duration: 1000, fill: "both" })
          if (!timeline) a.pause()
          return a
        })
      update()
    }
    const schedule = () => {
      if (disposed) return
      cancelAnimationFrame(remeasure)
      remeasure = requestAnimationFrame(measure)
    }
    const onFocusOut = () => setTimeout(() => (row.inert = state === "top" && !row.contains(document.activeElement)))

    if (morph) header.dataset.morph = dials.dataset.morph = ""
    measure()
    const ro = new ResizeObserver(schedule)
    ro.observe(document.body)
    ro.observe(dials)
    window.addEventListener("resize", schedule)
    window.addEventListener("scroll", onScroll, { passive: true })
    row.addEventListener("focusout", onFocusOut)
    document.fonts?.ready.then(schedule)
    return () => {
      disposed = true
      ro.disconnect()
      window.removeEventListener("resize", schedule)
      window.removeEventListener("scroll", onScroll)
      row.removeEventListener("focusout", onFocusOut)
      cancelAnimationFrame(raf)
      cancelAnimationFrame(remeasure)
      for (const a of anims) a.cancel()
      delete header.dataset.morph
      delete dials.dataset.morph
      dials.querySelectorAll<HTMLElement>(`[data-dial-part="below"]`).forEach((el) => el.style.removeProperty("transform-origin"))
    }
  }, [reduced, wide])

  return (
    // In flow: the top row and its fade only. Everything that grows does so over the content, never pushing it.
    <header className="sticky top-0 z-20 h-[calc(env(safe-area-inset-top)+68px)] md:h-[calc(env(safe-area-inset-top)+76px)]">
      <h1 className="sr-only">Home</h1>
      <div ref={panel} data-state="top" className="group/hdr pointer-events-none absolute inset-x-0 top-0 pt-[env(safe-area-inset-top)]">
        {/* The page ground with the 24 px fade, as a reveal: it covers the top row at rest and grows under it. */}
        <div
          ref={band}
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-[calc(100%+344px)] overflow-hidden mask-b-from-[calc(100%-24px)]", "-translate-y-80 group-data-[state=rings]/hdr:-translate-y-70", BAND_MOTION)}
        >
          <div ref={fill} className={cn("absolute inset-0", HEADER_FILL, "translate-y-80 group-data-[state=rings]/hdr:translate-y-70", BAND_MOTION)} />
        </div>
        <div className="relative">
          {/* Equal side tracks keep the pill centred; each is at least its content, so if a side ever outgrows its half
              the pill shifts over rather than anything overlapping it. Below 400 px the streak and pill tighten; below
              380 px, on days without the streak (past days, whose labels run to "Mon, Sep 28"), the sync text gives way
              so the pill still fits centred (spec §11 M4). */}
          <div
            ref={topRow}
            className={cn(
              "pointer-events-auto grid h-11 grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] items-center gap-1 min-[400px]:gap-2 md:h-13",
              "max-[380px]:[&:not(:has([data-streak]))_[data-sync-text]]:hidden",
              ROW_EDGES
            )}
          >
            {/* --u scales the avatar and streak pill as one (spec §11 M6). The avatar (photo or outline icon) tops out near the
                date pill's height (about 34 px)
                and steps down on narrower phones so the pair fits its half of the row and the pill stays centred (M4). */}
            <div className="flex items-center [--u:0.64] min-[356px]:[--u:0.7] min-[400px]:[--u:0.76] md:[--u:0.72]">
              <Avatar />
              <React.Suspense>
                <Streak />
              </React.Suspense>
            </div>
            <DateSwitcher mode="day" narrow />
            <div className="-mr-0.5 flex justify-end">
              <SyncStatus />
            </div>
          </div>
          <nav ref={ringRow} inert aria-label="Today's scores" className={cn("absolute inset-x-0 top-full group-data-[state=rings]/hdr:pointer-events-auto", RING_ROW_MOTION)}>
            <ul className={cn("grid h-10 grid-cols-3 items-center", ROW_EDGES)}>
              {RING_ORDER.map(({ key, label }) => {
                const ring = rings?.[key]
                const value = ring?.value ?? null
                return (
                  <li key={key} className="flex justify-center">
                    <Link
                      href={ring?.href ?? `/${key}`}
                      aria-label={ringLabel(key, label, value)}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-full px-2 max-[380px]:gap-1.5 transition-[scale,color] duration-150 ease-standard outline-none hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:scale-[0.96]"
                    >
                      <span data-ring={key} className="block">
                        <MiniRing variant={key} value={value} />
                      </span>
                      {/* 11 px, WHOOP's ring-row label ("RECOVERY" 62 pt wide) [latest-home-sticky-header-user-2025] (spec §11 F5); below 380 px the tracking tightens so "Recovery" clears the Strain ring down to 320 px. */}
                      <span data-ring-label={key} className="text-[11px] leading-4 font-bold tracking-[0.1em] uppercase max-[380px]:tracking-[0.06em]">
                        {label}
                      </span>
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
