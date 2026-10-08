"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronLeft, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLUMN_WIDTH } from "./column"
import { detailBackHref, useAppBack, useAppNavigationRoot } from "./AppNavigation"
import { Button } from "@/components/ui/button"
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher"
import { InfoButton, type InfoContent } from "./InfoButton"
import { useShellCalendar } from "./ShellStatus"
import { HEADER_TITLE, HeaderFrame, HeaderRow } from "./TopBar"

export type DetailHeaderProps = {
  title: string
  subtitle?: string
  info?: InfoContent
  backHref?: string
  dateTitle?: DateSwitcherProps
  dismiss?: "back" | "close"
  align?: "center" | "start"
  titleIcon?: React.ReactNode
  action?: React.ReactNode
}

export const DETAIL_ROW = cn("h-11 md:h-13 xl:px-6", COLUMN_WIDTH)

export function DetailHeaderRow({
  title,
  subtitle,
  info,
  backHref,
  dateTitle,
  dismiss = "back",
  align = "center",
  titleIcon,
  action,
  centerClassName,
  className,
}: DetailHeaderProps & { centerClassName?: string; className?: string }) {
  const pathname = usePathname()
  const params = useSearchParams()
  const root = useAppNavigationRoot()
  const { today } = useShellCalendar()

  const parent = detailBackHref(pathname, root, today, params.get("d"), backHref)
  const back = useAppBack(parent)
  const Icon = dismiss === "close" ? X : ChevronLeft
  const backButton = (
    <Button
      asChild
      variant="ghost"
      size="icon-touch"
      className={cn("hover:bg-foreground/8", dismiss === "close" && "md:invisible")}
    >
      {/* The href is the parent, for a new tab or no JavaScript; a tap pops to the previous screen (useAppBack). */}
      <Link
        href={parent}
        replace
        aria-label={dismiss === "close" ? "Close" : "Back"}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          back()
        }}
      >
        <Icon aria-hidden strokeWidth={1.75} className={dismiss === "close" ? "size-6" : "size-[26px]"} />
      </Link>
    </Button>
  )
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
          {subtitle && <p className="truncate text-[13px] leading-[18px] text-foreground-secondary tabular-nums">{subtitle}</p>}
        </div>
        {(action || info) && <span className={sideLine}>{action ?? <InfoButton info={info!} label={title} variant="header" />}</span>}
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
              {subtitle && <p className="max-w-full truncate text-[11px] leading-4 font-semibold tracking-[0.1em] text-muted-foreground uppercase">{subtitle}</p>}
            </>
          )}
        </div>
      }
      right={action ?? (info && (sub ? <span className={sideLine}><InfoButton info={info} label={title} variant="header" /></span> : <InfoButton info={info} label={title} variant="header" />))}
    />
  )
}

export function DetailHeader(props: DetailHeaderProps) {
  return (
    <HeaderFrame>
      <DetailHeaderRow {...props} />
    </HeaderFrame>
  )
}
