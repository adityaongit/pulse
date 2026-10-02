"use client"

import Link from "next/link"
import { X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import type { ChipTone } from "@/lib/bands"
import { StatusChip } from "@/components/metrics/primitives"
import { Button } from "@/components/ui/button"

export type InfoContent = {
  title: string
  body: React.ReactNode
  /** A 28 px icon above the title. */
  icon?: React.ReactNode
  /** Status chip beside the title ("Within 24 - 28"). */
  chip?: { tone: ChipTone; text: string }
  /** One outline action, e.g. "Open trend view". */
  action?: { label: string; href: string }
}

/**
 * WHOOP's centred info card (spec §4.8, [latest-popover-info-1]) for every explanation: an opaque
 * card over an 85 % dim with no blur. Render inside a Radix Dialog root whose Trigger opened it, so
 * focus returns there. Opens 320 ms (fade, scale 0.96, blur 4 px), closes 200 ms; fade only under
 * reduced motion.
 */
export function InfoDialogContent({ title, body, icon, chip, action }: InfoContent) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-dim-strong data-open:animate-in data-open:fade-in-0 data-open:duration-320 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-200" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        // Focus the card itself, not the close button, so a tap does not light a focus ring; Tab still reaches it.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).focus()
        }}
        className="fixed top-1/2 left-1/2 z-50 max-h-[80svh] w-[calc(100%-32px)] max-w-[360px] -translate-1/2 overflow-y-auto overscroll-contain rounded-3xl bg-linear-to-b from-popover-top to-popover p-6 text-popover-foreground shadow-overlay ring-1 ring-white/8 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-96 data-open:blur-in-4 data-open:duration-320 data-open:ease-out-expo data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-96 data-closed:duration-200 data-closed:ease-in-quick"
      >
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon-touch" aria-label="Close" className="absolute top-3 right-3 hover:bg-white/8">
            <X aria-hidden strokeWidth={1.75} className="size-[22px]" />
          </Button>
        </DialogPrimitive.Close>
        {icon && <div className="mb-4 text-foreground-secondary [&_svg]:size-7">{icon}</div>}
        <div className="mb-3 flex items-start gap-2.5 pr-8">
          {chip && <StatusChip tone={chip.tone}>{chip.text}</StatusChip>}
          <DialogPrimitive.Title className="text-[15px] leading-5 font-bold tracking-[0.08em] text-balance uppercase">{title}</DialogPrimitive.Title>
        </div>
        <div className="space-y-4 text-[15px] leading-[22px] text-pretty text-foreground-secondary">{body}</div>
        {action && (
          <Button asChild variant="outline-pill" className="mt-6 h-12 w-full text-[13px] font-bold tracking-[0.08em] uppercase">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
