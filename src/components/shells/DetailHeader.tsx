"use client"

import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { dayHref, parentHref, tabForPath } from "@/lib/url"
import { Button } from "@/components/ui/button"
import { InfoButton, type InfoContent } from "./InfoButton"
import { useShellStatus } from "./ShellStatus"
import { SyncStatus, TopBarFrame } from "./TopBar"

export type DetailHeaderProps = { title: string; subtitle?: string; info?: InfoContent }

/** Detail-route top bar: back, title (+ subtitle), info or sync (spec §4.5). */
export function DetailHeader({ title, subtitle, info }: DetailHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { today } = useShellStatus()

  const back = () => {
    const sameOrigin = document.referrer.startsWith(window.location.origin)
    if (window.history.length > 1 && sameOrigin) return router.back()
    const parent = parentHref(pathname)
    // Home details return to Home on the same day.
    const d = new URLSearchParams(window.location.search).get("d")
    router.push(tabForPath(pathname) === "home" && d ? dayHref(parent, d, today) : parent)
  }

  return (
    <TopBarFrame
      left={
        <Button variant="ghost" size="icon-touch" aria-label="Back" onClick={back} className="-ml-2.5">
          <ChevronLeft aria-hidden strokeWidth={1.75} className="size-6" />
        </Button>
      }
      center={
        <>
          <h1 className="truncate text-[13px] leading-4 font-bold tracking-[0.1em] uppercase">{title}</h1>
          {subtitle && <p className="truncate text-xs leading-4 font-medium text-muted-foreground">{subtitle}</p>}
        </>
      }
      right={info ? <InfoButton info={info} label={title} variant="header" /> : <SyncStatus />}
    />
  )
}
