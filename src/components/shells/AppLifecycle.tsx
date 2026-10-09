"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useOnline } from "@/hooks/use-online"
import { haptic } from "@/lib/haptics"
import { flushQueue } from "@/lib/offline-queue"
import { syncNow, useSyncing } from "@/lib/sync-activity"
import { useShellRecheck, useShellStatus } from "./ShellStatus"

/** Away this long, coming back asks the server for news (ShellStatusProvider.recheck): an installed app stays alive for days. */
const STALE_MS = 5 * 60_000
/** Pull distance (px of finger travel is halved) that starts a sync, and the most the indicator follows. */
const TRIGGER = 64
const MAX = 96

/** Is the touch inside something scrolled down (a chat, a sheet)? Then a downward drag scrolls it, not the page. */
function inScrolledBox(el: EventTarget | null) {
  for (let n = el instanceof Element ? el : null; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n)
    if ((overflowY === "auto" || overflowY === "scroll") && n.scrollHeight > n.clientHeight && n.scrollTop > 0) return true
  }
  return false
}

/**
 * The app's lifecycle, as an installed app expects it (mounted in AppShell, so signed-in screens only):
 * - back in the foreground after a while: ask the server for news (a refresh only when scores changed or a new day
 *   began, since every screen renders from stored scores), check for a new build, clear the app badge;
 * - connection back: send check-in answers saved offline;
 * - pull down at the top of a screen: sync (the browser's own pull-to-refresh is off, `overscroll-behavior: none`).
 */
export function AppLifecycle() {
  const router = useRouter()
  const online = useOnline()
  const syncing = useSyncing()
  const { userId } = useShellStatus()
  const recheck = useShellRecheck()
  const [pull, setPull] = React.useState(0)

  React.useEffect(() => {
    const flush = () =>
      userId !== undefined &&
      flushQueue(userId).then((n) => {
        if (n > 0) {
          router.refresh()
          toast.success("Check-in sent")
        }
      })
    flush()
    let hiddenAt = 0
    const onVisible = () => {
      if (document.visibilityState === "hidden") return void (hiddenAt = Date.now())
      navigator.clearAppBadge?.().catch(() => {})
      flush()
      if (hiddenAt && Date.now() - hiddenAt > STALE_MS) {
        void recheck()
        navigator.serviceWorker?.getRegistration().then((r) => r?.update())
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    addEventListener("online", flush)
    navigator.clearAppBadge?.().catch(() => {})
    return () => {
      document.removeEventListener("visibilitychange", onVisible)
      removeEventListener("online", flush)
    }
  }, [router, userId, recheck])

  React.useEffect(() => {
    if (!online || !matchMedia("(pointer: coarse)").matches) return
    let y0: number | null = null
    let dist = 0
    const start = (e: TouchEvent) => {
      const blocked = e.touches.length !== 1 || scrollY > 0 || document.querySelector('[role="dialog"]') || inScrolledBox(e.target)
      y0 = blocked ? null : e.touches[0].clientY
      dist = 0
    }
    const move = (e: TouchEvent) => {
      if (y0 === null) return
      dist = Math.max(0, Math.min((e.touches[0].clientY - y0) / 2, MAX))
      setPull(dist)
    }
    const end = async () => {
      const fire = y0 !== null && dist >= TRIGGER
      y0 = null
      setPull(0)
      if (!fire) return
      haptic()
      const r = await syncNow()
      router.refresh()
      if (r.ok) toast.success("Synced", { id: "sync-now" })
      else toast.error(r.error, { id: "sync-now" })
    }
    addEventListener("touchstart", start, { passive: true })
    addEventListener("touchmove", move, { passive: true })
    addEventListener("touchend", end)
    addEventListener("touchcancel", end)
    return () => {
      removeEventListener("touchstart", start)
      removeEventListener("touchmove", move)
      removeEventListener("touchend", end)
      removeEventListener("touchcancel", end)
    }
  }, [online, router])

  const shown = syncing || pull > 0
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[calc(var(--inset-top)+8px)] z-40 flex justify-center">
      <div
        className="grid size-9 place-items-center rounded-full bg-background-mid text-foreground shadow-md ring-1 ring-border transition-[opacity,translate] duration-150 ease-standard"
        style={{ opacity: shown ? Math.min(1, syncing ? 1 : pull / TRIGGER) : 0, translate: `0 ${syncing ? 12 : pull / 2}px` }}
      >
        <RefreshCw strokeWidth={2} className={syncing ? "size-4 animate-spin motion-reduce:animate-none" : "size-4"} style={syncing ? undefined : { rotate: `${pull * 3}deg` }} />
      </div>
    </div>
  )
}
