import { Children } from "react"
import { ConnectionBanner } from "@/components/metrics/ConnectionBanner"
import type { InfoContent } from "./InfoButton"
import { DateSwitcher, type DateSwitcherProps } from "./DateSwitcher"
import { DetailHeader } from "./DetailHeader"
import { CONTENT_COLUMN } from "./PageShell"

export type DetailShellProps = {
  title: string
  subtitle?: string
  info?: InfoContent
  dateSwitcher?: DateSwitcherProps
  hero?: React.ReactNode
  summary?: React.ReactNode
  insight?: React.ReactNode
  primary?: React.ReactNode
  /** One column; two from 1024 px. An item can span both with `className="lg:col-span-2"`. */
  secondary?: React.ReactNode[]
  footer?: React.ReactNode
}

/** Detail screens (spec §4.5): one dial, one number, then everything that explains it. */
export function DetailShell({ title, subtitle, info, dateSwitcher, hero, summary, insight, primary, secondary, footer }: DetailShellProps) {
  return (
    <>
      <DetailHeader title={title} subtitle={subtitle} info={info} />
      <div className={CONTENT_COLUMN}>
        <ConnectionBanner className="mb-4 xl:mb-6" />
        {dateSwitcher && (
          <div className="mb-6 flex justify-center">
            <DateSwitcher {...dateSwitcher} />
          </div>
        )}
        <div className="flex flex-col gap-8">
          {(hero || summary) && (
            <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[360px_minmax(0,1fr)] xl:items-center xl:gap-8">
              {hero && <div className="flex min-w-0 justify-center">{hero}</div>}
              {summary && <div className="min-w-0">{summary}</div>}
            </div>
          )}
          {insight}
          {primary}
          {secondary && secondary.length > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:gap-4">{Children.toArray(secondary)}</div>
          )}
          {footer}
        </div>
      </div>
    </>
  )
}
