"use client"

import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export type ResponsiveSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: "default" | "tall"
}

const OVERLAY = "shadow-[0_12px_32px_rgb(0_0_0/0.5)] ring-1 ring-border"

/**
 * Bottom drawer below 768 px, right sheet from 768 px (spec §4.7). The one JS breakpoint read
 * besides AppShell. Focus moves in on open and back to the trigger on close (Radix and vaul).
 */
export function ResponsiveSheet({ open, onOpenChange, title, description, children, footer, size = "default" }: ResponsiveSheetProps) {
  const mobile = useIsMobile()

  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className={cn(
            "border-t-0 data-[vaul-drawer-direction=bottom]:max-h-[90svh] data-[vaul-drawer-direction=bottom]:rounded-t-2xl",
            size === "tall" && "data-[vaul-drawer-direction=bottom]:h-[90svh]",
            OVERLAY
          )}
        >
          <DrawerHeader className="px-4 pt-3 pb-3 text-left group-data-[vaul-drawer-direction=bottom]/drawer-content:text-left">
            <DrawerTitle className="text-lg leading-6 font-semibold tracking-[-0.01em]">{title}</DrawerTitle>
            {description ? (
              <DrawerDescription className="text-xs leading-4 font-medium text-muted-foreground">{description}</DrawerDescription>
            ) : (
              <DrawerDescription className="sr-only">{title}</DrawerDescription>
            )}
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
          {footer && (
            <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-popover px-4 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] *:w-full">
              {footer}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className={cn("w-full gap-0 border-l-0 data-[side=right]:sm:max-w-[420px] data-[side=right]:xl:max-w-[440px]", OVERLAY)}>
        <SheetHeader className="flex-row items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div className="min-w-0 space-y-0.5 pt-2.5">
            <SheetTitle className="text-lg leading-6 font-semibold tracking-[-0.01em]">{title}</SheetTitle>
            {description ? (
              <SheetDescription className="text-xs leading-4 font-medium text-muted-foreground">{description}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>
          <SheetClose asChild>
            <Button variant="ghost" size="icon-touch" aria-label="Close" className="-mr-3 shrink-0">
              <X aria-hidden strokeWidth={1.75} />
            </Button>
          </SheetClose>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-popover px-6 py-4">{footer}</div>}
      </SheetContent>
    </Sheet>
  )
}
