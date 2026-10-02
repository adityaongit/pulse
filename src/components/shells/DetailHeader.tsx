"use client"

import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { dayHref, parentHref, tabForPath } from "@/lib/url"
import { Button } from "@/components/ui/button"
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher"
import { InfoButton, type InfoContent } from "./InfoButton"
import { useShellStatus } from "./ShellStatus"
import { HEADER_TITLE, HeaderFrame, HeaderRow } from "./TopBar"

export type DetailHeaderProps = {
  title: string
  subtitle?: string
  info?: InfoContent
  /** Back target without history (default: the parent tab root). */
  backHref?: string
  /** Recovery, Strain, Sleep: the date is the title, with day chevrons beside it (spec §4.4, C7). */
  dateTitle?: DateSwitcherProps
  /** `close`: an X instead of the back chevron, for modal-style screens (Settings, [latest-settings-1]). */
  dismiss?: "back" | "close"
}

/** Detail-route header: back, the date or the screen name (+ subtitle), the ringed info button (spec §4.4). */
export function DetailHeader({ title, subtitle, info, backHref, dateTitle, dismiss = "back" }: DetailHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { today } = useShellStatus()

  const back = () => {
    const sameOrigin = document.referrer.startsWith(window.location.origin)
    if (window.history.length > 1 && sameOrigin) return router.back()
    if (backHref) return router.push(backHref)
    const parent = parentHref(pathname)
    // Home details return to Home on the same day.
    const d = new URLSearchParams(window.location.search).get("d")
    router.push(tabForPath(pathname) === "home" && d ? dayHref(parent, d, today) : parent)
  }
  const Icon = dismiss === "close" ? X : ChevronLeft

  return (
    <HeaderFrame>
      <HeaderRow
        left={
          <Button variant="ghost" size="icon-touch" aria-label={dismiss === "close" ? "Close" : "Back"} onClick={back} className="hover:bg-white/8">
            <Icon aria-hidden strokeWidth={1.75} className={dismiss === "close" ? "size-6" : "size-[26px]"} />
          </Button>
        }
        center={
          dateTitle ? (
            <>
              <h1 className="sr-only">{title}</h1>
              <DateSwitcher {...dateTitle} placement="header" />
            </>
          ) : (
            <>
              <h1 className={cn(HEADER_TITLE, "truncate")}>{title}</h1>
              {subtitle && <p className="truncate text-xs leading-4 font-medium text-muted-foreground">{subtitle}</p>}
            </>
          )
        }
        right={info && <InfoButton info={info} label={title} variant="header" />}
      />
    </HeaderFrame>
  )
}
