"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { CloudDownload, Plug, TriangleAlert, Unplug, UserX } from "lucide-react"
import { cn } from "@/lib/utils"
import { ago, clock } from "@/lib/format"
import { useNow } from "@/hooks/use-now"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CARD_MATERIAL } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useShellStatus } from "@/components/shells/ShellStatus"

/**
 * The one place the app talks about its data connection (spec §5.13). Reads ShellStatus; hidden when
 * connected and always hidden in demo mode. Its action row breaks at 768 px (a shell element).
 */
export function ConnectionBanner({ className }: { className?: string }) {
  const s = useShellStatus()
  const router = useRouter()
  const now = useNow()
  const pathname = usePathname()
  if (s.mode === "demo" || s.connection === "connected") return null
  // Settings' Data source card already explains it, with the fix next to it.
  if (s.connection === "not_linked" && pathname === "/settings") return null

  const total = s.importProgress?.total ?? 180
  const done = s.importProgress?.done ?? 0
  const connect = (label: string) => (
    <Button asChild size="touch" variant="default">
      <Link href="/oauth/start">{label}</Link>
    </Button>
  )

  const view = {
    not_connected: {
      icon: <Plug className="text-foreground" />,
      title: "Connect Google to start",
      body: "Pulse reads your Fitbit data from Google Health. Nothing syncs until you connect.",
      action: connect("Connect Google"),
      role: "status",
    },
    not_linked: {
      icon: <UserX className="text-warning" />,
      title: "No Google Health on this account",
      body: "This Google account has no Google Health profile, so there is nothing to sync. Settings has the fix.",
      action: (
        <Button asChild size="touch" variant="secondary">
          <Link href="/settings#source">Open Settings</Link>
        </Button>
      ),
      role: "alert",
    },
    importing: {
      icon: <CloudDownload className="text-coach" />,
      title: "Importing history",
      body: `${done} of ${total} days. Scores fill in as days arrive.`,
      action: null,
      role: "status",
    },
    auth_revoked: {
      icon: <Unplug className="text-recovery-red-text" />,
      title: "Reconnect Google",
      body: "Google access was revoked or expired. Sync is paused until you reconnect.",
      action: connect("Reconnect Google"),
      role: "alert",
    },
    stale: {
      icon: <TriangleAlert className="text-warning" />,
      title: "Sync is behind",
      body: !s.sync.lastSuccessAt
        ? "Sync is behind. Data may be out of date."
        : now
          ? `Last successful sync ${ago(s.sync.lastSuccessAt, now)}. Data may be out of date.`
          : `Last successful sync at ${clock(s.sync.lastSuccessAt, s.timeZone)}. Data may be out of date.`,
      action: (
        <Button size="touch" variant="secondary" onClick={() => router.refresh()}>
          Retry
        </Button>
      ),
      role: "status",
    },
  }[s.connection]

  return (
    <Alert
      role={view.role}
      aria-live={view.role === "status" ? "polite" : undefined}
      className={cn(
        CARD_MATERIAL,
        "grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-0 px-4 py-3 *:[svg]:size-5 *:[svg]:translate-y-px *:[svg]:stroke-[1.75] md:grid-cols-[auto_minmax(0,1fr)_auto]",
        className
      )}
    >
      {view.icon}
      <AlertTitle className="text-base leading-[22px] font-semibold">{view.title}</AlertTitle>
      <AlertDescription className="col-start-2 text-[15px] leading-[22px] text-pretty text-foreground-secondary md:text-pretty">
        {view.body}
        {s.connection === "importing" && (
          <Progress value={(done / total) * 100} aria-label="Import progress" className="mt-2 h-1.5 bg-muted" />
        )}
      </AlertDescription>
      {view.action && (
        <div className="col-span-2 mt-3 grid *:w-full md:col-span-1 md:col-start-3 md:row-span-2 md:row-start-1 md:mt-0 md:self-center md:*:w-auto">
          {view.action}
        </div>
      )}
    </Alert>
  )
}
