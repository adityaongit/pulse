"use client"

import { usePathname, useRouter } from "next/navigation"
import { ChevronLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLUMN_WIDTH } from "./column"
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
  /** `start`: back, an optional 24 px icon, then the title over the subtitle, all left-aligned (Activity, [latest-activity-1]). */
  align?: "center" | "start"
  titleIcon?: React.ReactNode
}

/**
 * The 44 px bar (WHOOP's, [latest-recovery-collapsed-1]): 52 px from 768. From 768 its edges follow the content
 * column (D-L2); the inset puts the back chevron and the info ring on the content edges.
 */
export const DETAIL_ROW = cn("h-11 md:h-13 xl:px-6", COLUMN_WIDTH)

/** Back, the date or the screen name (+ subtitle), the ringed info button (spec §4.4). */
export function DetailHeaderRow({
  title,
  subtitle,
  info,
  backHref,
  dateTitle,
  dismiss = "back",
  align = "center",
  titleIcon,
  centerClassName,
  className,
}: DetailHeaderProps & { centerClassName?: string; className?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const { today } = useShellStatus()

  const back = () => {
    // The Navigation API lists only this origin's entries, so canGoBack means "an in-app page is behind this one".
    // document.referrer never changes on client navigation, so alone it sent Home → Recovery → Back to a pushed copy
    // of Home, and the browser's Back then looped to Recovery (U18 N-01). It stays as the fallback.
    const nav = (window as Window & { navigation?: { canGoBack: boolean } }).navigation
    const canGoBack = nav ? nav.canGoBack : window.history.length > 1 && document.referrer.startsWith(window.location.origin)
    if (canGoBack) return router.back()
    if (backHref) return router.push(backHref)
    const parent = parentHref(pathname)
    // Home details return to Home on the same day.
    const d = new URLSearchParams(window.location.search).get("d")
    router.push(tabForPath(pathname) === "home" && d ? dayHref(parent, d, today) : parent)
  }
  const Icon = dismiss === "close" ? X : ChevronLeft
  const backButton = (
    <Button variant="ghost" size="icon-touch" aria-label={dismiss === "close" ? "Close" : "Back"} onClick={back} className="hover:bg-white/8">
      <Icon aria-hidden strokeWidth={1.75} className={dismiss === "close" ? "size-6" : "size-[26px]"} />
    </Button>
  )

  // A subtitle never moves the title: the title line keeps the plain bar's position (centred in the 44 / 52 px row,
  // level with back and info) and the subtitle hangs under it, so the bar grows downward. Before, the title and
  // subtitle were centred together and the title sat 4 px from the top (Healthspan, Activity; U18 header check).
  const sideLine = "flex h-11 shrink-0 items-center md:h-13"
  if (align === "start")
    return (
      <div className={cn("flex items-start gap-2 px-2 md:px-4", DETAIL_ROW, "h-auto min-h-11 md:min-h-13", subtitle && "pb-1", className)}>
        <span className={sideLine}>{backButton}</span>
        {titleIcon && (
          <span className={sideLine}>
            <span className="grid size-7 shrink-0 place-items-center [&_svg]:size-6 [&_svg]:stroke-[1.75]">{titleIcon}</span>
          </span>
        )}
        <div data-collapse-keep className="min-w-0 flex-1 pt-3 md:pt-4">
          <h1 className={cn(HEADER_TITLE, "truncate")}>{title}</h1>
          {/* 13 px under the 12 px title, WHOOP's activity time range [latest-activity-1] (spec §11 F14). */}
          {subtitle && <p className="truncate text-[13px] leading-[18px] text-foreground-secondary tabular-nums">{subtitle}</p>}
        </div>
        {info && (
          <span className={sideLine}>
            <InfoButton info={info} label={title} variant="header" />
          </span>
        )}
      </div>
    )

  const sub = !!subtitle && !dateTitle

  return (
    <HeaderRow
      className={cn(DETAIL_ROW, sub && "h-auto items-start pb-1 md:h-auto", className)}
      left={sub ? <span className={sideLine}>{backButton}</span> : backButton}
      center={
        <div data-collapse-keep className={cn("flex max-w-full min-w-0 flex-col items-center", sub && "pt-3 md:pt-4", centerClassName)}>
          {dateTitle ? (
            <>
              <h1 className="sr-only">{title}</h1>
              <DateSwitcher {...dateTitle} placement="header" />
            </>
          ) : (
            <>
              <h1 className={cn(HEADER_TITLE, "max-w-full truncate")}>{title}</h1>
              {/* Caps and tracked, WHOOP's "NEXT UPDATE IN 7 DAYS" [latest-whoop-age-cyan-1] (spec §11 F15). */}
              {subtitle && <p className="max-w-full truncate text-[11px] leading-4 font-semibold tracking-[0.06em] text-muted-foreground uppercase">{subtitle}</p>}
            </>
          )}
        </div>
      }
      right={info && (sub ? <span className={sideLine}><InfoButton info={info} label={title} variant="header" /></span> : <InfoButton info={info} label={title} variant="header" />)}
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
