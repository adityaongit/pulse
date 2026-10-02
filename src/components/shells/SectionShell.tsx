import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { InfoButton, type InfoContent } from "./InfoButton"

export type SectionShellProps = {
  variant: "section" | "card"
  title: string
  info?: InfoContent
  /** A "View all" style link, or any node (e.g. an icon link). */
  action?: { label: string; href: string } | React.ReactNode
  /** Right side of the header: a caption ("vs. 30-day average") or tags. */
  aside?: React.ReactNode
  /** Card only: the whole card is one link; the header then shows only a chevron. */
  href?: string
  /** Heading level; cards default to h3 inside a section, h2 otherwise. */
  level?: 2 | 3
  id?: string
  className?: string
  children: React.ReactNode
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
const isLinkAction = (a: SectionShellProps["action"]): a is { label: string; href: string } =>
  !!a && typeof a === "object" && "href" in a && "label" in a

function ActionLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center gap-0.5 rounded-md text-xs leading-4 font-bold tracking-[0.08em] text-foreground-secondary uppercase transition-[color] duration-150 ease-standard outline-none after:absolute after:-inset-x-2 after:-inset-y-3.5 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {label}
      <ChevronRight aria-hidden className="size-3.5" strokeWidth={2} />
    </Link>
  )
}

/** A titled section or card (spec §4.6). Owns the card padding step at 1280 px. */
export function SectionShell({ variant, title, info, action, aside, href, level, id, className, children }: SectionShellProps) {
  const headingId = `${id ?? slug(title)}-title`
  const actionNode = isLinkAction(action) ? <ActionLink {...action} /> : action

  if (variant === "section") {
    const H = level === 3 ? "h3" : "h2"
    return (
      <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20 min-w-0", className)}>
        <div className="mb-3 flex items-end justify-between gap-3 xl:mb-4">
          <H id={headingId} className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-balance xl:text-2xl">
            {title}
          </H>
          {(aside || actionNode) && (
            <div className="flex shrink-0 items-center gap-3 pb-0.5 text-xs leading-4 font-medium text-muted-foreground">
              {aside}
              {actionNode}
            </div>
          )}
        </div>
        {children}
      </section>
    )
  }

  const H = level === 2 ? "h2" : "h3"
  const header = (
    <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1">
        <H id={headingId} className="min-w-0 text-[13px] leading-4 font-bold tracking-[0.08em] text-balance uppercase">
          {title}
        </H>
        {info && !href && <InfoButton info={info} label={title} variant="card" />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {aside}
        {href ? <ChevronRight aria-hidden className="size-[18px] text-foreground-secondary" strokeWidth={1.75} /> : actionNode}
      </div>
    </div>
  )

  const cardClass = cn("scroll-mt-20 gap-0 py-0 ring-0", className)
  if (href)
    return (
      <Card id={id} className={cardClass}>
        <Link
          href={href}
          aria-labelledby={headingId}
          className="flex-1 rounded-xl p-4 transition-[background-color] duration-150 ease-standard outline-none hover:bg-[color-mix(in_oklch,var(--card),var(--foreground)_4%)] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent xl:p-5"
        >
          {header}
          {children}
        </Link>
      </Card>
    )

  return (
    <Card id={id} aria-labelledby={headingId} role="region" className={cardClass}>
      <div className="min-w-0 p-4 xl:p-5">
        {header}
        {children}
      </div>
    </Card>
  )
}
