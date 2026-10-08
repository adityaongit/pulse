"use client"

import Link from "next/link"
import { CalendarDays, Ellipsis, HeartPulse } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, MENU_ITEM, MENU_PANEL } from "@/components/ui/dropdown-menu"

/** The activity's "..." (activity-01): the day's Strain and the heart-rate settings its zones come from. Pulse can't edit an imported workout. */
export function ActivityMenu({ strainHref, settingsHref }: { strainHref: string; settingsHref: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-touch" aria-label="More for this activity" className="text-foreground hover:bg-foreground/8">
          <Ellipsis aria-hidden strokeWidth={2} className="size-6" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={cn(MENU_PANEL, "w-auto min-w-64")}>
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href={strainHref}>
            <CalendarDays aria-hidden strokeWidth={1.75} className="size-5 text-foreground-secondary" />
            Strain for this day
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={MENU_ITEM}>
          <Link href={settingsHref}>
            <HeartPulse aria-hidden strokeWidth={1.75} className="size-5 text-foreground-secondary" />
            Heart-rate settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
