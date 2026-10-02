"use client"

import * as React from "react"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import { ago, clock } from "@/lib/format"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-now"
import { useShellStatus, type ShellStatus } from "./ShellStatus"

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

/** The 8 px status dot; also used bare in the sidebar footer. */
export function SyncDot({ className }: { className?: string }) {
  const s = useShellStatus()
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", syncView(s, null).dot, className)} />
}

/** Sync status: a 44 px ghost button with the dot, opening a popover (spec §4.3). */
export function SyncStatus({ withLabel = false }: { withLabel?: boolean }) {
  const s = useShellStatus()
  const nowMs = useNow()
  const v = syncView(s, nowMs)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={withLabel ? "default" : "icon-touch"}
          aria-label={v.label}
          className={cn(withLabel && "h-11 w-full justify-start gap-2.5 px-3 text-sm font-semibold text-sidebar-foreground")}
        >
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", v.dot)} />
          {withLabel && <span className="truncate">{v.label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1.5 rounded-2xl p-4 shadow-[0_12px_32px_rgb(0_0_0/0.5)] ring-border">
        <p className="text-base leading-[22px] font-semibold">Sync</p>
        <p className="text-[15px] leading-[22px] text-foreground-secondary tabular-nums">{v.line}</p>
        {s.mode === "demo" && (
          <p className="text-xs leading-4 font-medium text-muted-foreground">Demo data refreshes every 15 minutes</p>
        )}
        <Link
          href="/settings#sync"
          className="mt-1 w-fit rounded-md py-1 text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Sync settings
        </Link>
      </PopoverContent>
    </Popover>
  )
}

/** "Demo data" chip, shown only in demo mode. */
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
          {/* The label shows when the top bar's left column has room for it (long dates on a phone do not). */}
          <span className="sr-only @[6.75rem]:not-sr-only">Demo data</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">You&apos;re looking at generated demo data.</TooltipContent>
    </Tooltip>
  )
}

/** The sticky top-bar frame shared by TopBar and DetailHeader. */
export function TopBarFrame({ left, center, right, below }: { left?: React.ReactNode; center: React.ReactNode; right: React.ReactNode; below?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 bg-background-top pt-[env(safe-area-inset-top)]">
      <div className="grid h-13 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 md:h-14 md:px-6 xl:px-8">
        <div className="@container flex min-w-0 items-center justify-start">{left}</div>
        <div className="flex min-w-0 flex-col items-center">{center}</div>
        <div className="flex min-w-0 items-center justify-end -mr-2.5">{right}</div>
      </div>
      {below}
    </header>
  )
}

/** Tab-root top bar: demo chip, centre content (title or DateSwitcher), sync status. */
export function TopBar({ children }: { children: React.ReactNode }) {
  return <TopBarFrame left={<DemoChip />} center={children} right={<SyncStatus />} />
}
