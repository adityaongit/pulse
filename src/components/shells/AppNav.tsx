"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { HeartPulse, House, Menu, NotebookPen, Settings, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Mark } from "@/components/brand/Mark"
import { Wordmark } from "@/components/brand/Wordmark"
import { dayLabel } from "@/lib/format"
import { dayHref, parseDay, tabForPath, TAB_ROOT, type Tab } from "@/lib/url"
import { useShellCalendar } from "./ShellStatus"
import { DemoChip, SyncStatus } from "./TopBar"

const TABS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: "home", label: "Home", icon: House },
  { tab: "health", label: "Health", icon: HeartPulse },
  { tab: "journal", label: "Journal", icon: NotebookPen },
  { tab: "more", label: "More", icon: Menu },
]
const ROOTS = new Set(Object.values(TAB_ROOT))

/**
 * Glass bar material (spec §2.6), for chrome that floats over scrolling content only: tab bar, rail,
 * sidebar, round action. A labelled web approximation of iOS Liquid Glass: near-opaque gradient fill,
 * 12 px blur, lit top edge, faint rim, soft lower shadow. Opaque under reduced transparency.
 */
export const GLASS = "bg-linear-to-b from-glass-top to-glass-bottom backdrop-blur-md backdrop-saturate-150 shadow-glass ring-1 ring-glass-rim"
const PRESS = "transition-[color,scale] duration-150 ease-standard outline-none active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/50"
const ITEM_TONE = (active: boolean) => (active ? "text-foreground" : "text-muted-foreground hover:text-foreground-secondary")

/**
 * The active item's lens: one element that slides between items (150 ms), a soft pool of light that
 * is brightest at the item's lower edge, as sampled under WHOOP's active tab [latest-tabbar-1].
 */
function Lens({ index, axis, className }: { index: number; axis: "x" | "y"; className: string }) {
  return (
    <span
      aria-hidden
      style={{ "--tab": index } as React.CSSProperties}
      className={cn(
        "pointer-events-none absolute bg-radial-[ellipse_at_50%_115%] from-white/16 via-white/5 via-55% to-white/[0.02] transition-[translate,opacity] duration-150 ease-standard",
        axis === "x" ? "translate-x-[calc(var(--tab)*100%)]" : "translate-y-[calc(var(--tab)*(100%+4px))]",
        index < 0 && "opacity-0",
        className
      )}
    />
  )
}

/** Phone tab bar: a 62 px glass squircle with four destinations (spec §4.2, G1). */
function TabBar({ current }: { current: number }) {
  return (
    <nav aria-label="Primary" className={cn(GLASS, "relative h-[62px] min-w-0 flex-1 rounded-[22px] p-1")}>
      <Lens index={current} axis="x" className="inset-y-1 left-1 w-[calc((100%-8px)/4)] rounded-[18px]" />
      <ul className="relative grid h-full grid-cols-4">
        {TABS.map(({ tab, label, icon: Icon }, i) => (
          <li key={tab} className="min-w-0">
            <Link
              href={TAB_ROOT[tab]}
              aria-current={i === current ? "page" : undefined}
              className={cn(PRESS, ITEM_TONE(i === current), "flex h-full flex-col items-center justify-center gap-0.5 rounded-[18px] focus-visible:ring-inset")}
            >
              <Icon aria-hidden strokeWidth={1.6} className="size-[26px]" />
              <span className="text-[11px] leading-[13px] font-semibold">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Tablet rail, 88 px, floating (inferred, I2): the tab bar turned on its side. */
function Rail({ current }: { current: number }) {
  return (
    <nav aria-label="Primary" className={cn(GLASS, "fixed inset-y-3 left-3 z-30 hidden w-[88px] flex-col items-center rounded-[28px] py-4 md:flex xl:hidden")}>
      <Link href="/" aria-label="Pulse home" className={cn(PRESS, "mb-5 grid size-10 place-items-center rounded-full")}>
        <span aria-hidden>
          <Mark className="size-6" />
        </span>
      </Link>
      <ul className="relative flex flex-col gap-1">
        <Lens index={current} axis="y" className="inset-x-0 top-0 h-16 rounded-[20px]" />
        {TABS.map(({ tab, label, icon: Icon }, i) => (
          <li key={tab} className="relative">
            <Link
              href={TAB_ROOT[tab]}
              aria-current={i === current ? "page" : undefined}
              className={cn(PRESS, ITEM_TONE(i === current), "flex h-16 w-[72px] flex-col items-center justify-center gap-1 rounded-[20px]")}
            >
              <Icon aria-hidden strokeWidth={1.6} className="size-[26px]" />
              <span className="text-xs leading-4 font-semibold">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col items-center gap-3">
        <React.Suspense>
          <CheckInAction variant="rail" />
        </React.Suspense>
        <SyncStatus variant="icon" />
      </div>
    </nav>
  )
}

/** Laptop sidebar, 232 px, floating (inferred, I2), with Settings under a hairline. */
function Sidebar({ current, pathname }: { current: number; pathname: string }) {
  // Reports, Trends and the rest live in More (U21), so each destination is listed once.
  const extra = [{ href: "/settings", match: "/settings", label: "Settings", icon: Settings }]
  const extraActive = extra.some((e) => pathname.startsWith(e.match))
  const tab = extraActive ? -1 : current
  const item = (href: string, label: string, Icon: LucideIcon, active: boolean, lit = false) => (
    <li key={label} className="relative">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(PRESS, ITEM_TONE(active), "flex h-12 items-center gap-3 rounded-full px-4 text-[15px] leading-5 font-semibold", lit && "bg-glass-lens")}
      >
        <Icon aria-hidden strokeWidth={1.6} className="size-6 shrink-0" />
        {label}
      </Link>
    </li>
  )
  return (
    <nav aria-label="Primary" className={cn(GLASS, "fixed inset-y-3 left-3 z-30 hidden w-[232px] flex-col rounded-[28px] p-3 xl:flex")}>
      <Link
        href="/"
        aria-label="Pulse home"
        className="flex h-14 items-center rounded-full px-3 transition-[color] duration-150 ease-standard outline-none hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden className="flex items-center gap-2.5">
          <Mark className="size-7" />
          <Wordmark className="h-[17px]" />
        </span>
      </Link>
      <ul className="relative flex flex-col gap-1">
        <Lens index={tab} axis="y" className="inset-x-0 top-0 h-12 rounded-full" />
        {TABS.map((t, i) => item(TAB_ROOT[t.tab], t.label, t.icon, i === tab))}
      </ul>
      <div aria-hidden className="mx-3 my-2 h-px bg-white/8" />
      <ul className="flex flex-col gap-1">{extra.map((e) => item(e.href, e.label, e.icon, pathname.startsWith(e.match), pathname.startsWith(e.match)))}</ul>
      <div className="mt-auto space-y-3">
        <React.Suspense>
          <CheckInAction variant="sidebar" />
        </React.Suspense>
        <div className="space-y-1">
          <div className="px-3">
            <DemoChip />
          </div>
          <SyncStatus variant="line" />
        </div>
      </div>
    </nav>
  )
}

const ACTION_FACE = "bg-linear-to-b from-glass-action-top to-glass-action-bottom ring-1 ring-action-rim-from/25 transition-[scale,filter] duration-150 ease-standard outline-none hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"

/** WHOOP's ringed monogram: "P" in a 30 px circle with the indigo-to-blue rim. */
function Monogram() {
  return (
    <span
      aria-hidden
      className="grid size-[30px] shrink-0 place-items-center rounded-full border-[1.5px] border-transparent font-numeric text-[15px] leading-none font-bold [background:linear-gradient(var(--action-face),var(--action-face))_padding-box,linear-gradient(135deg,var(--action-rim-from),var(--action-rim-to))_border-box]"
    >
      P
    </span>
  )
}

/**
 * The "Check in" action (spec §4.2.1), WHOOP's coach button: indigo-rimmed glass with the "P" monogram. Opens the
 * journal check-in for the day on screen through `?checkin=1`. `float`: the round button over the content (phone).
 * `rail` and `sidebar`: the same action docked in the tablet rail and laptop sidebar, where floating over the content
 * column hid its right-hand controls (U18 G-02, D-L5).
 */
function CheckInAction({ variant }: { variant: "float" | "rail" | "sidebar" }) {
  const { today } = useShellCalendar()
  const params = useSearchParams()
  const { d } = parseDay(params.get("d") ?? undefined, today)
  const href = `${dayHref("/journal", d, today)}${d === today ? "?" : "&"}checkin=1`
  const label = `Check in for ${dayLabel(d, today)}`
  if (variant === "sidebar")
    return (
      <Link href={href} aria-label={label} className={cn(ACTION_FACE, "flex h-12 items-center gap-3 rounded-full pr-4 pl-2.5 text-[15px] leading-5 font-semibold")}>
        <Monogram />
        Check in
      </Link>
    )
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        ACTION_FACE,
        "grid shrink-0 place-items-center",
        variant === "rail" ? "size-14 rounded-[20px]" : "size-[62px] rounded-[22px] shadow-glass backdrop-blur-md backdrop-saturate-150"
      )}
    >
      <Monogram />
    </Link>
  )
}

/**
 * Navigation in three forms switched by CSS only (spec §4.2): the glass tab bar plus the round
 * action below 768 px (tab roots; detail screens show the action alone), the rail from 768 px and
 * the sidebar from 1280 px, each with the check-in action docked at its foot (D-L5).
 */
export function AppNav() {
  const pathname = usePathname()
  const index = TABS.findIndex((t) => t.tab === tabForPath(pathname))
  const root = ROOTS.has(pathname)
  return (
    <>
      <Rail current={index} />
      <Sidebar current={index} pathname={pathname} />
      <div className="pointer-events-none fixed inset-x-3 bottom-[max(calc(env(safe-area-inset-bottom)-6px),12px)] z-30 flex touch-manipulation justify-end gap-2 *:pointer-events-auto md:hidden">
        {root && (
          <div className="flex min-w-0 flex-1">
            <TabBar current={index} />
          </div>
        )}
        {!pathname.startsWith("/settings") && (
          <React.Suspense>
            <CheckInAction variant="float" />
          </React.Suspense>
        )}
      </div>
    </>
  )
}
