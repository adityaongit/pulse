"use client"

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"

export type ResponsiveSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  /** Stacked full-width actions: `Button size="sheet"` (white primary, then `variant="outline-pill"`). */
  footer?: React.ReactNode
  size?: "default" | "tall"
  /** Where focus goes on close when nothing opened the sheet (it opened from the URL, e.g. `?checkin=1`). */
  fallbackFocus?: React.RefObject<HTMLElement | null>
}

/** Sheet material (spec §2.6): opaque dark gradient, a lit 1 px top edge. Not glass: sheets hold content. */
const SHEET = "bg-linear-to-b from-sheet to-sheet-bottom shadow-sheet"
const TITLE = "text-[15px] leading-5 font-bold tracking-[0.08em] text-balance uppercase"
const DESCRIPTION = "text-xs leading-4 font-medium text-muted-foreground"
const CLOSE = "shrink-0 text-foreground hover:bg-white/8"

/** A caps section label with a hairline running to the edge, as WHOOP's "TIME ───" [latest-sheet-edit-1]. */
export const SHEET_SECTION =
  "flex items-center gap-3 text-xs leading-4 font-bold tracking-[0.08em] text-muted-foreground uppercase after:h-px after:flex-1 after:bg-white/10"

/**
 * Tasks (check-in, vital and contributor detail): a bottom drawer below 768 px, a floating right
 * sheet from 768 px (spec §4.8). X at the left, centred caps title, white pill actions. The one JS
 * breakpoint read. Focus moves in on open and back to the opener on close (Radix and vaul).
 */
export function ResponsiveSheet({ open, onOpenChange, title, description, children, footer, size = "default", fallbackFocus }: ResponsiveSheetProps) {
  const mobile = useIsMobile()
  // Radix returns focus to a DialogTrigger; these sheets are controlled without one, so remember the opener.
  const opener = React.useRef<HTMLElement | null>(null)

  // X at the left on the phone drawer [latest-sheet-edit-1]; at the right on the floating right sheet (spec §4.8, U18 O-03).
  const header = (Title: React.ElementType, Description: React.ElementType, Close: React.ElementType, closeAt: "start" | "end") => (
    <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-2 pt-1 pb-3">
      <Close asChild>
        <Button variant="ghost" size="icon-touch" aria-label="Close" className={cn(CLOSE, closeAt === "end" && "col-start-3 row-start-1")}>
          <X aria-hidden strokeWidth={1.75} className="size-[22px]" />
        </Button>
      </Close>
      <div className="col-start-2 row-start-1 min-w-0 text-center">
        <Title className={TITLE}>{title}</Title>
        <Description className={cn(DESCRIPTION, "mt-0.5", !description && "sr-only")}>{description ?? title}</Description>
      </div>
    </div>
  )
  const foot = footer && (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] *:w-full md:px-6 md:pb-6">{footer}</div>
  )

  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            SHEET,
            "border-t-0 data-[vaul-drawer-direction=bottom]:max-h-[92svh] data-[vaul-drawer-direction=bottom]:rounded-t-[28px] [&>div:first-child]:mt-2.5 [&>div:first-child]:h-1.5 [&>div:first-child]:w-10 [&>div:first-child]:bg-white/25",
            size === "tall" && "data-[vaul-drawer-direction=bottom]:h-[92svh]",
            // Reduced motion: vaul's slide becomes a 120 ms fade (its own fadeIn / fadeOut keyframes), as every overlay does (spec §2.7).
            "motion-reduce:[animation-duration:120ms]! motion-reduce:data-[state=open]:[animation-name:fadeIn]! motion-reduce:data-[state=closed]:[animation-name:fadeOut]!"
          )}
        >
          {header(DrawerTitle, DrawerDescription, DrawerClose, "start")}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
          {foot}
        </DrawerContent>
      </Drawer>
    )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null
        }}
        onCloseAutoFocus={(e) => {
          // Opened from the URL, the "opener" is <body>: send focus to the page's own trigger instead (U18 O-02).
          const target = opener.current?.isConnected && opener.current !== document.body ? opener.current : fallbackFocus?.current
          if (!target) return
          e.preventDefault()
          target.focus()
        }}
        className={cn(
          SHEET,
          "gap-0 border-l-0 pt-4 data-[side=right]:inset-y-3 data-[side=right]:right-3 data-[side=right]:h-auto data-[side=right]:w-[420px] data-[side=right]:max-w-[calc(100%-24px)] data-[side=right]:rounded-[28px] data-[side=right]:sm:max-w-[420px]"
        )}
      >
        {header(SheetTitle, SheetDescription, SheetClose, "end")}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
        {foot}
      </SheetContent>
    </Sheet>
  )
}
