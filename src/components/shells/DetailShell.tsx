import { Children, cloneElement, isValidElement } from "react"
import { cn } from "@/lib/utils"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import type { InfoContent } from "./InfoButton"
import { COLLAPSE_HERO } from "@/lib/collapse"
import { CollapsingHeader, type HeaderStats } from "./CollapsingHeader"
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher"
import { DetailHeader, type DetailHeaderProps } from "./DetailHeader"
import { CONTENT_COLUMN } from "./PageShell"

export type DetailShellProps = {
  title: string
  subtitle?: string
  info?: InfoContent
  /** DetailHeader's back target when there is no history (Activity: `/strain?d=`). */
  backHref?: string
  /** `placement: "header"` makes the date the header title (Recovery, Strain, Sleep); else the pill sits under the header. */
  dateSwitcher?: DateSwitcherProps
  dismiss?: DetailHeaderProps["dismiss"]
  /** Left-aligned header with an icon before the title (Activity, spec §7.4). */
  align?: DetailHeaderProps["align"]
  titleIcon?: React.ReactNode
  /** Page ground (spec §2.1): Healthspan is WHOOP's darker `#101518`; the collapsed band paints the same ground. */
  ground?: "default" | "healthspan"
  /** The hero component. With `collapse`, it must accept `compact` (or forward it to the component inside). */
  hero?: React.ReactNode
  /** The collapsed header's stats beside the compact hero (docs/design/sticky.md B6). */
  stats?: HeaderStats
  /**
   * Opt in to the sticky hero (spec §4.3a): once the hero scrolls under the header, the header shows
   * `hero` with `compact` and the two stats. Off by default: every other screen pins the plain bar, as WHOOP does.
   */
  collapse?: boolean
  summary?: React.ReactNode
  /**
   * WHOOP's speech-bubble pointer on the summary card, aimed at the dial above it (beside it on laptop)
   * [latest-recovery-1], [latest-strain-1], [latest-sleep-1]. Recovery, Strain and Sleep.
   */
  notch?: boolean
  insight?: React.ReactNode
  primary?: React.ReactNode
  /**
   * One column through tablet; two from 1280 px (D-L3). The page balances the columns with spans on its items:
   * `xl:col-span-2` for a full-width card, `xl:row-span-2` for a tall card the next two stack beside. The grid packs densely.
   */
  secondary?: React.ReactNode[]
  footer?: React.ReactNode
}

/** Detail screens (spec §4.6): one dial, one number, then everything that explains it. */
export function DetailShell({ title, subtitle, info, backHref, dateSwitcher, dismiss, align, titleIcon, ground, hero, stats, collapse, summary, notch, insight, primary, secondary, footer }: DetailShellProps) {
  // With no summary, the insight takes the hero's right column on laptop (spec §7.9).
  const side = summary ?? (hero ? insight : null)
  const inHeader = dateSwitcher?.placement === "header"
  const headerProps = { title, subtitle, info, backHref, dismiss, align, titleIcon, dateTitle: inHeader ? dateSwitcher : undefined }
  // Built here, on the server, so a page's own wrapper hero (a server component) renders its compact form too.
  const compact = collapse && isValidElement<{ compact?: boolean }>(hero) ? cloneElement(hero, { compact: true }) : null
  return (
    <div data-ground={ground === "healthspan" ? "healthspan" : undefined}>
      {compact ? <CollapsingHeader {...headerProps} compact={compact} stats={stats} /> : <DetailHeader {...headerProps} />}
      <div className={CONTENT_COLUMN}>
        <ConnectionBanner className="mb-4 xl:mb-6" />
        {dateSwitcher && !inHeader && (
          <div className="mb-6 flex justify-center">
            <DateSwitcher {...dateSwitcher} />
          </div>
        )}
        <div className="flex flex-col gap-8">
          {(hero || side) && (
            <div className={cn("flex flex-col gap-6", side && "xl:grid xl:grid-cols-[minmax(360px,max-content)_minmax(0,1fr)] xl:items-center xl:gap-8 xl:has-data-[hero-align=start]:items-start")}>
              {hero && (
                // Full-bleed on phone and clipped at the screen edge: a hero's glow (the orb canvas overhangs its
                // 300 px box by 45 px a side) may bleed to the edge but never widens the page (spec §11 M1).
                // A top-aligned hero (Journal Insights) stays in view beside the long list it controls on laptop (D-L7).
                <div
                  {...(compact ? { [COLLAPSE_HERO]: "" } : {})}
                  className="flex min-w-0 justify-center max-md:-mx-4 max-md:overflow-x-clip max-md:px-4 xl:has-data-[hero-align=start]:sticky xl:has-data-[hero-align=start]:top-24"
                >
                  {hero}
                </div>
              )}
              {side && (
                <div className={cn("min-w-0", notch && summary && "relative")}>
                  {notch && summary && (
                    // A 16 px square turned 45°: its upper half shows above the card. The inset light continues the card's top hairline.
                    <span
                      aria-hidden
                      className="absolute -top-2 left-1/2 size-4 -translate-x-1/2 rotate-45 rounded-tl-[3px] bg-card-top shadow-[inset_1px_1px_0_var(--card-edge)] xl:top-1/2 xl:-left-2 xl:translate-x-0 xl:-translate-y-1/2 xl:bg-card xl:shadow-none"
                    />
                  )}
                  {side}
                </div>
              )}
            </div>
          )}
          {(summary || !hero) && insight}
          {primary}
          {secondary && secondary.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-flow-row-dense xl:grid-cols-2 xl:gap-4">{Children.toArray(secondary)}</div>
          )}
          {footer}
        </div>
      </div>
    </div>
  )
}
