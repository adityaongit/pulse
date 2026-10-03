"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { CARD_MATERIAL } from "@/components/ui/card"

export type HomeInsightItem = { key: string; title: string; body: string }

/**
 * Home's coach card [latest-home-top-1], [latest-home-top-3]: an opaque card with a title and body (no link: WHOOP,
 * Bevel and Baro keep the coach card text-only; U16 decision 2026-10-03),
 * and WHOOP's check-over-count pill at the right. With several cards a second card peeks out underneath
 * and the pill cycles through them (WHOOP swipes; tap to cycle is inferred, spec §12 I13). Every card sits
 * in the same grid cell, so the box keeps the tallest card's height and nothing below moves on a cycle.
 */
export function HomeInsight({ items }: { items: HomeInsightItem[] }) {
  const [i, setI] = React.useState(0)
  const n = items.length
  if (!n) return null
  const several = n > 1
  return (
    <section aria-label="Insights" aria-roledescription={several ? "carousel" : undefined} className={cn("relative", several && "pb-2")}>
      {several && <div aria-hidden className="absolute inset-x-5 bottom-0 h-8 rounded-b-2xl bg-card/60" />}
      {/* WHOOP's card: text inset 20 px, the counter pill 8 px from the top and right corner [latest-home-top-1..3] (spec §11 F6). */}
      <div className={cn(CARD_MATERIAL, "relative p-5 pr-12 xl:p-6 xl:pr-14")}>
        <div className="grid">
          {items.map((it, k) => (
            <div
              key={it.key}
              aria-hidden={k !== i}
              inert={k !== i}
              aria-roledescription={several ? "slide" : undefined}
              aria-label={several ? `${k + 1} of ${n}` : undefined}
              className={cn(
                "col-start-1 row-start-1 space-y-0.5 transition-opacity duration-150 ease-standard",
                k === i ? "opacity-100" : "pointer-events-none opacity-0"
              )}
            >
              <p className="text-base leading-[22px] font-medium text-balance">{it.title}</p>
              <p className="max-w-[65ch] text-[15px] leading-5 text-pretty text-foreground/85">{it.body}</p>
            </div>
          ))}
        </div>
        {several ? (
          <button
            type="button"
            onClick={() => setI((k) => (k + 1) % n)}
            aria-label={`Next insight (${i + 1} of ${n})`}
            className="absolute top-2 right-2 flex h-12 w-6 flex-col items-center justify-center gap-1 rounded-lg bg-white/8 text-foreground transition-[background-color,scale] duration-150 ease-standard outline-none after:absolute after:-inset-x-2.5 after:-inset-y-0.5 hover:bg-white/12 focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]"
          >
            <Check aria-hidden className="size-4" strokeWidth={2.25} />
            <span className="font-numeric text-[13px] leading-4 font-semibold text-foreground-secondary tabular-nums">{n - i}</span>
          </button>
        ) : (
          <span aria-hidden className="absolute top-2 right-2 flex h-12 w-6 flex-col items-center justify-center gap-1 rounded-lg bg-white/8">
            <Check className="size-4" strokeWidth={2.25} />
            <span className="font-numeric text-[13px] leading-4 font-semibold text-foreground-secondary tabular-nums">1</span>
          </span>
        )}
      </div>
    </section>
  )
}
