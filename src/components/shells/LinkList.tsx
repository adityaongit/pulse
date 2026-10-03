import Link from "next/link"
import { ArrowUpRight, ChevronRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { CARD_MATERIAL } from "@/components/ui/card"
import { SkeletonText } from "@/components/ui/skeleton"
import { CARD_LINK } from "./SectionShell"

export type LinkListRow = {
  label: string
  href: string
  icon?: LucideIcon
  /** Right-aligned, before the chevron: a short caption ("Sep 22 - Sep 28") or a node (a ring and value). */
  aside?: React.ReactNode
  /** A line under the label, sentence case (a score's one-line summary). */
  description?: string
  /** Opens in a new tab with an arrow instead of the chevron (GitHub). */
  external?: boolean
}

/** Groups of rows: one column in reading order, two from 1280 px (More, Reports, their loading shapes). */
/** List-like pages (More, Settings): one centred 640 px column at every width. */
export const MORE_COLUMN = "mx-auto flex w-full max-w-[640px] flex-col gap-6"

export const LIST_GRID = "flex flex-col gap-6 xl:grid xl:grid-cols-2 xl:items-start xl:gap-x-6 xl:gap-y-8"

/** WHOOP's section label over a group of rows [latest-settings-1] (spec §11 F22): 13 px caps, tracking 0.1em. */
export const GROUP_LABEL = "px-1 text-[13px] leading-4 font-bold tracking-[0.1em] text-foreground/85 uppercase"
const ROW = "flex min-h-14 items-center gap-3 px-4 py-2"
const ROW_LABEL = "text-xs leading-4 font-bold tracking-[0.08em] uppercase"

/**
 * WHOOP's settings rows (spec §7.14 v2): a caps group label, then one 56 px card per row with an icon, a caps label
 * and a chevron. `columns` lays the rows out two-up from 1280 px (How Pulse works on More).
 */
export function LinkList({ title, rows, columns, className }: { title: string; rows: LinkListRow[]; columns?: 2; className?: string }) {
  const id = `list-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
  return (
    <section aria-labelledby={id} className={cn("min-w-0 space-y-2", className)}>
      <h2 id={id} className={GROUP_LABEL}>
        {title}
      </h2>
      <ul className={cn("grid gap-2", columns === 2 && "xl:grid-cols-2")}>
        {rows.map((r) => (
          <li key={r.href} className="min-w-0">
            <Link
              href={r.href}
              {...(r.external && { target: "_blank", rel: "noreferrer" })}
              className={cn(CARD_LINK, ROW, "h-full")}
            >
              {r.icon && <r.icon aria-hidden className="size-[22px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />}
              <span className="min-w-0 flex-1">
                <span className={cn(ROW_LABEL, "block text-balance")}>{r.label}</span>
                {r.description && <span className="mt-0.5 block text-[13px] leading-[18px] text-pretty text-muted-foreground">{r.description}</span>}
              </span>
              {typeof r.aside === "string" ? (
                <span className="shrink-0 font-numeric text-xs leading-4 font-medium text-muted-foreground tabular-nums">{r.aside}</span>
              ) : (
                r.aside
              )}
              {r.external ? (
                <ArrowUpRight aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              ) : (
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              )}
              {r.external && <span className="sr-only">(opens in a new tab)</span>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Loading shape (spec §5.19): the real group label and row labels; only asides are bars. */
export function LinkListSkeleton({ title, rows, columns }: { title: string; rows: Omit<LinkListRow, "href" | "aside">[]; columns?: 2 }) {
  return (
    <div aria-hidden className="min-w-0 space-y-2">
      <p className={GROUP_LABEL}>{title}</p>
      <div className={cn("grid gap-2", columns === 2 && "xl:grid-cols-2")}>
        {rows.map((r, i) => (
          <div key={i} className={cn(CARD_MATERIAL, ROW)}>
            {r.icon && <r.icon className="size-[22px] shrink-0 text-foreground-secondary" strokeWidth={1.5} />}
            <span className="min-w-0 flex-1">
              {r.label ? <span className={cn(ROW_LABEL, "block text-balance")}>{r.label}</span> : <SkeletonText className={cn(ROW_LABEL, "w-28")} />}
              {r.description && <span className="mt-0.5 block text-[13px] leading-[18px] text-pretty text-muted-foreground">{r.description}</span>}
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          </div>
        ))}
      </div>
    </div>
  )
}
