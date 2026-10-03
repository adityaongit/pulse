"use client"

import * as React from "react"
import { FlaskConical } from "lucide-react"
import { BandIcon } from "@/components/brand/BandIcon"
import { useSyncing } from "@/lib/sync-activity"
import { cn } from "@/lib/utils"
import { COLUMN_WIDTH } from "./column"
import { ago, agoShort, clock } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-now"
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher"
import { SyncNowButton } from "./SyncNowButton"
import { useShellStatus, type ShellStatus } from "./ShellStatus"

// The pieces every header shares (spec §4.3, §4.4): the ground fill, the 24 px fade, sync status.

/** Header fill: the page ground at viewport size, so a header pinned to the top lines up with the fixed ground (C2). */
export const HEADER_FILL = "bg-(image:--page-ground) bg-no-repeat [background-size:100%_100vh]"
/** The lower 24 px fade content scrolls into. No blur: WHOOP fades, it does not frost. */
export const HEADER_FADE = "pb-6 mask-b-from-[calc(100%-24px)]"
/** Detail header title, date pill label and tab-root title roles (spec §3.4). */
// 12 px: WHOOP's bar titles measure an 8-9 pt cap height across eight captures (spec §11 F13).
export const HEADER_TITLE = "text-xs leading-5 font-bold tracking-[0.1em] uppercase"

type SyncView = { dot: string; label: string; line: string }

function syncView(s: ShellStatus, nowMs: number | null): SyncView {
  const last = s.sync.lastSuccessAt
  const rel = last && nowMs ? ago(last, nowMs) : null
  const at = last ? clock(last, s.timeZone) : null
  if (s.connection === "auth_revoked" || s.sync.state === "error")
    return { dot: "bg-recovery-red", label: "Sync failed", line: at ? `Sync failed. Last success ${at}` : "Sync failed" }
  if (s.sync.state === "syncing") return { dot: "bg-coach animate-pulse motion-reduce:animate-none", label: "Syncing", line: "Syncing now" }
  if (s.sync.state === "stale")
    return { dot: "bg-warning", label: rel ? `Last sync ${rel}` : "Sync is behind", line: at ? `Last sync ${at}` : "Sync is behind" }
  return { dot: "bg-optimal", label: rel ? `Synced ${rel}` : "Synced", line: at ? `Last sync ${at}` : "Synced" }
}

/**
 * The Fitbit Air band in WHOOP's battery slot (spec §4.3.2): steady, a status dot; syncing, two blue arcs turning
 * around it in place of the dot (still under reduced motion, where the arcs alone say it).
 */
function Band({ dot, syncing }: { dot: string; syncing: boolean }) {
  return (
    <span aria-hidden className="relative grid size-6 place-items-center">
      <BandIcon className="size-[22px]" />
      {syncing ? (
        <svg viewBox="0 0 36 36" className="absolute -inset-1.5 size-9 text-strain-text motion-safe:animate-spin motion-safe:[animation-duration:1.4s]">
          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="1.8" />
          {/* Two 25-unit arcs opposite each other on a 100.5-unit circumference. */}
          <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="25 25.3" />
        </svg>
      ) : (
        <span className={cn("absolute -top-0.5 -right-0.5 size-2 rounded-full ring-2 ring-background-top", dot)} />
      )}
    </span>
  )
}

const SYNC_TRIGGER =
  "relative inline-flex items-center gap-1.5 rounded-full text-foreground transition-[color,scale] duration-150 ease-standard outline-none hover:text-foreground-secondary focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"

/**
 * Sync freshness in WHOOP's battery slot: "12m" or "Demo", the band icon and a status dot, opening
 * the sync popover. `icon` drops the text (rail); `line` is the sidebar footer's full sentence.
 */
export function SyncStatus({ variant = "header" }: { variant?: "header" | "icon" | "line" }) {
  const s = useShellStatus()
  const nowMs = useNow()
  const syncing = useSyncing() || s.sync.state === "syncing"
  const v = syncView(syncing ? { ...s, sync: { ...s.sync, state: "syncing" } } : s, nowMs)
  const short = s.mode === "demo" ? "Demo" : s.sync.lastSuccessAt && nowMs ? agoShort(s.sync.lastSuccessAt, nowMs) : ""
  return (
    <Popover>
      <PopoverTrigger
        aria-label={s.mode === "demo" ? `Demo data. ${v.label}` : v.label}
        className={cn(
          SYNC_TRIGGER,
          variant === "line" ? "h-11 w-full gap-2.5 px-3 hover:bg-white/5" : variant === "icon" ? "size-11 justify-center" : "h-11 min-w-11 justify-end pr-0.5 pl-2"
        )}
      >
        {variant === "line" ? (
          <>
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", v.dot)} />
            <span className="truncate text-xs leading-4 font-medium text-muted-foreground">{v.label}</span>
          </>
        ) : (
          <>
            {variant === "header" && (
              // Reserves the text width before hydration fills in the relative age.
              // Home's top row may hide it on narrow phones (`data-sync-text`); the band, its dot, the popover and the accessible name still carry it.
              <span data-sync-text className="min-w-[3ch] text-right font-numeric text-[15px] leading-5 font-semibold text-muted-foreground tabular-nums">
                {short}
              </span>
            )}
            <Band dot={v.dot} syncing={syncing} />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        side={variant === "line" ? "top" : variant === "icon" ? "right" : "bottom"}
        align={variant === "header" ? "end" : "start"}
        sideOffset={8}
        collisionPadding={12}
        // Focus stays on the trigger: moving it in would ring the first button on a mouse open.
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-72 gap-0 p-0"
      >
        <div className="flex items-center gap-3 p-4">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/[0.06]">
            <BandIcon className="size-5" strokeWidth={1.4} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] leading-5 font-semibold">{s.mode === "demo" ? "Demo data" : "Google Health"}</p>
            <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", v.dot)} />
              {v.line}
            </p>
          </div>
        </div>
        {s.mode === "demo" && <p className="-mt-2 px-4 pb-3 text-[13px] leading-[18px] text-muted-foreground">Generated data, refreshed every 15 minutes.</p>}
        {/* Settings is one tap away in the sidebar and in More; the popover only does the one thing. */}
        <div className="border-t border-white/[0.06] p-3">
          <SyncNowButton size="sm" className="w-full" />
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** "Demo data" chip for the laptop sidebar footer, shown only in demo mode. */
export function DemoChip() {
  const s = useShellStatus()
  if (s.mode !== "demo") return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          tabIndex={0}
          className="h-6 gap-1 rounded-full border-border px-2.5 text-[11px] font-bold tracking-[0.08em] text-foreground-secondary uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FlaskConical aria-hidden strokeWidth={1.75} className="size-3!" />
          Demo data
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top">You&apos;re looking at generated demo data.</TooltipContent>
    </Tooltip>
  )
}

/**
 * The sticky header frame: ground fill, safe area, a 24 px fade at the bottom. The fade passes taps
 * through to the content under it; only the rows take pointer events.
 */
export function HeaderFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <header
      className={cn("pointer-events-none sticky top-0 z-20 pt-[env(safe-area-inset-top)] *:pointer-events-auto", HEADER_FILL, HEADER_FADE, className)}
    >
      {children}
    </header>
  )
}

/** A three-slot header row: left, centred title, right. */
export function HeaderRow({ left, center, right, className }: { left?: React.ReactNode; center: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid h-13 grid-cols-[1fr_auto_1fr] items-center gap-2 px-2 md:h-14 md:px-4", className)}>
      <div className="flex min-w-0 items-center justify-start">{left}</div>
      <div className="flex min-w-0 flex-col items-center">{center}</div>
      <div className="flex min-w-0 items-center justify-end">{right}</div>
    </div>
  )
}

/** Health, Journal and More (spec §4.3 "Other tab roots"): centred title, sync status, optional date pill under it. */
export function TitleHeader({ title, dateSwitcher }: { title: string; dateSwitcher?: DateSwitcherProps }) {
  return (
    <HeaderFrame>
      <HeaderRow center={<h1 className={cn(HEADER_TITLE, "truncate")}>{title}</h1>} right={<SyncStatus />} className={cn("h-11 px-4 md:h-13 md:px-6 xl:px-8", COLUMN_WIDTH)} />
      {dateSwitcher && (
        <div className="flex justify-center pt-1">
          <DateSwitcher {...dateSwitcher} />
        </div>
      )}
    </HeaderFrame>
  )
}
