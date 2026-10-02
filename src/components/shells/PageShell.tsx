import { cn } from "@/lib/utils"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import type { DateSwitcherProps } from "./DateSwitcher"
import { HomeHeader, type HeaderRings } from "./HomeHeader"
import { TitleHeader } from "./TopBar"

/** The content column: full width on phone, 720 px on tablet, up to 1120 px on laptop (spec §2.5, §4.5). */
export const CONTENT_COLUMN = "mx-auto w-full min-w-0 px-4 pt-2 md:max-w-[720px] md:px-6 xl:max-w-[1120px] xl:px-8 xl:pt-4"

export type HomeSlots = { top: React.ReactNode; left: React.ReactNode; right: React.ReactNode; bottom?: React.ReactNode }

export type PageShellProps = {
  /** The page's h1, shown centred in the header (Home's is visually hidden). */
  title: string
  /** Under the title (Journal). Home's header always carries the date pill. */
  dateSwitcher?: DateSwitcherProps
  /** Right-aligned on the first row of content (never in the header). */
  actions?: React.ReactNode
  layout?: "stack" | "home" | "grid-2"
  /** For `layout="home"`: `top` and `bottom` span both laptop columns; phone order is top, right, left, bottom. */
  slots?: HomeSlots
  /** For `layout="home"`: the day's scores for the collapsing header's ring row (spec §4.3). */
  rings?: HeaderRings
  /** Page ground (spec §2.1): the Health hub has a teal glow. */
  ground?: "default" | "health"
  children?: React.ReactNode
}

/** Tab roots: Home, Health, Journal, More (spec §4.5). */
export function PageShell({ title, dateSwitcher, actions, layout = "stack", slots, rings, ground, children }: PageShellProps) {
  return (
    <div data-ground={ground === "health" ? "health" : undefined}>
      {layout === "home" ? <HomeHeader rings={rings} /> : <TitleHeader title={title} dateSwitcher={dateSwitcher} />}
      <div className={CONTENT_COLUMN}>
        <ConnectionBanner className="mb-4 xl:mb-6" />
        {actions && <div className="mb-4 flex justify-end gap-2">{actions}</div>}
        {layout === "home" && slots ? (
          <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-x-6 xl:gap-y-10">
            <div className="min-w-0 xl:col-span-2">{slots.top}</div>
            <div className="min-w-0 xl:col-start-2 xl:row-start-2">{slots.right}</div>
            <div className="min-w-0 xl:col-start-1 xl:row-start-2">{slots.left}</div>
            {slots.bottom && <div className="min-w-0 xl:col-span-2">{slots.bottom}</div>}
          </div>
        ) : (
          <div className={cn(layout === "grid-2" ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4" : "flex flex-col gap-8 xl:gap-10")}>{children}</div>
        )}
      </div>
    </div>
  )
}
