"use client"

import * as React from "react"
import { Cable, Palette, PanelLeftClose, PanelLeftOpen, Plug, UserRound, BotMessageSquare } from "lucide-react"
import { cn } from "@/lib/utils"
import { GLASS } from "@/components/shells/AppNav"
import { panelStore } from "@/components/shells/panelStore"
import { Button } from "@/components/ui/button"

export type SectionId = "account" | "source" | "app" | "coach" | "agents"
export type SettingsSection = { id: SectionId; label: string; node: React.ReactNode }

const ICON: Record<SectionId, React.ComponentType<{ "aria-hidden"?: boolean; strokeWidth?: number; className?: string }>> = {
  account: UserRound,
  source: Plug,
  app: Palette,
  coach: BotMessageSquare,
  agents: Cable,
}
/** Older names: ?s=sync, ?s=appearance, ?s=profile. */
const ALIAS: Record<string, SectionId> = { sync: "source", appearance: "app", profile: "account" }

const panel = panelStore("pulse:settings-panel-open")
const PANEL_BTN = "rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground"

/**
 * Settings, one section at a time. From 1280 px the sections are a glass panel beside the app's compact rail (expanded or
 * collapsed, remembered per device, as the coach's chats panel is). Below that there is no second level: each section is
 * its own row on More (Account & settings) and opens at `?s=` (/settings?s=coach), which the server reads, so the first
 * paint is already the right section; a reload and the coach's settings buttons land there too. A query, not a hash: a
 * client navigation sets the hash only after the page mounts, so every row opened the first section. With none, the
 * first section.
 */
export function SettingsLayout({ sections, initial = null }: { sections: SettingsSection[]; initial?: string | null }) {
  const open = panel.use()
  const ids = sections.map((s) => s.id)
  const resolve = (raw: string | null | undefined) => {
    const id = (raw && (ALIAS[raw] ?? raw)) as SectionId
    return ids.includes(id) ? id : null
  }
  const [active, setActive] = React.useState<SectionId | null>(() => resolve(initial))
  const pick = (id: SectionId) => {
    history.replaceState(history.state, "", `?s=${id}`)
    setActive(id)
  }
  const current = sections.find((s) => s.id === active) ?? sections[0]

  const item = (s: SettingsSection, collapsed: boolean) => {
    const Icon = ICON[s.id]
    const on = s.id === current.id
    return (
      <li key={s.id}>
        <button
          type="button"
          aria-current={on ? "page" : undefined}
          aria-label={collapsed ? s.label : undefined}
          onClick={() => pick(s.id)}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl text-[15px] leading-5 font-medium outline-none transition-[background-color,color,scale] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
            collapsed ? "size-11 justify-center" : "min-h-11 px-3",
            on ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-foreground/8 hover:text-foreground",
          )}
        >
          <Icon aria-hidden strokeWidth={1.6} className="size-5 shrink-0" />
          {!collapsed && s.label}
        </button>
      </li>
    )
  }

  return (
    <div data-settings={open ? "open" : "closed"}>
      {open ? (
        <aside data-fixed-panel aria-label="Settings sections" className={cn(GLASS, "fixed top-[calc(var(--inset-top)+12px)] bottom-3 left-[112px] z-30 hidden w-[272px] flex-col rounded-[28px] p-3 xl:flex")}>
          <div className="flex h-14 shrink-0 items-center justify-between gap-1 pl-3">
            <h2 className="text-[15px] leading-5 font-semibold">Settings</h2>
            <Button variant="ghost" size="icon-lg" aria-label="Collapse sections" aria-expanded onClick={() => panel.set(false)} className={PANEL_BTN}>
              <PanelLeftClose aria-hidden strokeWidth={1.6} className="size-[18px]" />
            </Button>
          </div>
          <ul className="flex flex-col gap-1">{sections.map((s) => item(s, false))}</ul>
        </aside>
      ) : (
        <aside data-fixed-panel aria-label="Settings sections" className={cn(GLASS, "fixed top-[calc(var(--inset-top)+12px)] bottom-3 left-[112px] z-30 hidden w-16 flex-col items-center gap-1 rounded-[28px] py-3 xl:flex")}>
          <Button variant="ghost" size="icon-touch" aria-label="Expand sections" aria-expanded={false} onClick={() => panel.set(true)} className={PANEL_BTN}>
            <PanelLeftOpen aria-hidden strokeWidth={1.6} />
          </Button>
          <div aria-hidden className="my-1 h-px w-8 bg-foreground/8" />
          <ul className="flex flex-col items-center gap-1">{sections.map((s) => item(s, true))}</ul>
        </aside>
      )}

      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 md:gap-4">
        {current.node}
      </div>
    </div>
  )
}
