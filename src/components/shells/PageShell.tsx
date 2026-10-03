import { cn } from "@/lib/utils"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import { COLUMN_WIDTH } from "./column"
import type { DateSwitcherProps } from "./DateSwitcher"
import { HomeHeader, type HeaderRings } from "./HomeHeader"
import { TitleHeader } from "./TopBar"

/** The content column (spec §2.5, §4.5). */
export const CONTENT_COLUMN = cn(
  "mx-auto w-full min-w-0 px-4 pt-2 transition-opacity duration-150 ease-standard md:px-6 xl:px-8 xl:pt-4 in-data-day-loading:opacity-60",
  COLUMN_WIDTH
)

/** Home: `top` and `bottom` span the laptop row; `main` (My Day) takes the wide left column, `aside` (My Dashboard) the right (D-L4). */
export type HomeSlots = { top: React.ReactNode; main: React.ReactNode; aside: React.ReactNode; bottom?: React.ReactNode }

export type PageShellProps = {
  /** The page's h1, shown centred in the header (Home's is visually hidden). */
  title: string
  /** Under the title (Journal). Home's header always carries the date pill. */
  dateSwitcher?: DateSwitcherProps
  /** Right-aligned on the first row of content (never in the header). */
  actions?: React.ReactNode
  layout?: "stack" | "home" | "grid-2"
  /** For `layout="home"`: phone order is top, main, aside, bottom, and so is the laptop reading order. */
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
        {/* Home's top row pulls itself up under the header (-mt-2), so the banner keeps 24 px above the wordmark. */}
        <ConnectionBanner className={layout === "home" ? "mb-8 xl:mb-6" : "mb-4 xl:mb-6"} />
        {actions && <div className="mb-4 flex justify-end gap-2">{actions}</div>}
        {layout === "home" && slots ? (
          <div className="flex flex-col gap-8 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] xl:gap-x-6 xl:gap-y-10">
            <div className="min-w-0 xl:col-span-2">{slots.top}</div>
            <div className="min-w-0">{slots.main}</div>
            <div className="min-w-0">{slots.aside}</div>
            {slots.bottom && <div className="min-w-0 xl:col-span-2">{slots.bottom}</div>}
          </div>
        ) : (
          <div className={cn(layout === "grid-2" ? "grid grid-cols-1 gap-3 md:grid-cols-2 xl:gap-4" : "flex flex-col gap-8 xl:gap-10")}>{children}</div>
        )}
      </div>
    </div>
  )
}
