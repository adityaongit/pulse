import { Children } from "react"
import { cn } from "@/lib/utils"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import type { InfoContent } from "./InfoButton"
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
  /** Page ground (spec §2.1): Healthspan is near black. */
  ground?: "default" | "healthspan"
  hero?: React.ReactNode
  summary?: React.ReactNode
  insight?: React.ReactNode
  primary?: React.ReactNode
  /** One column; two from 1024 px. An item can span both with `className="lg:col-span-2"`. */
  secondary?: React.ReactNode[]
  footer?: React.ReactNode
}

/** Detail screens (spec §4.6): one dial, one number, then everything that explains it. */
export function DetailShell({ title, subtitle, info, backHref, dateSwitcher, dismiss, ground, hero, summary, insight, primary, secondary, footer }: DetailShellProps) {
  // With no summary, the insight takes the hero's right column on laptop (spec §7.9).
  const side = summary ?? (hero ? insight : null)
  const inHeader = dateSwitcher?.placement === "header"
  return (
    <div data-ground={ground === "healthspan" ? "healthspan" : undefined}>
      <DetailHeader title={title} subtitle={subtitle} info={info} backHref={backHref} dismiss={dismiss} dateTitle={inHeader ? dateSwitcher : undefined} />
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
              {hero && <div className="flex min-w-0 justify-center">{hero}</div>}
              {side && <div className="min-w-0">{side}</div>}
            </div>
          )}
          {(summary || !hero) && insight}
          {primary}
          {secondary && secondary.length > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:gap-4">{Children.toArray(secondary)}</div>
          )}
          {footer}
        </div>
      </div>
    </div>
  )
}
