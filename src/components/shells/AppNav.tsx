"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { getISOWeek, getISOWeekYear, parseISO, subWeeks } from "date-fns"
import { CalendarRange, HeartPulse, House, Menu, NotebookPen, Settings, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { tabForPath, TAB_ROOT, type Tab } from "@/lib/url"
import { useMediaQuery } from "@/hooks/use-reduced-motion"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { useShellStatus } from "./ShellStatus"
import { DemoChip, SyncStatus } from "./TopBar"

const TABS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: "home", label: "Home", icon: House },
  { tab: "health", label: "Health", icon: HeartPulse },
  { tab: "journal", label: "Journal", icon: NotebookPen },
  { tab: "more", label: "More", icon: Menu },
]

/** Latest complete ISO week, e.g. "2026-W39". */
function lastWeekPeriod(today: string) {
  const d = subWeeks(parseISO(today), 1)
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`
}

/**
 * SidebarProvider whose open state follows the viewport, not the user: expanded at 1280 px and up,
 * icon rail at 768-1279 px (spec §4.2). No trigger, no cookie read.
 */
export function ShellFrame({ children }: { children: React.ReactNode }) {
  const expanded = useMediaQuery("(min-width: 1280px)")
  return (
    <SidebarProvider open={expanded} onOpenChange={() => {}} className="min-h-svh">
      {children}
    </SidebarProvider>
  )
}

export function AppSidebar() {
  const pathname = usePathname()
  const { today } = useShellStatus()
  const { state } = useSidebar()
  const expanded = state === "expanded"
  const extra = [
    { href: `/reports/${lastWeekPeriod(today)}`, match: "/reports", label: "Reports", icon: CalendarRange },
    { href: "/settings", match: "/settings", label: "Settings", icon: Settings },
  ]
  const extraActive = expanded && extra.some((e) => pathname.startsWith(e.match))
  const current = tabForPath(pathname)

  const item = (href: string, label: string, Icon: LucideIcon, active: boolean) => (
    <SidebarMenuItem key={label}>
      <SidebarMenuButton
        asChild
        size="lg"
        isActive={active}
        tooltip={label}
        className="gap-3 px-3 text-sm font-semibold text-sidebar-foreground transition-[background-color,color] duration-150 ease-standard focus-visible:ring-3 focus-visible:ring-ring/50 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:justify-center [&_svg]:size-6"
      >
        <Link href={href} aria-current={active ? "page" : undefined}>
          <Icon aria-hidden strokeWidth={1.75} />
          <span className="group-data-[collapsible=icon]:hidden">{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="h-14 justify-center px-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0">
        <span aria-hidden className="hidden font-numeric text-xl leading-none font-bold group-data-[collapsible=icon]:grid group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:place-items-center">
          P
        </span>
        <span className="text-[13px] leading-4 font-semibold tracking-[0.35em] text-foreground uppercase group-data-[collapsible=icon]:sr-only">
          Pulse
        </span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:px-1">
          <nav aria-label="Primary">
            <SidebarMenu className="gap-1">
              {TABS.map((t) => item(TAB_ROOT[t.tab], t.label, t.icon, current === t.tab && !extraActive))}
            </SidebarMenu>
            {expanded && (
              <>
                <SidebarSeparator className="my-3" />
                <SidebarMenu className="gap-1">
                  {extra.map((e) => item(e.href, e.label, e.icon, pathname.startsWith(e.match)))}
                </SidebarMenu>
              </>
            )}
          </nav>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-0.5">
        {expanded && (
          <div className="@container px-1">
            <DemoChip />
          </div>
        )}
        <SyncStatus withLabel={expanded} />
      </SidebarFooter>
    </Sidebar>
  )
}

/** WHOOP's floating tab bar, below 768 px (spec §4.2). */
export function BottomTabs() {
  const current = tabForPath(usePathname())
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 h-16 touch-manipulation rounded-[22px] bg-muted/95 ring-1 ring-border md:hidden"
    >
      <ul className="grid h-full grid-cols-4">
        {TABS.map(({ tab, label, icon: Icon }) => {
          const active = current === tab
          return (
            <li key={tab} className="min-w-0">
              <Link
                href={TAB_ROOT[tab]}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 rounded-[22px] text-[11px] leading-[14px] font-semibold tracking-[0.01em] transition-[color,scale] duration-150 ease-standard outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:scale-[0.96]",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground-secondary"
                )}
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-6" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
