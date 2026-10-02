"use client"

import * as React from "react"
import { Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ResponsiveSheet } from "./ResponsiveSheet"

export type InfoContent = { title: string; body: React.ReactNode }

/**
 * Info trigger and its sheet. `card`: 32 px visual inside a 44 px hit area (card headers, spec §4.6).
 * `header`: 44 px button with a 22 px icon (DetailHeader).
 */
export function InfoButton({ info, label, variant }: { info: InfoContent; label: string; variant: "card" | "header" }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size={variant === "header" ? "icon-touch" : "icon"}
        aria-label={`About ${label}`}
        onClick={() => setOpen(true)}
        className={cn(
          variant === "card" &&
            "relative -my-1 size-8 rounded-full text-muted-foreground after:absolute after:-inset-1.5 hover:text-foreground"
        )}
      >
        <Info aria-hidden strokeWidth={1.75} className={variant === "header" ? "size-[22px]" : "size-4"} />
      </Button>
      <ResponsiveSheet open={open} onOpenChange={setOpen} title={info.title}>
        <div className="space-y-4 text-[15px] leading-[22px] text-pretty text-foreground-secondary">{info.body}</div>
      </ResponsiveSheet>
    </>
  )
}
