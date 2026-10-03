"use client"

import { Info } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { cn } from "@/lib/utils"
import { InfoDialogContent, type InfoContent } from "./InfoDialog"

export type { InfoContent }

/**
 * Info trigger and its centred info card (spec §4.8). `card`: 32 px visual inside a 44 px hit area
 * (card headers). `header`: WHOOP's ringed "i", 24 px inside 44 px (DetailHeader, [latest-recovery-1]).
 */
export function InfoButton({ info, label, variant }: { info: InfoContent; label: string; variant: "card" | "header" }) {
  const header = variant === "header"
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger
        aria-label={`About ${label}`}
        className={cn(
          "relative grid shrink-0 place-items-center rounded-full transition-[color,background-color,scale] duration-150 ease-standard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
          header ? "size-11 text-foreground/80 hover:text-foreground" : "-my-1 size-8 text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground"
        )}
      >
        {header ? (
          // lucide's Info already draws the circle: one ring, as WHOOP's header "i" [latest-recovery-1].
          <Info aria-hidden className="size-6" strokeWidth={1.75} />
        ) : (
          <Info aria-hidden strokeWidth={1.75} className="size-4" />
        )}
      </DialogPrimitive.Trigger>
      <InfoDialogContent {...info} />
    </DialogPrimitive.Root>
  )
}

/** Any element as the trigger of an info card (Home's day banner, "Add activity"); focus returns to it on close. */
export function InfoCardTrigger({ info, className, children, ...rest }: { info: InfoContent; className?: string; children: React.ReactNode } & React.AriaAttributes) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger className={className} {...rest}>
        {children}
      </DialogPrimitive.Trigger>
      <InfoDialogContent {...info} />
    </DialogPrimitive.Root>
  )
}
