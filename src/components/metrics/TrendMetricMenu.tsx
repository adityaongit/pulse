"use client"

import Link from "next/link"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { CARD_LINK } from "@/components/shells/SectionShell"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export type TrendMetricOption = { key: string; label: string; href: string; icon?: React.ReactNode }

const ICON = "grid size-6 shrink-0 place-items-center text-muted-foreground [&_svg]:size-5 [&_svg]:stroke-[1.75]"

/**
 * The Trend View's metric switch (spec §11 R29): a full-width card naming the metric in caps with its icon and a
 * chevron; it opens a list of the screen's other metrics, on the "+" menu's panel. A choice keeps the range and day.
 */
export function TrendMetricMenu({ current, options }: { current: string; options: TrendMetricOption[] }) {
  const on = options.find((o) => o.key === current) ?? options[0]
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={cn(CARD_LINK, "group/menu flex min-h-14 w-full items-center gap-3 rounded-xl px-4 text-left")}>
        <span aria-hidden className={ICON}>
          {on.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] leading-5 font-bold tracking-[0.08em] uppercase">{on.label}</span>
        <span className="sr-only">Change metric</span>
        <ChevronDown aria-hidden strokeWidth={2.25} className="size-5 shrink-0 transition-[rotate] duration-200 ease-standard group-data-[state=open]/menu:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-(--radix-dropdown-menu-trigger-width) rounded-2xl bg-linear-to-b from-menu-from to-menu-to p-1.5 text-foreground shadow-overlay ring-1 ring-foreground/10"
      >
        {options.map((o) => (
          <DropdownMenuItem key={o.key} asChild className="h-12 gap-3 rounded-xl px-3 text-[13px] leading-4 font-bold tracking-[0.1em] uppercase focus:bg-foreground/10 focus:text-foreground">
            <Link href={o.href} replace scroll={false} aria-current={o.key === on.key ? "page" : undefined}>
              <span aria-hidden className={ICON}>
                {o.icon}
              </span>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.key === on.key && <Check aria-hidden strokeWidth={2.25} className="size-4 shrink-0" />}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
