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

/**
 * The 44 px bar (WHOOP's, [latest-recovery-collapsed-1]): 52 px from 768. From 1280 its edges follow the
 * 1120 px content column; the 24 px inset puts the info ring's edge on the content edge.
 */
export const DETAIL_ROW = "h-11 md:h-13 xl:mx-auto xl:max-w-[1120px] xl:px-6"

/** Back, the date or the screen name (+ subtitle), the ringed info button (spec §4.4). */
export function DetailHeaderRow({
  title,
  subtitle,
  info,
  backHref,
  dateTitle,
  dismiss = "back",
  centerClassName,
  className,
}: DetailHeaderProps & { centerClassName?: string; className?: string }) {
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
    <HeaderRow
      className={cn(DETAIL_ROW, className)}
      left={
        <Button variant="ghost" size="icon-touch" aria-label={dismiss === "close" ? "Close" : "Back"} onClick={back} className="hover:bg-white/8">
          <Icon aria-hidden strokeWidth={1.75} className={dismiss === "close" ? "size-6" : "size-[26px]"} />
        </Button>
      }
      center={
        <div data-collapse-keep className={cn("flex max-w-full min-w-0 flex-col items-center", centerClassName)}>
          {dateTitle ? (
            <>
              <h1 className="sr-only">{title}</h1>
              <DateSwitcher {...dateTitle} placement="header" />
            </>
          ) : (
            <>
              <h1 className={cn(HEADER_TITLE, "max-w-full truncate")}>{title}</h1>
              {subtitle && <p className="max-w-full truncate text-xs leading-4 font-medium text-muted-foreground">{subtitle}</p>}
            </>
          )}
        </div>
      }
      right={info && <InfoButton info={info} label={title} variant="header" />}
    />
  )
}

/** Detail-route header (spec §4.4, §4.3a): a plain pinned bar on the page ground with the 24 px fade; nothing collapses. */
export function DetailHeader(props: DetailHeaderProps) {
  return (
    <HeaderFrame>
      <DetailHeaderRow {...props} />
    </HeaderFrame>
  )
}
