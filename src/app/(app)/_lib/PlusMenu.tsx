"use client"

import * as React from "react"
import { Camera, Dumbbell, NotebookPen, Plus, Timer, X, type LucideIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { FEATURES } from "@/lib/features"
import { cn } from "@/lib/utils"
import { InfoDialogContent } from "@/components/shells/InfoDialog"
import { openSheet } from "@/components/shells/SheetTrigger"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, MENU_ITEM, MENU_PANEL } from "@/components/ui/dropdown-menu"
import { ADD_ACTIVITY_INFO } from "./info"

type Entry = { key: string; label: string; icon: LucideIcon; shown: boolean; onSelect: () => void }

/** Both glyphs stay mounted and cross-fade (opacity, scale, blur) so the swap runs both ways without a motion library. */
const GLYPH =
  "absolute size-5 transition-[opacity,scale,filter] duration-200 ease-standard motion-reduce:transition-none"

/**
 * My Day's "+": a white key that opens the action menu under it and turns into an X while open
 * (the reference app, home-08). Entries without a data source in Pulse are built but stay off (`FEATURES`).
 */
export function PlusMenu({ label }: { label: string }) {
  const [info, setInfo] = React.useState(false)
  const entries: Entry[] = [
    { key: "start", label: "Start activity", icon: Timer, shown: FEATURES.startActivity, onSelect: () => openSheet("start-activity") },
    { key: "add", label: "Add activity", icon: Plus, shown: true, onSelect: () => (FEATURES.logActivity ? openSheet("add-activity") : setInfo(true)) },
    { key: "strength", label: "Strength trainer", icon: Dumbbell, shown: FEATURES.strengthTrainer, onSelect: () => openSheet("strength") },
    { key: "journal", label: "Complete your journal", icon: NotebookPen, shown: true, onSelect: () => openSheet("checkin") },
    { key: "live", label: "Share live", icon: Camera, shown: FEATURES.liveShare, onSelect: () => openSheet("live") },
  ]

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-label={label}
          // ~34 pt white key with a soft top light; the hit area grows to 44 px without moving it.
          className="group/plus relative grid size-[34px] place-items-center rounded-[10px] bg-linear-to-b from-key-from to-key-to text-key-foreground shadow-sm transition-[scale,filter] duration-150 ease-standard outline-none after:absolute after:-inset-[5px] hover:brightness-95 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
        >
          <Plus aria-hidden strokeWidth={2.25} className={cn(GLYPH, "group-data-[state=open]/plus:scale-25 group-data-[state=open]/plus:opacity-0 group-data-[state=open]/plus:blur-[4px]")} />
          <X aria-hidden strokeWidth={2.25} className={cn(GLYPH, "scale-25 opacity-0 blur-[4px] group-data-[state=open]/plus:scale-100 group-data-[state=open]/plus:opacity-100 group-data-[state=open]/plus:blur-none")} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className={cn(MENU_PANEL, "w-auto min-w-64")}
        >
          {entries
            .filter((e) => e.shown)
            .map(({ key, label: text, icon: Icon, onSelect }) => (
              <DropdownMenuItem
                key={key}
                onSelect={onSelect}
                className={cn(MENU_ITEM, "[&_svg:not([class*='size-'])]:size-5")}
              >
                <Icon aria-hidden strokeWidth={1.75} className="text-foreground-secondary" />
                {text}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DialogPrimitive.Root open={info} onOpenChange={setInfo}>
        <InfoDialogContent {...ADD_ACTIVITY_INFO} />
      </DialogPrimitive.Root>
    </>
  )
}
